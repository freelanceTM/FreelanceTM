import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { TonService } from './ton.service';
import { TonContractService } from './ton-contract.service';
import { PrismaService } from '../prisma/prisma.service';
import { TonEventType } from '@prisma/client';

/**
 * Periodically fetches events from the escrow contract and
 * updates order statuses in PostgreSQL.
 * MVP: queries via TonClient; production: use TonCenter indexer API.
 */

/**
 * Maximum number of processing attempts before a TonEvent is abandoned.
 * Prevents poison events (e.g. null orderId, malformed payload) from
 * spinning forever on every cron tick and polluting logs indefinitely.
 */
const MAX_RETRIES = 5;

@Injectable()
export class TonIndexerService {
  private readonly logger = new Logger(TonIndexerService.name);

  constructor(
    private ton: TonService,
    private tonContract: TonContractService,
    private prisma: PrismaService,
  ) {}

  @Cron(CronExpression.EVERY_5_MINUTES)
  async indexEvents() {
    if (!this.ton.isConfigured()) return;
    if (!process.env.ESCROW_CONTRACT_ADDRESS) return;

    this.logger.log('Indexing TON events...');

    try {
      // Fetch unprocessed events from our own table (backend-emitted).
      // Only pick up events that have not yet exceeded the retry budget.
      // In production: use TonCenter getTransactions or webhook.
      const pending = await this.prisma.tonEvent.findMany({
        where: { processed: false, retryCount: { lt: MAX_RETRIES } },
        orderBy: { createdAt: 'asc' },
        take: 100,
      });

      for (const event of pending) {
        try {
          await this.handleEvent(event);
          await this.prisma.tonEvent.update({
            where: { id: event.id },
            data: { processed: true, processedAt: new Date() },
          });
        } catch (err) {
          this.logger.error(`Failed to process ton_event ${event.id}`, err);
          const updated = await this.prisma.tonEvent.update({
            where: { id: event.id },
            data: { retryCount: { increment: 1 } },
          });
          // Log clearly when an event hits the retry ceiling so it can be
          // triaged manually rather than silently disappearing from logs.
          if (updated.retryCount >= MAX_RETRIES) {
            this.logger.error(
              `ton_event ${event.id} (type: ${event.eventType}) has reached ` +
              `the maximum retry limit (${MAX_RETRIES}) and will no longer be ` +
              `retried. Manual intervention required.`,
            );
          }
        }
      }

      // Auto-complete delivered orders past timeout
      await this.autoCompleteOrders();
    } catch (err) {
      this.logger.error('Indexing failed', err);
    }
  }

  private async handleEvent(event: any) {
    const payload = event.payload as any;
    switch (event.eventType) {
      case TonEventType.escrow_created:
        // Order paid and frozen
        if (payload?.orderId) {
          await this.prisma.order.updateMany({
            where: { id: Number(payload.orderId) },
            data: { status: 'active' },
          });
        }
        break;
      case TonEventType.escrow_confirmed:
        // Completed
        if (payload?.orderId) {
          await this.prisma.order.updateMany({
            where: { id: Number(payload.orderId) },
            data: { status: 'completed', completedAt: new Date() },
          });
          // F-10.1: retry on-chain settlement of the seller payout (if not final)
          await this.reconcileSettlement(
            event,
            Number(payload.orderId),
            'escrow_release',
            () => this.tonContract.resolveDispute(Number(payload.orderId), 1, 10000),
          );
        }
        break;
      case TonEventType.escrow_disputed:
        if (payload?.orderId) {
          await this.prisma.order.updateMany({
            where: { id: Number(payload.orderId) },
            data: { status: 'disputed' },
          });
        }
        break;
      case TonEventType.escrow_released:
        // same as confirmed
        break;
      case TonEventType.escrow_refunded:
        if (payload?.orderId) {
          await this.prisma.order.updateMany({
            where: { id: Number(payload.orderId) },
            data: { status: 'cancelled' },
          });
          // F-10.1: retry on-chain settlement of the buyer refund (if not final)
          await this.reconcileSettlement(
            event,
            Number(payload.orderId),
            'escrow_refund',
            () => this.tonContract.resolveDispute(Number(payload.orderId), 0, 0),
          );
        }
        break;
    }
  }

  /**
   * F-10.1 — Settlement retry/reconciliation (Option C, metadata-only).
   *
   * Reuses the existing TonEvent queue + retry budget. For a payout ledger row
   * (escrow_release / escrow_refund) whose settlement is not yet final, it
   * re-attempts ONLY the on-chain leg and advances the settlement state machine:
   *
   *     pending → success | failed
   *     failed  → success | manual   (manual at MAX_RETRIES)
   *     success / manual / not_required → terminal (never re-transitioned)
   *
   * HARD GUARANTEES (idempotency):
   *   • NEVER mutates Wallet.balanceNano
   *   • NEVER creates a Transaction row
   *   • NEVER touches order/withdrawal status (status reaffirm above is the
   *     pre-existing idempotent behavior, not part of the settlement retry)
   *   • Only resends the on-chain message + patches Transaction.metadata.settlement
   *
   * Double-payout safety: the DB credit happened exactly once at release/refund
   * time; this layer only re-pushes the on-chain message (TON seqno dedupes
   * duplicate sends). No second DB payout is possible.
   */
  private async reconcileSettlement(
    event: any,
    orderId: number,
    txType: 'escrow_release' | 'escrow_refund',
    resendOnChain: () => Promise<unknown>,
  ): Promise<void> {
    const row = await this.prisma.transaction.findFirst({
      where: { type: txType as any, metadata: { path: ['orderId'], equals: orderId } },
      orderBy: { createdAt: 'desc' },
    });
    if (!row) return; // nothing to settle

    const meta = (row.metadata as Record<string, any>) || {};
    const settlement = (meta.settlement as Record<string, any>) || { state: 'not_required', attempts: 0 };

    // Terminal states — forbidden transitions (success/manual/not_required → *)
    if (['success', 'manual', 'not_required'].includes(settlement.state)) return;

    // F-11 observability hook (read-only log; no logic change)
    this.logger.log(
      `[F11-OBSERV] retry ${txType} orderId=${orderId} txId=${row.id} ` +
      `settlement=${settlement.state} tonEventRetry=${event.retryCount}`,
    );

    // state ∈ { pending, failed } → re-attempt the on-chain leg ONLY
    try {
      await resendOnChain();
      await this.patchSettlement(row.id, meta, {
        state: 'success',
        attempts: (settlement.attempts ?? 0) + 1,
      });
      this.logger.log(`[SETTLEMENT] ${txType} order ${orderId} → success (retry)`);
    } catch (err: any) {
      const attempts = (settlement.attempts ?? 0) + 1;
      // event.retryCount is the count BEFORE this failure increments it.
      const willReachLimit = event.retryCount + 1 >= MAX_RETRIES;
      if (willReachLimit) {
        await this.patchSettlement(row.id, meta, { state: 'manual', attempts, lastError: err.message });
        this.logger.error(
          `[SETTLEMENT] ${txType} order ${orderId} reached retry limit (${MAX_RETRIES}) → ` +
          `state=manual. Manual intervention required.`,
        );
        return; // do NOT throw → caller marks TonEvent processed=true
      }
      await this.patchSettlement(row.id, meta, { state: 'failed', attempts, lastError: err.message });
      throw err; // increments TonEvent.retryCount → retried next tick
    }
  }

  /** F-10.1 — patch ONLY Transaction.metadata.settlement (no money mutation). */
  private async patchSettlement(
    txId: number,
    meta: Record<string, any>,
    settlement: { state: string; attempts: number; lastError?: string },
  ): Promise<void> {
    await this.prisma.transaction.update({
      where: { id: txId },
      data: {
        metadata: {
          ...meta,
          settlement: { ...settlement, updatedAt: new Date().toISOString() },
        },
      },
    });
  }

  /**
   * Marks orders as completed after the 3-day auto-complete timeout.
   *
   * Execution order (mirrors escrow.service.ts pattern for all on-chain flows):
   *
   *   1. Attempt the on-chain `autoComplete` call FIRST (best-effort).
   *      If the RPC/contract call throws, we skip the DB update entirely so
   *      the DB and blockchain never diverge: the order stays `delivered`
   *      and the next cron tick retries the whole sequence.
   *
   *   2. If blockchain is not configured (`isConfigured() === false`) or the
   *      escrow address is a simulation sentinel, the on-chain step is skipped
   *      and we proceed straight to the DB update (graceful degradation for
   *      non-blockchain deployments).
   *
   *   3. DB update uses `updateMany` with a CAS guard (`WHERE status='delivered'`)
   *      instead of a bare `update`. This prevents double-completion if another
   *      code path (e.g. buyer manually releasing escrow) already advanced the
   *      order to `completed` between the `findMany` query and this write.
   *
   * ACID note: because the blockchain call is inherently non-transactional,
   * wrapping in `$transaction` would provide no additional safety — we follow
   * the same best-effort-then-DB model used in releaseEscrow / refundEscrow.
   */
  private async autoCompleteOrders() {
    const timeoutDays = 3;
    const cutoff = new Date(Date.now() - timeoutDays * 24 * 60 * 60 * 1000);

    const expired = await this.prisma.order.findMany({
      where: {
        status: 'delivered',
        updatedAt: { lt: cutoff },
      },
      select: { id: true, escrowAddress: true },
    });

    for (const order of expired) {
      this.logger.log(`Auto-completing order ${order.id}`);

      // ── Step 1: Best-effort on-chain autoComplete ────────────────────────
      //  Only attempt when the blockchain is fully configured AND the escrow
      //  address is a real on-chain address (not the simulation sentinel).
      const needsOnChain =
        this.tonContract.isConfigured() &&
        !!order.escrowAddress &&
        !order.escrowAddress.startsWith('EQ_SIM');

      if (needsOnChain) {
        try {
          await this.tonContract.autoComplete(order.id);
          this.logger.log(`On-chain autoComplete sent for order ${order.id}`);
        } catch (err) {
          // On-chain failed: abort DB update so the two sides stay consistent.
          // The order remains 'delivered'; the next cron tick will retry.
          this.logger.error(
            `On-chain autoComplete failed for order ${order.id} — ` +
            `DB update skipped to prevent chain/DB divergence. Will retry on next tick.`,
            err,
          );
          continue;
        }
      }

      // ── Step 2: CAS DB update — only from 'delivered' ───────────────────
      //  If another path already completed/cancelled this order between the
      //  findMany above and now, the WHERE clause matches 0 rows — safe no-op.
      const result = await this.prisma.order.updateMany({
        where: { id: order.id, status: 'delivered' },
        data: { status: 'completed', completedAt: new Date() },
      });

      if (result.count === 0) {
        this.logger.warn(
          `Auto-complete skipped for order ${order.id} — ` +
          `order had already left 'delivered' state (CAS miss, likely concurrent release).`,
        );
      } else {
        this.logger.log(
          `Order ${order.id} auto-completed` +
          (needsOnChain ? ' (on-chain + DB)' : ' (DB only — blockchain not configured)'),
        );
      }
    }
  }
}
