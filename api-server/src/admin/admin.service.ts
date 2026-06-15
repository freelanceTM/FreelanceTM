import { Injectable, NotFoundException, ForbiddenException, BadRequestException, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma, PaymentStatus, DisputeResolution, DisputeStatus, WithdrawalStatus } from '@prisma/client';
import {
  EVENTS,
  PaymentApprovedEvent,
  PaymentRejectedEvent,
  DisputeOpenedEvent,
  DisputeResolvedEvent,
  KycStatusChangedEvent,
  WithdrawalApprovedEvent,
  WithdrawalRejectedEvent,
} from '../events/notification.events';
import { EscrowService } from '../escrow/escrow.service';
import { WithdrawalsService } from '../withdrawals/withdrawals.service';

@Injectable()
export class AdminService {
  private readonly logger = new Logger(AdminService.name);

  constructor(
    private prisma: PrismaService,
    private eventEmitter: EventEmitter2,
    private escrowService: EscrowService,
    private withdrawalsService: WithdrawalsService,
  ) {}

  // GIG MODERATION
  async listGigsForModeration(status = 'pending_review', page = 1, limit = 20) {
    const where: Prisma.GigWhereInput = { status: status as any };
    const [gigs, total] = await Promise.all([
      this.prisma.gig.findMany({ where, skip: (page - 1) * limit, take: limit, orderBy: { createdAt: 'asc' }, include: { seller: { select: { id: true, username: true, displayName: true } }, category: true } }),
      this.prisma.gig.count({ where }),
    ]);
    return { data: gigs, meta: { total, page, limit } };
  }

  async moderateGig(gigId: number, decision: 'approve' | 'reject' | 'ban', reason?: string) {
    const gig = await this.prisma.gig.findUnique({ where: { id: gigId } });
    if (!gig) throw new NotFoundException('Gig not found');

    let newStatus: string = gig.status;
    if (decision === 'approve') newStatus = 'active';
    if (decision === 'reject') newStatus = 'draft';
    if (decision === 'ban') newStatus = 'banned';

    // Determine whether category.gigCount needs adjustment.
    // gigCount tracks active gigs only (consistent with pause/resume in GigsService).
    const wasActive   = gig.status === 'active';
    const becomesActive = newStatus === 'active';
    const countDelta =
      !wasActive && becomesActive ? 1 :  // draft/pending_review → active: +1
       wasActive && !becomesActive ? -1 : // active → banned/draft:       -1
       0;                                  // no change in active-ness

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.gig.update({
        where: { id: gigId },
        data: { status: newStatus },
      });

      if (countDelta !== 0) {
        await tx.category.update({
          where: { id: gig.categoryId },
          data: { gigCount: { increment: countDelta } },
        });
      }

      return updated;
    });
  }

  // REVIEW MODERATION
  async listReviewsForModeration(page = 1, limit = 20) {
    const where: Prisma.ReviewWhereInput = { status: 'pending' };
    const [reviews, total] = await Promise.all([
      this.prisma.review.findMany({ where, skip: (page - 1) * limit, take: limit, orderBy: { createdAt: 'asc' }, include: { author: { select: { username: true } }, target: { select: { username: true } }, gig: { select: { title: true } } } }),
      this.prisma.review.count({ where }),
    ]);
    return { data: reviews, meta: { total, page, limit } };
  }

  async moderateReview(reviewId: number, decision: 'approve' | 'reject') {
    const review = await this.prisma.review.findUnique({ where: { id: reviewId } });
    if (!review) throw new NotFoundException('Review not found');

    const updated = await this.prisma.review.update({
      where: { id: reviewId },
      data: { status: decision === 'approve' ? 'approved' : 'rejected' },
    });

    // S1-2: Trigger rating recalculation only after approval.
    // ReviewsService listens for this event via @OnEvent('review.approved').
    if (decision === 'approve') {
      this.eventEmitter.emit(EVENTS.REVIEW_APPROVED, { reviewId });
    }

    return updated;
  }

  // USER MANAGEMENT
  async banUser(userId: number, reason: string, until?: Date) {
    return this.prisma.user.update({
      where: { id: userId },
      data: { isBanned: true, banReason: reason, bannedUntil: until || null },
    });
  }

  async unbanUser(userId: number) {
    return this.prisma.user.update({
      where: { id: userId },
      data: { isBanned: false, banReason: null, bannedUntil: null },
    });
  }

  // PROMOTE GIG
  async promoteGig(gigId: number, rank: number, until: Date) {
    return this.prisma.gig.update({
      where: { id: gigId },
      data: { isPromoted: true, promotedRank: rank, promotedUntil: until },
    });
  }

  // Payments (TM CELL)
  async listPayments(status?: PaymentStatus, page = 1, limit = 20) {
    const where: Prisma.PaymentWhereInput = {};
    if (status) where.status = status;

    const [payments, total] = await Promise.all([
      this.prisma.payment.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: { user: { select: { id: true, username: true, displayName: true } } },
      }),
      this.prisma.payment.count({ where }),
    ]);
    return { data: payments, meta: { total, page, limit } };
  }

  async approvePayment(paymentId: number, adminUserId: number) {
    // H-2 fix: all three writes are now a single ACID transaction.
    //
    // Root causes fixed:
    //  1. wallet.balanceNano was NEVER credited — funds were silently discarded.
    //  2. TOCTOU race: two concurrent admins could both read status='pending',
    //     both proceed, and double-credit once the wallet update was added.
    //  3. Non-atomic writes: payment.update + transaction.create could
    //     partially succeed, leaving the DB in an inconsistent state.
    //
    // Fix: CAS via updateMany(WHERE status='pending') — count=0 means already
    // processed or not found; wallet.update is inside the same tx so the credit
    // is guaranteed-once or the whole thing rolls back.
    const reviewedAt = new Date();

    const approved = await this.prisma.$transaction(async (tx) => {
      // CAS: atomically mark pending → approved; prevents double-approval race
      const cas = await tx.payment.updateMany({
        where: { id: paymentId, status: 'pending' },
        data: { status: 'approved', reviewedById: adminUserId, reviewedAt },
      });

      if (cas.count === 0) {
        const existing = await tx.payment.findUnique({ where: { id: paymentId } });
        if (!existing) throw new NotFoundException('Payment not found');
        throw new BadRequestException('Payment already processed');
      }

      // Re-fetch so we have all fields (needed for amountManat and event)
      const payment = await tx.payment.findUnique({ where: { id: paymentId } });

      // M-8 fix: bypass IEEE 754 float entirely — use Decimal string arithmetic
      const amountNano = BigInt(new Prisma.Decimal(String(payment!.amountManat)).mul('1000000000').floor().toFixed(0));

      // Create deposit transaction log
      await tx.transaction.create({
        data: {
          userId: payment!.userId,
          type: 'deposit',
          status: 'completed',
          amountNano,
          currency: 'TON',
          metadata: { paymentId, adminUserId, note: 'TM CELL approved' },
        },
      });

      // Credit the user's wallet — this was the missing step (H-2 core fix)
      // wallet.update throws if no wallet exists, rolling back the entire tx
      // so the payment stays 'pending' and the admin gets a clear error.
      await tx.wallet.update({
        where: { userId: payment!.userId },
        data: { balanceNano: { increment: amountNano } },
      });

      return payment!;
    });

    // Emit outside the transaction — side-effect, non-critical
    this.eventEmitter.emit(EVENTS.PAYMENT_APPROVED, {
      paymentId,
      userId: approved.userId,
      amountManat: approved.amountManat.toString(),
    } as PaymentApprovedEvent);

    return approved;
  }

  async rejectPayment(paymentId: number, adminUserId: number, note?: string) {
    const payment = await this.prisma.payment.findUnique({ where: { id: paymentId } });
    if (!payment) throw new NotFoundException('Payment not found');
    if (payment.status !== 'pending') throw new BadRequestException('Payment already processed');

    const updated = await this.prisma.payment.update({
      where: { id: paymentId },
      data: { status: 'rejected', reviewedById: adminUserId, reviewedAt: new Date(), note },
    });

    this.eventEmitter.emit(EVENTS.PAYMENT_REJECTED, {
      paymentId,
      userId: payment.userId,
      amountManat: payment.amountManat.toString(),
      reason: note,
    } as PaymentRejectedEvent);

    return updated;
  }

  // Disputes (Arbitration)
  async listDisputes(status?: DisputeStatus, page = 1, limit = 20) {
    const where: Prisma.DisputeWhereInput = {};
    if (status) where.status = status;

    const [disputes, total] = await Promise.all([
      this.prisma.dispute.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          order: { include: { gig: { select: { title: true } }, buyer: { select: { username: true } }, seller: { select: { username: true } } } },
          initiator: { select: { username: true, displayName: true } },
        },
      }),
      this.prisma.dispute.count({ where }),
    ]);
    return { data: disputes, meta: { total, page, limit } };
  }

  async resolveDispute(disputeId: number, adminUserId: number, resolution: DisputeResolution, reason?: string) {
    const dispute = await this.prisma.dispute.findUnique({
      where: { id: disputeId },
      include: { order: true },
    });
    if (!dispute) throw new NotFoundException('Dispute not found');

    // F-3 STEP 1 — DISPUTE CAS CLAIM (cross-process single-entry + replay block).
    //  "First successful write wins execution rights": only one caller can move
    //  the dispute open/resolving → resolved. A concurrent or replayed call gets
    //  count=0 and STOPS before any escrow / on-chain side effect.
    const claim = await this.prisma.dispute.updateMany({
      where: { id: disputeId, status: { in: ['open', 'resolving'] } },
      data: {
        status: 'resolved',
        resolution,
        resolvedById: adminUserId,
        resolvedAt: new Date(),
        evidence: { ...(dispute.evidence as object || {}), adminReason: reason },
      },
    });
    if (claim.count === 0) {
      throw new BadRequestException('Dispute already resolved (or being resolved by another request)');
    }

    const updated = await this.prisma.dispute.findUnique({ where: { id: disputeId } });

    // ── S6-1: Dispute Resolution Escrow Integration ──────────────────────────
    //
    // Previous bug: resolveDispute only updated order.status and Dispute.status
    // but NEVER moved any money. The escrow funds stayed locked forever.
    //
    // Fix:
    //   buyer_wins  → refundEscrow(orderId, adminId)
    //                 Credits the full escrow amount to the buyer's wallet.
    //                 Sets order.status = 'cancelled' internally via CAS.
    //
    //   seller_wins → releaseEscrow(orderId, dispute.order.buyerId)
    //                 Releases the escrowed amount (minus platform fee) to
    //                 the seller's wallet. Passing buyerId bypasses the
    //                 "caller must be the buyer" ownership check — the admin
    //                 is overriding the normal buyer-confirm flow.
    //                 Sets order.status = 'completed' internally via CAS.
    //
    //   split       → no automatic fund movement; admin handles manually
    //                 (future: implement split payout in EscrowService).
    //
    // Both escrowService methods are fully ACID-safe (atomic CAS +
    // $transaction), idempotent, and emit the appropriate ESCROW_RELEASED /
    // ESCROW_REFUNDED events which Telegram notifications and the webhook
    // dispatcher (S6-2) will pick up automatically.
    //
    // Order status is now owned by the escrow CAS — we no longer do a
    // separate order.update here to avoid double-write conflicts.

    //  F-3 FORBIDDEN #4 — NO silent fallback completion without payment.
    //  If escrow movement fails, we let the error propagate. The order's money
    //  state is owned by the escrow CAS; we never flip order.status to
    //  completed/cancelled without the corresponding fund movement.
    if (resolution === 'buyer_wins') {
      // refundEscrow: atomic CAS + $transaction; credits buyer, sets cancelled.
      await this.escrowService.refundEscrow(dispute.orderId, adminUserId);
    } else if (resolution === 'seller_wins') {
      // adminReleaseEscrow: accepts delivered|disputed; F-3-hardened (lock +
      // idempotency + on-chain after commit). Releases net to seller, completes.
      await this.escrowService.adminReleaseEscrow(dispute.orderId, adminUserId);
    } else {
      // split / none: no automatic fund movement implemented. We do NOT touch
      // order.status (would strand funds). Admin must resolve funds manually.
      this.logger.warn(
        `[DISPUTE ${disputeId}] resolution='${resolution}' has no automatic escrow movement — ` +
        `order ${dispute.orderId} left for manual fund handling.`,
      );
    }

    this.eventEmitter.emit(EVENTS.DISPUTE_RESOLVED, {
      disputeId,
      orderId: dispute.orderId,
      resolution,
      resolverNote: reason,
    } as DisputeResolvedEvent);

    return updated;
  }

  // Users verification (KYC)
  async listUsersKyc(status?: 'none' | 'pending' | 'approved' | 'rejected', page = 1, limit = 20) {
    const where: Prisma.UserWhereInput = {};
    if (status) where.kycStatus = status;

    const [users, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.user.count({ where }),
    ]);
    return { data: users, meta: { total, page, limit } };
  }

  async verifyUser(userId: number, status: 'approved' | 'rejected') {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');

    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: {
        isVerified: status === 'approved',
        kycStatus: status,
      },
    });

    this.eventEmitter.emit(EVENTS.KYC_STATUS_CHANGED, {
      userId,
      status,
    } as KycStatusChangedEvent);

    return updated;
  }

  // Stats
  async getStats() {
    const [
      totalUsers,
      totalFreelancers,
      totalOrders,
      pendingOrders,
      activeOrders,
      totalGigs,
      pendingPayments,
      totalDisputes,
      openDisputes,
      pendingReviews,
      pendingGigs,
      pendingWithdrawals,
      financialStats,
    ] = await Promise.all([
      this.prisma.user.count(),
      this.prisma.user.count({ where: { role: { in: ['freelancer', 'both'] } } }),
      this.prisma.order.count(),
      this.prisma.order.count({ where: { status: 'pending' } }),
      this.prisma.order.count({ where: { status: 'active' } }),
      this.prisma.gig.count({ where: { status: 'active' } }),
      this.prisma.payment.count({ where: { status: 'pending' } }),
      this.prisma.dispute.count(),
      this.prisma.dispute.count({ where: { status: { in: ['open', 'resolving'] } } }),
      this.prisma.review.count({ where: { status: 'pending' } }),
      this.prisma.gig.count({ where: { status: 'pending_review' } }),
      this.prisma.withdrawalRequest.count({ where: { status: 'pending' } }),
      // Financial aggregates via raw SQL — BigInt-safe (returned as TEXT)
      this.prisma.$queryRaw<Array<{
        total_balance: string;
        escrow_locked: string;
        fee_revenue: string;
      }>>`
        SELECT
          COALESCE((SELECT SUM("balanceNano")::TEXT FROM wallets), '0') AS total_balance,
          COALESCE((
            SELECT SUM(FLOOR("totalPrice" * 1000000000))::TEXT
            FROM orders
            WHERE status IN ('active', 'delivered', 'disputed')
          ), '0') AS escrow_locked,
          COALESCE((
            SELECT SUM("amountNano")::TEXT
            FROM transactions
            WHERE type = 'fee' AND status = 'completed'
          ), '0') AS fee_revenue
      `,
    ]);

    const fin = financialStats[0] ?? { total_balance: '0', escrow_locked: '0', fee_revenue: '0' };

    return {
      totalUsers,
      totalFreelancers,
      totalOrders,
      pendingOrders,
      activeOrders,
      totalGigs,
      pendingPayments,
      totalDisputes,
      openDisputes,
      pendingReviews,
      pendingGigs,
      pendingWithdrawals,
      totalBalanceNano: fin.total_balance,
      escrowLockedNano: fin.escrow_locked,
      platformFeeRevenueNano: fin.fee_revenue,
    };
  }

  // ─── Withdrawals ──────────────────────────────────────────────────────────

  async listWithdrawals(status?: WithdrawalStatus, page = 1, limit = 20) {
    const where: Prisma.WithdrawalRequestWhereInput = {};
    if (status) where.status = status;

    const [withdrawals, total] = await Promise.all([
      this.prisma.withdrawalRequest.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          user: {
            select: {
              id: true,
              username: true,
              displayName: true,
              telegramChatId: true,
              wallet: { select: { balanceNano: true } },
            },
          },
        },
      }),
      this.prisma.withdrawalRequest.count({ where }),
    ]);

    return {
      data: withdrawals.map((w) => ({
        ...w,
        amountNano: w.amountNano.toString(),
        user: {
          ...w.user,
          telegramChatId: w.user.telegramChatId?.toString() ?? null,
          walletBalanceNano: w.user.wallet?.balanceNano?.toString() ?? '0',
        },
      })),
      meta: { total, page, limit },
    };
  }

  /**
   * F-1 fix — admin approve now DELEGATES to the canonical WithdrawalsService
   * (Path A). The balance was already reserved at request time; this path
   * therefore must NOT touch the wallet again (the old code double-debited).
   *
   * WithdrawalsService.approve() performs the CAS status transition + on-chain
   * payout + ledger finalization. We only re-emit the admin notification event
   * afterward to preserve existing notification behavior.
   */
  async approveWithdrawal(withdrawalId: number, adminId: number) {
    const updated = await this.withdrawalsService.approve(adminId, withdrawalId);

    const w = await this.prisma.withdrawalRequest.findUnique({ where: { id: withdrawalId } });
    if (w) {
      this.eventEmitter.emit(EVENTS.WITHDRAWAL_APPROVED, {
        withdrawalId,
        userId: w.userId,
        amountNano: w.amountNano.toString(),
      } as WithdrawalApprovedEvent);
    }

    return updated;
  }

  /**
   * F-1 fix — admin reject DELEGATES to WithdrawalsService.reject(), which
   * refunds the reserved balance exactly once (CAS-guarded). No second balance
   * mutation here.
   */
  async rejectWithdrawal(withdrawalId: number, adminId: number, note?: string) {
    const updated = await this.withdrawalsService.reject(adminId, withdrawalId, note);

    const w = await this.prisma.withdrawalRequest.findUnique({ where: { id: withdrawalId } });
    if (w) {
      this.eventEmitter.emit(EVENTS.WITHDRAWAL_REJECTED, {
        withdrawalId,
        userId: w.userId,
        amountNano: w.amountNano.toString(),
        note,
      } as WithdrawalRejectedEvent);
    }

    return updated;
  }

  // ─── User Management ──────────────────────────────────────────────────────

  async listUsers(page = 1, limit = 20, search?: string) {
    const where: Prisma.UserWhereInput = {};
    if (search) {
      where.OR = [
        { username: { contains: search, mode: 'insensitive' } },
        { displayName: { contains: search, mode: 'insensitive' } },
      ];
    }

    const [users, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          username: true,
          displayName: true,
          role: true,
          isBanned: true,
          banReason: true,
          isVerified: true,
          kycStatus: true,
          createdAt: true,
          lastActiveAt: true,
          completedOrders: true,
          wallet: { select: { balanceNano: true } },
        },
      }),
      this.prisma.user.count({ where }),
    ]);

    return {
      data: users.map((u) => ({
        ...u,
        walletBalanceNano: u.wallet?.balanceNano?.toString() ?? '0',
        wallet: undefined,
      })),
      meta: { total, page, limit },
    };
  }

  // ─── Order Messages (for dispute chat history) ────────────────────────────

  async getOrderMessages(orderId: number) {
    const order = await this.prisma.order.findUnique({ where: { id: orderId } });
    if (!order) throw new NotFoundException('Order not found');

    const messages = await this.prisma.message.findMany({
      where: { orderId },
      orderBy: { createdAt: 'asc' },
      include: {
        sender: { select: { id: true, username: true, displayName: true, avatarUrl: true } },
      },
    });

    return { data: messages };
  }

  // ─── Platform Config Management ───────────────────────────────────────────

  /**
   * Returns all platform config key-value pairs.
   *
   * The Config table stores dynamic platform settings that can be changed
   * without redeployment:
   *   platformFeePercent  — commission % deducted on escrow release (default 20)
   *   maintenanceMode     — "true" to put platform in read-only maintenance mode
   *   maxWithdrawalNano   — per-request withdrawal cap in nanoTON
   *   minWithdrawalNano   — minimum withdrawal amount in nanoTON
   *   referralBonusNano   — override referral bonus (default: hard-coded 0.5 TON)
   */
  async getConfig() {
    return this.prisma.config.findMany({ orderBy: { key: 'asc' } });
  }

  /**
   * Upserts a platform config value by key.
   * Creates the row if it doesn't exist; updates `value` if it does.
   *
   * Validation:
   *  - platformFeePercent must parse as integer 0–100
   *  - Keys with "Nano" suffix must parse as non-negative integers
   *  - maintenanceMode must be "true" or "false"
   */
  async setConfig(key: string, value: string): Promise<object> {
    const trimmedKey   = key.trim();
    const trimmedValue = value.trim();

    // Input validation by key
    if (trimmedKey === 'platformFeePercent') {
      const n = parseInt(trimmedValue, 10);
      if (isNaN(n) || n < 0 || n > 100) {
        throw new BadRequestException('platformFeePercent must be an integer between 0 and 100');
      }
    } else if (trimmedKey.endsWith('Nano')) {
      let n: bigint;
      try { n = BigInt(trimmedValue); } catch {
        throw new BadRequestException(`${trimmedKey} must be a valid integer string`);
      }
      if (n < 0n) throw new BadRequestException(`${trimmedKey} must be a non-negative integer`);
    } else if (trimmedKey === 'maintenanceMode') {
      if (trimmedValue !== 'true' && trimmedValue !== 'false') {
        throw new BadRequestException('maintenanceMode must be "true" or "false"');
      }
    }

    return this.prisma.config.upsert({
      where: { key: trimmedKey },
      update: { value: trimmedValue, updatedAt: new Date() },
      create: { key: trimmedKey, value: trimmedValue },
    });
  }
}
