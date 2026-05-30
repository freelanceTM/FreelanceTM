import { Injectable, NotFoundException, ForbiddenException, BadRequestException, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma, PaymentStatus, DisputeResolution, DisputeStatus } from '@prisma/client';
import {
  EVENTS,
  PaymentApprovedEvent,
  PaymentRejectedEvent,
  DisputeOpenedEvent,
  DisputeResolvedEvent,
  KycStatusChangedEvent,
} from '../events/notification.events';
import { EscrowService } from '../escrow/escrow.service';

@Injectable()
export class AdminService {
  private readonly logger = new Logger(AdminService.name);

  constructor(
    private prisma: PrismaService,
    private eventEmitter: EventEmitter2,
    private escrowService: EscrowService,
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

    let status: any = gig.status;
    if (decision === 'approve') status = 'active';
    if (decision === 'reject') status = 'draft';
    if (decision === 'ban') status = 'banned';

    return this.prisma.gig.update({
      where: { id: gigId },
      data: { status, ...(reason ? {} : {}) },
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
    if (dispute.status !== 'open' && dispute.status !== 'resolving') {
      throw new BadRequestException('Dispute already resolved');
    }

    const updated = await this.prisma.dispute.update({
      where: { id: disputeId },
      data: {
        status: 'resolved',
        resolution,
        resolvedById: adminUserId,
        resolvedAt: new Date(),
        evidence: { ...(dispute.evidence as object || {}), adminReason: reason },
      },
    });

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

    if (resolution === 'buyer_wins') {
      try {
        await this.escrowService.refundEscrow(dispute.orderId, adminUserId);
      } catch (err: any) {
        // Log and continue — the Dispute is still marked resolved so the
        // admin can see it, and the error is surfaced for manual follow-up.
        this.logger.error(
          `[DISPUTE ${disputeId}] buyer_wins escrow refund failed: ${err.message}`,
          err.stack,
        );
        // Fall back: at least cancel the order so it's not stuck in 'disputed'
        await this.prisma.order.update({
          where: { id: dispute.orderId },
          data: { status: 'cancelled' },
        }).catch(() => {});
      }
    } else if (resolution === 'seller_wins') {
      try {
        // Pass the buyer's ID to satisfy the ownership check inside releaseEscrow.
        // The admin is acting on behalf of the buyer by overriding the dispute.
        await this.escrowService.releaseEscrow(dispute.orderId, dispute.order.buyerId);
      } catch (err: any) {
        this.logger.error(
          `[DISPUTE ${disputeId}] seller_wins escrow release failed: ${err.message}`,
          err.stack,
        );
        // Fall back: mark order completed so it's not stuck in 'disputed'
        await this.prisma.order.update({
          where: { id: dispute.orderId },
          data: { status: 'completed' },
        }).catch(() => {});
      }
    } else {
      // split or other: no automatic escrow movement, admin resolves manually
      await this.prisma.order.update({
        where: { id: dispute.orderId },
        data: { status: 'cancelled' },
      });
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
    ]);

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
    };
  }
}
