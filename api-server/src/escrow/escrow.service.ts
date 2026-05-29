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
import { TonEventType } from '@prisma/client';
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
    // ── 1. Load order with related wallets ───────────────────────────────────
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: {
        buyer: { include: { wallet: true } },
        seller: { include: { wallet: true } },
        gig: true,
      },
    });

    if (!order) throw new NotFoundException('Order not found');

    // ── 2. Ownership check (HTTP callers only) ───────────────────────────────
    if (callerId !== undefined && order.buyerId !== callerId) {
      this.logger.warn(
        `createEscrow: caller ${callerId} is not the buyer of order ${orderId} (buyer=${order.buyerId})`,
      );
      throw new ForbiddenException('Only the buyer can create an escrow for this order');
    }

    if (order.escrowAddress) {
      throw new BadRequestException('Escrow already created for this order');
    }

    // ── 3. Compute amount ────────────────────────────────────────────────────
    const amountNano = BigInt(Math.round(Number(order.totalPrice) * 1e9));

    // ── 4. Best-effort on-chain escrow (outside DB tx — blockchain is not
    //       transactional; we proceed even if it fails) ──────────────────────
    let escrowAddress: string | null = null;
    if (
      this.tonContract.isConfigured() &&
      order.buyer.wallet?.address &&
      order.seller.wallet?.address
    ) {
      try {
        const tx = await this.tonContract.createOrder(
          order.id,
          order.buyer.wallet.address,
          order.seller.wallet.address,
          amountNano,
        );
        escrowAddress = process.env.ESCROW_CONTRACT_ADDRESS || null;
        this.logger.log(
          `On-chain escrow created for order ${orderId}, seqno: ${tx?.seqno}`,
        );
      } catch (err) {
        this.logger.warn(
          `Failed to create on-chain escrow for order ${orderId}, falling back to simulation: ${err.message}`,
        );
      }
    }

    if (!escrowAddress) {
      escrowAddress = `EQ_SIM_${orderId}_${Date.now()}`;
    }

    // ── 5. Atomic DB writes ──────────────────────────────────────────────────
    //  Re-check escrowAddress inside the transaction to close the race window
    //  between two concurrent createEscrow requests for the same order.
    const updated = await this.prisma.$transaction(async (tx) => {
      const fresh = await tx.order.findUnique({
        where: { id: orderId },
        select: { escrowAddress: true },
      });

      if (fresh?.escrowAddress) {
        throw new BadRequestException('Escrow already created for this order');
      }

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
    });

    this.logger.log(
      `Escrow created — address: ${escrowAddress}, order: ${orderId}, buyer: ${order.buyerId}`,
    );

    return this.mapOrder(updated);
  }

  /**
   * Releases escrowed funds to the seller after the buyer confirms delivery.
   *
   * Double-spend protection (C-3):
   *   All five DB writes are wrapped in a single Prisma interactive transaction.
   *   The order status transition uses a compare-and-swap (CAS) via `updateMany`
   *   with the expected prior state (`status: 'delivered'`) in the WHERE clause.
   *
   *   PostgreSQL acquires a row-level exclusive lock during the UPDATE. Under
   *   two concurrent releaseEscrow calls that both pass the pre-check above:
   *     • Request A enters the tx, gets the lock → WHERE matches → count=1 → commits.
   *     • Request B waits for A's lock; A has committed `status='completed'`,
   *       so B's WHERE finds 0 rows → count=0 → throws → full rollback of all
   *       five writes (status, wallet credit, ledger record, stats, TON event).
   *
   *   The blockchain call intentionally lives OUTSIDE the transaction — it is
   *   best-effort and non-transactional by nature. The EventEmitter notification
   *   also fires outside so it is only triggered after a successful DB commit.
   */
  async releaseEscrow(orderId: number, userId: number) {
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

    const amountNano = BigInt(Math.round(Number(order.totalPrice) * 1e9));

    // ── 2. Best-effort on-chain release (outside tx — blockchain is not
    //       transactional; DB state is the source of truth) ─────────────────
    if (
      this.tonContract.isConfigured() &&
      order.escrowAddress &&
      !order.escrowAddress.startsWith('EQ_SIM')
    ) {
      try {
        await this.tonContract.resolveDispute(orderId, 1, 10000); // 1 = release to seller
        this.logger.log(`On-chain escrow released for order ${orderId}`);
      } catch (err) {
        this.logger.warn(
          `On-chain release failed for order ${orderId} (DB release will still proceed): ${err.message}`,
        );
      }
    }

    // ── 3. ACID transaction — all five writes share one boundary ─────────────
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

      // ── 3c. Credit seller's custodial wallet balance ──────────────────────
      await tx.wallet.update({
        where: { userId: order.sellerId },
        data: { balanceNano: { increment: amountNano } },
      });

      // ── 3d. Immutable accounting ledger entry ─────────────────────────────
      await tx.transaction.create({
        data: {
          userId: order.sellerId,
          type: 'escrow_release',
          status: 'completed',
          amountNano,
          currency: 'TON',
          metadata: { orderId, escrowAddress: order.escrowAddress },
        },
      });

      // ── 3e. Seller reputation / stats counter ─────────────────────────────
      await tx.user.update({
        where: { id: order.sellerId },
        data: { completedOrders: { increment: 1 } },
      });

      // ── 3f. TON event log for the indexer ────────────────────────────────
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
      amountNano: amountNano.toString(),
    } as EscrowReleasedEvent);

    this.logger.log(
      `[ESCROW] Released — order ${orderId}, seller ${order.sellerId}, ` +
      `amount ${amountNano} nano, buyer ${userId}`,
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
   */
  async refundEscrow(orderId: number, adminId: number) {
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

    const amountNano = BigInt(Math.round(Number(order.totalPrice) * 1e9));

    // ── 2. Best-effort on-chain refund (outside tx — blockchain is not
    //       transactional; DB state is the source of truth) ─────────────────
    if (
      this.tonContract.isConfigured() &&
      order.escrowAddress &&
      !order.escrowAddress.startsWith('EQ_SIM')
    ) {
      try {
        await this.tonContract.resolveDispute(orderId, 0, 0); // resolution=0 → refund buyer
      } catch (err) {
        this.logger.warn(`On-chain refund failed for order ${orderId}: ${err.message}`);
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
          metadata: { orderId, escrowAddress: order.escrowAddress, byAdmin: adminId },
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
