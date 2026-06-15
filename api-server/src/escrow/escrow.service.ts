import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaService } from '../prisma/prisma.service';
import { TonContractService } from '../ton/ton-contract.service';
import { OrderGuardService } from '../common/order-guard/order-guard.service';
import { Prisma, TonEventType } from '@prisma/client';
import {
  EVENTS,
  EscrowReleasedEvent,
  EscrowRefundedEvent,
} from '../events/notification.events';

@Injectable()
export class EscrowService {
  private readonly logger = new Logger(EscrowService.name);

  constructor(
    private prisma: PrismaService,
    private eventEmitter: EventEmitter2,
    private tonContract: TonContractService,
    private orderGuard: OrderGuardService,
  ) {}

  /**
   * Creates an escrow record for an order and transitions it to 'active'.
   *
   * @param orderId  - The order to escrow.
   * @param adminId  - Reserved for future admin-initiated flows (currently unused).
   * @param callerId - The authenticated user making the HTTP request.
   *                   When supplied, must match order.buyerId (buyer-only action).
   *                   Omit only for trusted internal calls (e.g. from OrdersService).
   *
   * The three DB writes (order update, transaction record, TON event) are
   * executed inside a single Prisma interactive transaction.  The escrow-
   * address uniqueness guard is re-checked *inside* the transaction so two
   * concurrent requests cannot both slip through the initial check.
   */
  async createEscrow(orderId: number, adminId?: number, callerId?: number) {
    // ── 1. Load order + ownership / idempotency pre-flight ───────────────────
    const order = await this.prisma.order.findUnique({ where: { id: orderId } });
    if (!order) throw new NotFoundException('Order not found');

    if (callerId !== undefined && order.buyerId !== callerId) {
      this.logger.warn(
        `createEscrow: caller ${callerId} is not the buyer of order ${orderId} (buyer=${order.buyerId})`,
      );
      throw new ForbiddenException('Only the buyer can create an escrow for this order');
    }
    if (order.escrowAddress) {
      throw new BadRequestException('Escrow already created for this order');
    }

    // ── 2. Atomic DB writes (F-4 A2: shared with the order-creation tx path) ─
    const updated = await this.prisma.$transaction((tx) =>
      this.createEscrowWrites(tx, orderId),
    );

    // ── 3. Best-effort on-chain settlement AFTER commit (non-transactional) ─
    await this.settleEscrowOnChain(orderId);

    this.logger.log(`Escrow created — order: ${orderId}, buyer: ${order.buyerId}`);
    return this.mapOrder(updated);
  }

  /**
   * F-4 (Option A2) — DB-ONLY escrow creation, executed INSIDE a caller-provided
   * transaction so order creation and escrow creation are ATOMIC:
   *   ORDER EXISTS ⇔ ESCROW EXISTS.
   *
   * On-chain settlement is intentionally deferred to settleEscrowOnChain(),
   * called by the caller AFTER the transaction commits (blockchain is not
   * transactional). The escrowAddress starts as a simulated marker and is
   * upgraded to the real contract address by settleEscrowOnChain() on success.
   *
   * Re-checks escrowAddress inside the tx to keep the concurrency guard.
   */
  async createEscrowWrites(tx: Prisma.TransactionClient, orderId: number) {
    const order = await tx.order.findUnique({ where: { id: orderId } });
    if (!order) throw new NotFoundException('Order not found');
    if (order.escrowAddress) {
      throw new BadRequestException('Escrow already created for this order');
    }

    const amountNano = BigInt(
      new Prisma.Decimal(String(order.totalPrice)).mul('1000000000').floor().toFixed(0),
    );
    const escrowAddress = `EQ_SIM_${orderId}_${Date.now()}`;

    const updatedOrder = await tx.order.update({
      where: { id: orderId },
      data: { escrowAddress, status: 'active' },
      include: { buyer: true, seller: true, gig: true },
    });

    await tx.transaction.create({
      data: {
        userId: order.buyerId,
        type: 'escrow_create',
        status: 'completed',
        amountNano,
        currency: 'TON',
        metadata: { orderId, escrowAddress },
      },
    });

    await tx.tonEvent.create({
      data: {
        contractAddress: escrowAddress,
        eventType: TonEventType.escrow_created,
        payload: { orderId, amountNano: amountNano.toString() },
      },
    });

    return updatedOrder;
  }

  /**
   * F-4 (Option A2) — best-effort on-chain escrow settlement, run AFTER the DB
   * transaction commits. Never throws (blockchain is non-transactional and
   * secondary to the DB source of truth). If the on-chain order is created, the
   * simulated escrowAddress is upgraded to the real contract address so that
   * later release/refund perform their on-chain legs.
   */
  async settleEscrowOnChain(orderId: number): Promise<void> {
    try {
      const order = await this.prisma.order.findUnique({
        where: { id: orderId },
        include: {
          buyer: { include: { wallet: true } },
          seller: { include: { wallet: true } },
        },
      });
      if (!order || !order.escrowAddress || !order.escrowAddress.startsWith('EQ_SIM')) {
        return; // no escrow, or already settled on a real contract address
      }
      if (
        !this.tonContract.isConfigured() ||
        !order.buyer.wallet?.address ||
        !order.seller.wallet?.address
      ) {
        return; // on-chain not available — escrow remains simulated (valid state)
      }

      const amountNano = BigInt(
        new Prisma.Decimal(String(order.totalPrice)).mul('1000000000').floor().toFixed(0),
      );
      const tx = await this.tonContract.createOrder(
        order.id,
        order.buyer.wallet.address,
        order.seller.wallet.address,
        amountNano,
      );
      this.logger.log(`On-chain escrow created for order ${orderId}, seqno: ${tx?.seqno}`);

      const realAddr = process.env.ESCROW_CONTRACT_ADDRESS;
      if (realAddr) {
        await this.prisma.order.update({
          where: { id: orderId },
          data: { escrowAddress: realAddr },
        });
      }
    } catch (err: any) {
      this.logger.warn(
        `settleEscrowOnChain failed for order ${orderId} (escrow remains simulated): ${err.message}`,
      );
    }
  }

  /**
   * Releases escrowed funds to the seller after the buyer confirms delivery.
   *
   * S1-1 Platform Fee Engine:
   *   On each release, the platform deducts a configurable commission before
   *   crediting the seller.  The fee percentage is read from the Config table
   *   (key: 'platformFeePercent', default: 20).  Both the seller net credit
   *   and the fee are recorded as separate immutable Transaction rows so the
   *   ledger always balances.  All arithmetic uses BigInt — no floats touch
   *   money values (M-8 fix preserved).
   *
   * Double-spend protection (C-3):
   *   All writes are wrapped in a single Prisma interactive transaction.
   *   The order status transition uses a compare-and-swap (CAS) via `updateMany`
   *   with the expected prior state (`status: 'delivered'`) in the WHERE clause.
   *
   *   PostgreSQL acquires a row-level exclusive lock during the UPDATE. Under
   *   two concurrent releaseEscrow calls that both pass the pre-check above:
   *     • Request A enters the tx, gets the lock → WHERE matches → count=1 → commits.
   *     • Request B waits for A's lock; A has committed `status='completed'`,
   *       so B's WHERE finds 0 rows → count=0 → throws → full rollback of all
   *       writes (status, wallet credit, ledger records, stats, TON event).
   *
   *   The blockchain call intentionally lives OUTSIDE the transaction — it is
   *   best-effort and non-transactional by nature. The EventEmitter notification
   *   also fires outside so it is only triggered after a successful DB commit.
   */
  async releaseEscrow(orderId: number, userId: number) {
    // SPEC #2 §4 STEP 4 — CRITICAL SECTION.
    //  Defense-in-depth on top of the existing DB-level CAS:
    //   • withLock serializes concurrent releases for this order in-process.
    //   • assertNotProcessed blocks a replay if an 'escrow_release' ledger
    //     entry for this order already exists (idempotency).
    return this.orderGuard.withLock(orderId, async () => {
      await this.orderGuard.assertNotProcessed(orderId, 'ESCROW_RELEASE');
      return this.releaseEscrowInner(orderId, userId);
    });
  }

  private async releaseEscrowInner(orderId: number, userId: number) {
    // ── 1. Load order for pre-flight validation (read-only, outside tx) ─────
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: {
        buyer: { include: { wallet: true } },
        seller: { include: { wallet: true } },
      },
    });

    if (!order) throw new NotFoundException('Order not found');
    if (order.buyerId !== userId) {
      throw new ForbiddenException('Only the buyer can release escrow for this order');
    }
    if (order.status !== 'delivered') {
      throw new BadRequestException(
        `Order must be in 'delivered' state to release escrow (current: '${order.status}')`,
      );
    }
    if (!order.seller.wallet) {
      throw new BadRequestException(
        'Seller does not have a custodial wallet — cannot credit funds',
      );
    }

    // ── S1-1: Read platform fee config (outside tx — read-only) ─────────────
    //  Key 'platformFeePercent' in Config table; defaults to 20 if absent.
    //  Value is clamped to [0, 100] to guard against misconfiguration.
    const feeConfig = await this.prisma.config.findUnique({
      where: { key: 'platformFeePercent' },
    });
    const feePercent = feeConfig
      ? Math.max(0, Math.min(100, parseInt(feeConfig.value, 10) || 0))
      : 20;

    // M-8 fix: bypass IEEE 754 float entirely — use Decimal string arithmetic
    const amountNano = BigInt(new Prisma.Decimal(String(order.totalPrice)).mul('1000000000').floor().toFixed(0));

    // S1-1: Compute fee and seller net using pure BigInt arithmetic — no floats
    //  feeNano uses integer division (truncates toward zero), which is the
    //  standard for financial fee calculations (platform always gets the floor).
    const feeNano = (amountNano * BigInt(feePercent)) / 100n;
    const sellerNet = amountNano - feeNano;

    // ── 2. Best-effort on-chain release (outside tx — blockchain is not
    //       transactional; DB state is the source of truth) ─────────────────
    //  F-9: capture the on-chain outcome as a deterministic settlement verdict
    //  recorded on the escrow_release ledger row (no schema change).
    let settlement = this.initialSettlement(order.escrowAddress);
    if (
      this.tonContract.isConfigured() &&
      order.escrowAddress &&
      !order.escrowAddress.startsWith('EQ_SIM')
    ) {
      try {
        await this.tonContract.resolveDispute(orderId, 1, 10000); // 1 = release to seller
        this.logger.log(`On-chain escrow released for order ${orderId}`);
        settlement = { state: 'success', attempts: 1, updatedAt: new Date().toISOString() };
      } catch (err) {
        this.logger.warn(
          `On-chain release failed for order ${orderId} (DB release will still proceed): ${err.message}`,
        );
        settlement = { state: 'failed', attempts: 1, updatedAt: new Date().toISOString() };
      }
    }

    // ── 3. ACID transaction — all writes share one boundary ──────────────────
    const updated = await this.prisma.$transaction(async (tx) => {
      // ── 3a. Compare-and-swap: delivered → completed ──────────────────────
      //
      //  This is the TOCTOU guard. Only one concurrent transaction can match
      //  `status='delivered'` and advance the row — the loser gets count=0.
      const swapResult = await tx.order.updateMany({
        where: { id: orderId, status: 'delivered' },
        data: { status: 'completed', completedAt: new Date() },
      });

      if (swapResult.count === 0) {
        this.logger.warn(
          `[CAS] releaseEscrow failed for order ${orderId} — status was no longer 'delivered'. ` +
          `Possible concurrent release by user ${userId}.`,
        );
        throw new BadRequestException(
          'Escrow release failed: order is no longer in delivered state. ' +
          'It may have already been completed by a concurrent request.',
        );
      }

      // ── 3b. Fetch the updated order for the response payload ─────────────
      const updatedOrder = await tx.order.findUnique({
        where: { id: orderId },
        include: { buyer: true, seller: true, gig: true },
      });

      // ── 3c. Credit seller's net amount (gross minus platform fee) ─────────
      //  S1-1: seller receives sellerNet, not the full amountNano
      await tx.wallet.update({
        where: { userId: order.sellerId },
        data: { balanceNano: { increment: sellerNet } },
      });

      // ── 3d. Immutable escrow_release ledger entry (seller net) ────────────
      await tx.transaction.create({
        data: {
          userId: order.sellerId,
          type: 'escrow_release',
          status: 'completed',
          amountNano: sellerNet,
          currency: 'TON',
          metadata: {
            orderId,
            escrowAddress: order.escrowAddress,
            grossAmountNano: amountNano.toString(),
            feeNano: feeNano.toString(),
            feePercent,
            settlement, // F-9: on-chain settlement verdict
          },
        },
      });

      // ── 3e. Platform fee ledger entry (only when fee > 0) ─────────────────
      //  S1-1: records the platform's commission as a separate 'fee' transaction.
      //  userId is the seller — the fee is deducted from seller proceeds.
      if (feeNano > 0n) {
        await tx.transaction.create({
          data: {
            userId: order.sellerId,
            type: 'fee',
            status: 'completed',
            amountNano: feeNano,
            currency: 'TON',
            metadata: {
              orderId,
              feePercent,
              description: 'Platform commission',
            },
          },
        });
      }

      // ── 3f. Seller reputation / stats counter ─────────────────────────────
      await tx.user.update({
        where: { id: order.sellerId },
        data: { completedOrders: { increment: 1 } },
      });

      // ── 3g. TON event log for the indexer ────────────────────────────────
      await tx.tonEvent.create({
        data: {
          contractAddress: order.escrowAddress,
          eventType: TonEventType.escrow_confirmed,
          payload: { orderId },
        },
      });

      return updatedOrder;
    }); // ← entire block rolls back if any step throws

    // ── 4. Post-commit side effects (fired only after successful DB commit) ──
    this.eventEmitter.emit(EVENTS.ESCROW_RELEASED, {
      orderId,
      sellerId: order.sellerId,
      amountNano: sellerNet.toString(),
    } as EscrowReleasedEvent);

    this.logger.log(
      `[ESCROW] Released — order ${orderId}, seller ${order.sellerId}, ` +
      `gross ${amountNano} nano, fee ${feeNano} nano (${feePercent}%), ` +
      `net ${sellerNet} nano, buyer ${userId}`,
    );

    // F-11 observability hook (read-only log; no logic change)
    this.logger.log(
      `[F11-OBSERV] escrow_release orderId=${orderId} settlement=${settlement.state}`,
    );

    return this.mapOrder(updated);
  }

  /**
   * Sprint 6 — Admin-initiated escrow release (dispute ruled for seller).
   *
   * Mirrors releaseEscrow() exactly, with two differences:
   *   1. No buyer ownership check — the admin is acting on behalf of the buyer
   *      after overriding the normal buyer-confirm flow via dispute resolution.
   *   2. CAS accepts both 'delivered' AND 'disputed' order states — a disputed
   *      order is NOT in 'delivered' state, so the normal releaseEscrow() CAS
   *      would always fail (count=0) for disputed orders.
   *
   * Atomicity / concurrency guarantees are identical to releaseEscrow():
   *   • Single $transaction boundary for all four DB writes.
   *   • CAS guards against double-release: only one concurrent call can flip
   *     the order from (delivered|disputed) → completed.
   *
   * Called by AdminService.resolveDispute() when resolution === 'seller_wins'.
   */
  async adminReleaseEscrow(orderId: number, adminId: number) {
    // F-3 fix — single-entry execution rights:
    //   • withLock serializes concurrent admin releases for this order (in-proc),
    //   • assertNotProcessed blocks replay if an 'escrow_release' ledger entry
    //     already exists for this order (cross-call idempotency),
    //   • on-chain is moved to AFTER the atomic DB commit (see inner method).
    return this.orderGuard.withLock(orderId, async () => {
      await this.orderGuard.assertNotProcessed(orderId, 'ESCROW_RELEASE');
      return this.adminReleaseEscrowInner(orderId, adminId);
    });
  }

  private async adminReleaseEscrowInner(orderId: number, adminId: number) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: {
        buyer: { include: { wallet: true } },
        seller: { include: { wallet: true } },
      },
    });
    if (!order) throw new NotFoundException('Order not found');

    if (!['delivered', 'disputed'].includes(order.status)) {
      throw new BadRequestException(
        `adminReleaseEscrow: order ${orderId} is in '${order.status}' state — ` +
        `expected 'delivered' or 'disputed'`,
      );
    }
    if (!order.seller.wallet) {
      throw new BadRequestException(
        'Seller does not have a custodial wallet — cannot credit funds',
      );
    }

    const feeConfig = await this.prisma.config.findUnique({ where: { key: 'platformFeePercent' } });
    const feePercent = feeConfig
      ? Math.max(0, Math.min(100, parseInt(feeConfig.value, 10) || 0))
      : 20;

    const amountNano = BigInt(new Prisma.Decimal(String(order.totalPrice)).mul('1000000000').floor().toFixed(0));
    const feeNano    = (amountNano * BigInt(feePercent)) / 100n;
    const sellerNet  = amountNano - feeNano;

    // ── DB FINALIZATION (atomic claim + credit) ──────────────────────────────
    //  The order CAS is the order-level lock: only one tx can move
    //  delivered/disputed → completed. wallet credit + ledger share the same
    //  $transaction so a crash cannot leave an order completed-but-unpaid.
    const updated = await this.prisma.$transaction(async (tx) => {
      const cas = await tx.order.updateMany({
        where: { id: orderId, status: { in: ['delivered', 'disputed'] } },
        data: { status: 'completed', completedAt: new Date() },
      });
      if (cas.count === 0) {
        const existing = await tx.order.findUnique({ where: { id: orderId } });
        throw new BadRequestException(
          `adminReleaseEscrow CAS failed: order ${orderId} is now in '${existing?.status}' state.`,
        );
      }

      const updatedOrder = await tx.order.findUnique({
        where: { id: orderId },
        include: { buyer: true, seller: true, gig: true },
      });

      await tx.wallet.update({
        where: { userId: order.sellerId },
        data: { balanceNano: { increment: sellerNet } },
      });

      await tx.transaction.create({
        data: {
          userId: order.sellerId,
          type: 'escrow_release',
          status: 'completed',
          amountNano: sellerNet,
          currency: 'TON',
          // F-9: on-chain runs AFTER commit here, so settlement starts as
          // 'pending' (or 'not_required' for SIM) and is finalized below.
          metadata: { orderId, byAdmin: adminId, grossAmountNano: amountNano.toString(), feeNano: feeNano.toString(), feePercent, settlement: this.initialSettlement(order.escrowAddress) },
        },
      });

      if (feeNano > 0n) {
        await tx.transaction.create({
          data: {
            userId: order.sellerId,
            type: 'fee',
            status: 'completed',
            amountNano: feeNano,
            currency: 'TON',
            metadata: { orderId, feePercent, byAdmin: adminId, description: 'Platform commission (dispute: seller wins)' },
          },
        });
      }

      await tx.user.update({
        where: { id: order.sellerId },
        data: { completedOrders: { increment: 1 } },
      });

      await tx.tonEvent.create({
        data: {
          contractAddress: order.escrowAddress,
          eventType: TonEventType.escrow_confirmed,
          payload: { orderId, byAdmin: adminId, resolution: 'seller_wins' },
        },
      });

      return updatedOrder;
    });

    // ── ON-CHAIN release — AFTER the DB commit, only reachable once per order
    //    (dispute CAS + order CAS + withLock + assertNotProcessed). Best-effort.
    if (this.tonContract.isConfigured() && order.escrowAddress && !order.escrowAddress.startsWith('EQ_SIM')) {
      try {
        await this.tonContract.resolveDispute(orderId, 1, 10000);
        await this.markSettlement(orderId, 'escrow_release', 'success');
      } catch (err: any) {
        this.logger.warn(`adminReleaseEscrow: on-chain release failed for order ${orderId}: ${err.message}`);
        await this.markSettlement(orderId, 'escrow_release', 'failed');
      }
    }

    this.eventEmitter.emit(EVENTS.ESCROW_RELEASED, {
      orderId,
      sellerId: order.sellerId,
      amountNano: sellerNet.toString(),
    } as EscrowReleasedEvent);

    this.logger.log(
      `[ESCROW][ADMIN] Released (seller_wins) — order ${orderId}, seller ${order.sellerId}, ` +
      `net ${sellerNet} nano, admin ${adminId}`,
    );

    return this.mapOrder(updated);
  }

  /**
   * Refunds escrowed funds to the buyer (admin-initiated, e.g. dispute ruled for buyer).
   *
   * H-4 fix — three root causes addressed:
   *
   *  1. wallet.balanceNano was NEVER credited — funds were silently lost.
   *     wallet.update({ balanceNano: { increment: amountNano } }) is now inside
   *     the transaction.
   *
   *  2. Three bare writes (transaction.create, order.update, tonEvent.create)
   *     were outside any transaction — a mid-flight crash left the DB
   *     half-updated.  All four writes now share one $transaction boundary.
   *
   *  3. No CAS guard — a second concurrent refund call would go through silently
   *     and, with the wallet credit now present, would double-refund the buyer.
   *     Fixed with updateMany(WHERE status NOT IN ['cancelled','completed']).
   *
   * Pattern mirrors releaseEscrow (C-3 / H-4): blockchain call stays outside
   * the transaction (best-effort, non-transactional by nature), event emission
   * fires only after a successful DB commit.
   *
   * Note: refunds return the FULL escrowed amount to the buyer — no fee is
   * deducted on refund, because no service was delivered.
   */
  async refundEscrow(orderId: number, adminId: number) {
    // SPEC #2 §4 STEP 5-adjacent — guarded refund (idempotent + locked).
    return this.orderGuard.withLock(orderId, async () => {
      await this.orderGuard.assertNotProcessed(orderId, 'REFUND');
      return this.refundEscrowInner(orderId, adminId);
    });
  }

  private async refundEscrowInner(orderId: number, adminId: number) {
    // ── 1. Load order + buyer wallet (read-only pre-flight) ──────────────────
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: { buyer: { include: { wallet: true } } },
    });
    if (!order) throw new NotFoundException('Order not found');

    if (!order.buyer.wallet) {
      throw new BadRequestException(
        'Buyer does not have a custodial wallet — cannot issue refund',
      );
    }

    // M-8 fix: bypass IEEE 754 float entirely — use Decimal string arithmetic
    const amountNano = BigInt(new Prisma.Decimal(String(order.totalPrice)).mul('1000000000').floor().toFixed(0));

    // ── 2. Best-effort on-chain refund (outside tx — blockchain is not
    //       transactional; DB state is the source of truth) ─────────────────
    let settlement = this.initialSettlement(order.escrowAddress);
    if (
      this.tonContract.isConfigured() &&
      order.escrowAddress &&
      !order.escrowAddress.startsWith('EQ_SIM')
    ) {
      try {
        await this.tonContract.resolveDispute(orderId, 0, 0); // resolution=0 → refund buyer
        settlement = { state: 'success', attempts: 1, updatedAt: new Date().toISOString() };
      } catch (err) {
        this.logger.warn(`On-chain refund failed for order ${orderId}: ${err.message}`);
        settlement = { state: 'failed', attempts: 1, updatedAt: new Date().toISOString() };
      }
    }

    // ── 3. ACID transaction — all four writes share one boundary ─────────────
    const updated = await this.prisma.$transaction(async (tx) => {
      // ── 3a. CAS: prevent double-refund — only proceed from a non-final state
      const cas = await tx.order.updateMany({
        where: { id: orderId, status: { notIn: ['cancelled', 'completed'] } },
        data: { status: 'cancelled' },
      });

      if (cas.count === 0) {
        const existing = await tx.order.findUnique({ where: { id: orderId } });
        if (!existing) throw new NotFoundException('Order not found');
        throw new BadRequestException(
          `Cannot refund order in '${existing.status}' state`,
        );
      }

      // ── 3b. Immutable accounting ledger entry ─────────────────────────────
      await tx.transaction.create({
        data: {
          userId: order.buyerId,
          type: 'escrow_refund',
          status: 'completed',
          amountNano,
          currency: 'TON',
          metadata: { orderId, escrowAddress: order.escrowAddress, byAdmin: adminId, settlement },
        },
      });

      // ── 3c. H-4 core fix: credit buyer's custodial wallet ─────────────────
      //  wallet.update throws if the wallet row disappears between pre-check
      //  and here — the transaction rolls back (safe failure mode).
      await tx.wallet.update({
        where: { userId: order.buyerId },
        data: { balanceNano: { increment: amountNano } },
      });

      // ── 3d. TON event log for the indexer ────────────────────────────────
      await tx.tonEvent.create({
        data: {
          contractAddress: order.escrowAddress,
          eventType: TonEventType.escrow_refunded,
          payload: { orderId },
        },
      });

      return tx.order.findUnique({
        where: { id: orderId },
        include: { buyer: true, seller: true, gig: true },
      });
    }); // ← entire block rolls back if any step throws

    // ── 4. Post-commit side effects (fired only after successful DB commit) ──
    this.eventEmitter.emit(EVENTS.ESCROW_REFUNDED, {
      orderId,
      buyerId: order.buyerId,
      amountNano: amountNano.toString(),
    } as EscrowRefundedEvent);

    this.logger.log(
      `[ESCROW] Refunded — order ${orderId}, buyer ${order.buyerId}, ` +
      `amount ${amountNano} nano, admin ${adminId}`,
    );

    // F-11 observability hook (read-only log; no logic change)
    this.logger.log(
      `[F11-OBSERV] escrow_refund orderId=${orderId} settlement=${settlement.state}`,
    );

    return this.mapOrder(updated);
  }

  /**
   * Marks an order as delivered (seller initiates work hand-off).
   *
   * @param orderId  - The order being delivered.
   * @param callerId - The authenticated user making the HTTP request.
   *                   When supplied, must match order.sellerId (seller-only action).
   *                   Omit only for trusted internal calls (e.g. from OrdersService).
   *
   * Pre-conditions enforced:
   *   - Order must exist.
   *   - Order must be in 'active' status (prevents double-delivery on
   *     already-delivered, completed, disputed, or cancelled orders).
   *   - callerId (when supplied) must be the seller of the order.
   */
  async markDelivered(orderId: number, callerId?: number) {
    const order = await this.prisma.order.findUnique({ where: { id: orderId } });
    if (!order) throw new NotFoundException('Order not found');

    // ── Ownership check (HTTP callers only) ──────────────────────────────────
    if (callerId !== undefined && order.sellerId !== callerId) {
      this.logger.warn(
        `markDelivered: caller ${callerId} is not the seller of order ${orderId} (seller=${order.sellerId})`,
      );
      throw new ForbiddenException('Only the seller can mark this order as delivered');
    }

    // ── Status pre-condition ─────────────────────────────────────────────────
    if (order.status !== 'active') {
      throw new BadRequestException(
        `Cannot mark order as delivered from status '${order.status}'. Order must be active.`,
      );
    }

    // Best-effort on-chain mark-delivered
    if (
      this.tonContract.isConfigured() &&
      order.escrowAddress &&
      !order.escrowAddress.startsWith('EQ_SIM')
    ) {
      try {
        await this.tonContract.markDelivered(orderId);
        this.logger.log(`On-chain markDelivered for order ${orderId}`);
      } catch (err) {
        this.logger.warn(`On-chain markDelivered failed for order ${orderId}: ${err.message}`);
      }
    }

    const updated = await this.prisma.order.update({
      where: { id: orderId },
      data: { status: 'delivered', updatedAt: new Date() },
    });

    this.logger.log(
      `Order ${orderId} marked as delivered by seller ${callerId ?? '(internal)'}`,
    );

    return updated;
  }

  async openDispute(orderId: number, userId: number) {
    const order = await this.prisma.order.findUnique({ where: { id: orderId } });
    if (!order) throw new NotFoundException('Order not found');
    if (order.status !== 'delivered' && order.status !== 'active') {
      throw new BadRequestException('Cannot dispute an order in its current state');
    }

    // Ownership: only buyer or seller can open a dispute
    if (order.buyerId !== userId && order.sellerId !== userId) {
      throw new ForbiddenException('Only a participant of this order can open a dispute');
    }

    await this.prisma.tonEvent.create({
      data: {
        contractAddress: order.escrowAddress,
        eventType: TonEventType.escrow_disputed,
        payload: { orderId, byUser: userId },
      },
    });

    return this.prisma.order.update({
      where: { id: orderId },
      data: { status: 'disputed', updatedAt: new Date() },
    });
  }

  /**
   * F-9 settlement layer (Option C, metadata-only — no schema change).
   *
   * Returns the initial settlement verdict for a payout ledger row:
   *   • 'not_required' when there is no real on-chain leg (SIM escrow / no addr),
   *   • 'pending'      when a real on-chain settlement is expected.
   */
  private initialSettlement(escrowAddress?: string | null): {
    state: 'not_required' | 'pending' | 'success' | 'failed';
    attempts: number;
    updatedAt: string;
  } {
    const hasOnChain =
      this.tonContract.isConfigured() &&
      !!escrowAddress &&
      !escrowAddress.startsWith('EQ_SIM');
    return {
      state: hasOnChain ? 'pending' : 'not_required',
      attempts: 0,
      updatedAt: new Date().toISOString(),
    };
  }

  /**
   * F-9 — finalize the settlement verdict on the latest payout ledger row of a
   * given type for an order. Idempotent-friendly: only patches metadata, never
   * touches balances or creates financial rows. Used post-commit when the
   * on-chain leg runs after the DB transaction (e.g. adminReleaseEscrow).
   */
  private async markSettlement(
    orderId: number,
    type: 'escrow_release' | 'escrow_refund',
    state: 'success' | 'failed',
  ): Promise<void> {
    try {
      const row = await this.prisma.transaction.findFirst({
        where: { type, metadata: { path: ['orderId'], equals: orderId } },
        orderBy: { createdAt: 'desc' },
      });
      if (!row) return;
      const meta = (row.metadata as Record<string, any>) || {};
      const prev = (meta.settlement as Record<string, any>) || { attempts: 0 };
      await this.prisma.transaction.update({
        where: { id: row.id },
        data: {
          metadata: {
            ...meta,
            settlement: {
              state,
              attempts: (prev.attempts ?? 0) + 1,
              updatedAt: new Date().toISOString(),
            },
          },
        },
      });
    } catch (err: any) {
      this.logger.warn(`markSettlement(${type},${orderId}) failed: ${err.message}`);
    }
  }

  private mapOrder(order: any) {
    return {
      ...order,
      totalPrice: order.totalPrice?.toString?.() || order.totalPrice,
      createdAt: order.createdAt?.toISOString?.() || order.createdAt,
      updatedAt: order.updatedAt?.toISOString?.() || order.updatedAt,
      completedAt: order.completedAt?.toISOString?.() || order.completedAt,
    };
  }
}
