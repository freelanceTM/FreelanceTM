import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

/**
 * F-11 — FINANCIAL OBSERVABILITY LAYER (read-only / aggregate-only).
 *
 * Safety/debug layer over the existing financial system. It NEVER mutates
 * balances, money rows, TON state, or retry state. It only reads and aggregates
 * Transaction / TonEvent / WithdrawalRequest / Order.
 *
 * Implementation note: settlement state lives in Transaction.metadata (JSON),
 * which Postgres/Prisma cannot groupBy efficiently. Therefore queries are
 * time-windowed + type-filtered and aggregated in-memory with bounded `take`
 * caps so this never becomes a heavy scan. All endpoints are admin-guarded and
 * off the money hot paths.
 */

// Mirror of TonIndexerService.MAX_RETRIES (kept local; no import to avoid coupling)
const MAX_RETRIES = 5;
// Max rows pulled per window/type for in-memory aggregation (safety cap).
const SCAN_CAP = 5000;

type SettlementState = 'pending' | 'success' | 'failed' | 'manual' | 'not_required' | 'unknown';

const SETTLEMENT_TYPES = ['escrow_release', 'escrow_refund', 'withdraw'] as const;
type SettlementTxType = (typeof SETTLEMENT_TYPES)[number];

function windowStart(window: '1h' | '24h' | '7d'): Date {
  const ms = window === '1h' ? 3_600_000 : window === '24h' ? 86_400_000 : 604_800_000;
  return new Date(Date.now() - ms);
}

function readSettlementState(metadata: unknown): SettlementState {
  const m = (metadata as Record<string, any>) || {};
  const s = m.settlement as Record<string, any> | undefined;
  if (!s || typeof s.state !== 'string') return 'unknown';
  return (s.state as SettlementState) ?? 'unknown';
}

@Injectable()
export class FinanceObservabilityService {
  private readonly logger = new Logger(FinanceObservabilityService.name);

  constructor(private prisma: PrismaService) {}

  /**
   * Deliverable 1.1 — settlement counts grouped by tx type × time window.
   */
  async settlementSummary() {
    const windows: Array<'1h' | '24h' | '7d'> = ['1h', '24h', '7d'];
    const result: Record<string, Record<string, Record<string, number>>> = {};

    for (const w of windows) {
      const since = windowStart(w);
      result[w] = {};
      for (const type of SETTLEMENT_TYPES) {
        const rows = await this.prisma.transaction.findMany({
          where: { type: type as any, createdAt: { gte: since } },
          select: { metadata: true },
          take: SCAN_CAP,
        });
        const counts: Record<string, number> = {
          pending: 0, success: 0, failed: 0, manual: 0, not_required: 0, unknown: 0,
        };
        for (const r of rows) counts[readSettlementState(r.metadata)]++;
        result[w][type] = counts;
      }
    }
    return { generatedAt: new Date().toISOString(), maxRetries: MAX_RETRIES, byWindow: result };
  }

  /**
   * Deliverable 1.2 — TonEvents stuck at/over the retry ceiling, or progressing
   * abnormally (high retry but still unprocessed).
   */
  async stuckTonEvents(threshold = 3) {
    const events = await this.prisma.tonEvent.findMany({
      where: {
        processed: false,
        OR: [{ retryCount: { gte: MAX_RETRIES } }, { retryCount: { gt: threshold } }],
      },
      orderBy: { retryCount: 'desc' },
      take: 500,
    });

    return events.map((e) => {
      const p = (e.payload as Record<string, any>) || {};
      return {
        tonEventId: e.id,
        eventType: e.eventType,
        orderId: p.orderId ?? null,
        withdrawalId: p.withdrawalId ?? null,
        retryCount: e.retryCount,
        atCeiling: e.retryCount >= MAX_RETRIES,
        createdAt: e.createdAt.toISOString(),
        lastError: p.lastError ?? null,
      };
    });
  }

  /**
   * Deliverable 1.3 — orphaned/mismatched financial states between the DB money
   * row, its settlement verdict, and the TonEvent processing flag.
   */
  async orphanedFinancialStates() {
    const since = windowStart('7d');

    // Pull recent payout rows (bounded) and inspect settlement metadata.
    const txRows = await this.prisma.transaction.findMany({
      where: {
        type: { in: SETTLEMENT_TYPES as any },
        createdAt: { gte: since },
      },
      select: { id: true, type: true, status: true, metadata: true, createdAt: true },
      take: SCAN_CAP,
    });

    const completedButNotSettled: any[] = [];
    for (const t of txRows) {
      const st = readSettlementState(t.metadata);
      // completed money row but on-chain settlement not successful (and required)
      if (t.status === 'completed' && !['success', 'not_required'].includes(st)) {
        const meta = (t.metadata as Record<string, any>) || {};
        completedButNotSettled.push({
          transactionId: t.id,
          type: t.type,
          settlementState: st,
          orderId: meta.orderId ?? null,
          withdrawalId: meta.withdrawalId ?? null,
          createdAt: t.createdAt.toISOString(),
        });
      }
    }

    // settlement.success but the paired TonEvent is still unprocessed.
    // (escrow flows only — withdrawals have no TonEvent.)
    const successTx = txRows.filter(
      (t) => ['escrow_release', 'escrow_refund'].includes(t.type) &&
        readSettlementState(t.metadata) === 'success',
    );
    const successOrderIds = successTx
      .map((t) => ((t.metadata as Record<string, any>) || {}).orderId)
      .filter((x): x is number => typeof x === 'number');

    const unprocessedForSuccess = successOrderIds.length
      ? await this.prisma.tonEvent.findMany({
          where: {
            processed: false,
            eventType: { in: ['escrow_confirmed', 'escrow_refunded'] as any },
          },
          take: 1000,
        })
      : [];
    const successButEventUnprocessed = unprocessedForSuccess
      .filter((e) => successOrderIds.includes(((e.payload as Record<string, any>) || {}).orderId))
      .map((e) => ({ tonEventId: e.id, eventType: e.eventType, orderId: ((e.payload as any) || {}).orderId, retryCount: e.retryCount }));

    // TonEvent processed=true but settlement still pending/failed.
    const processedEvents = await this.prisma.tonEvent.findMany({
      where: { processed: true, eventType: { in: ['escrow_confirmed', 'escrow_refunded'] as any }, processedAt: { gte: since } },
      take: 2000,
    });
    const txByOrder = new Map<number, SettlementState>();
    for (const t of txRows) {
      const oid = ((t.metadata as Record<string, any>) || {}).orderId;
      if (typeof oid === 'number') txByOrder.set(oid, readSettlementState(t.metadata));
    }
    const processedButSettlementOpen = processedEvents
      .map((e) => ({ e, oid: ((e.payload as Record<string, any>) || {}).orderId }))
      .filter(({ oid }) => typeof oid === 'number' && ['pending', 'failed'].includes(txByOrder.get(oid) ?? ''))
      .map(({ e, oid }) => ({ tonEventId: e.id, eventType: e.eventType, orderId: oid, settlementState: txByOrder.get(oid) }));

    return {
      generatedAt: new Date().toISOString(),
      completedButNotSettled,
      successButEventUnprocessed,
      processedButSettlementOpen,
    };
  }

  /**
   * Deliverable 1.4 — pipeline latency percentiles.
   *   • Transaction.createdAt → settlement.updatedAt (when state=success)
   *   • TonEvent.createdAt → processedAt (when processed)
   */
  async pipelineLatencyMetrics() {
    const since = windowStart('7d');

    const txRows = await this.prisma.transaction.findMany({
      where: { type: { in: SETTLEMENT_TYPES as any }, createdAt: { gte: since } },
      select: { createdAt: true, metadata: true },
      take: SCAN_CAP,
    });
    const settlementLatencies: number[] = [];
    for (const t of txRows) {
      const s = ((t.metadata as Record<string, any>) || {}).settlement as Record<string, any> | undefined;
      if (s?.state === 'success' && s.updatedAt) {
        const ms = new Date(s.updatedAt).getTime() - t.createdAt.getTime();
        if (ms >= 0) settlementLatencies.push(ms);
      }
    }

    const events = await this.prisma.tonEvent.findMany({
      where: { processed: true, processedAt: { gte: since } },
      select: { createdAt: true, processedAt: true },
      take: SCAN_CAP,
    });
    const eventLatencies: number[] = [];
    for (const e of events) {
      if (e.processedAt) {
        const ms = e.processedAt.getTime() - e.createdAt.getTime();
        if (ms >= 0) eventLatencies.push(ms);
      }
    }

    return {
      generatedAt: new Date().toISOString(),
      settlementLatencyMs: this.percentiles(settlementLatencies),
      tonEventLatencyMs: this.percentiles(eventLatencies),
    };
  }

  /**
   * Deliverable 4 — ALERT CONDITIONS ONLY (no auto-fix). Combines the above
   * into boolean flags an external monitor can poll.
   */
  async alerts(opts?: { stuckHours?: number }) {
    const stuckHours = opts?.stuckHours ?? 6;
    const [summary, stuck, orphans] = await Promise.all([
      this.settlementSummary(),
      this.stuckTonEvents(),
      this.orphanedFinancialStates(),
    ]);

    // manual settlement growth (24h)
    const manual24h = SETTLEMENT_TYPES.reduce(
      (acc, t) => acc + (summary.byWindow['24h'][t]?.manual ?? 0), 0,
    );
    // retry storm: any stuck event at/over ceiling
    const retryStorm = stuck.some((s) => s.atCeiling);

    // failed settlements not progressing for > N hours
    const since = new Date(Date.now() - stuckHours * 3_600_000);
    const staleFailed = await this.prisma.transaction.findMany({
      where: { type: { in: SETTLEMENT_TYPES as any }, createdAt: { lt: since } },
      select: { id: true, metadata: true },
      take: SCAN_CAP,
    });
    const stuckFailedCount = staleFailed.filter((t) => readSettlementState(t.metadata) === 'failed').length;

    return {
      generatedAt: new Date().toISOString(),
      alerts: {
        retryStorm,
        manualSettlementGrowth24h: manual24h,
        failedNotProgressing: stuckFailedCount,
        dbVsSettlementMismatch:
          orphans.completedButNotSettled.length +
          orphans.successButEventUnprocessed.length +
          orphans.processedButSettlementOpen.length,
      },
      thresholdsHint: { stuckHours, maxRetries: MAX_RETRIES },
    };
  }

  private percentiles(values: number[]) {
    if (values.length === 0) return { count: 0, p50: null, p90: null, p99: null };
    const sorted = [...values].sort((a, b) => a - b);
    const at = (p: number) => sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))];
    return { count: sorted.length, p50: at(50), p90: at(90), p99: at(99) };
  }
}
