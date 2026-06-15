import {
  Injectable,
  Logger,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { OrderStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * SPEC #2 — ORDER GUARD LAYER (no DB changes).
 *
 * Provides three defenses on top of the existing CAS-protected services:
 *   1. canTransition()      — fixes the order state machine (status-only).
 *   2. assertNotProcessed() — idempotency: blocks repeated financial actions
 *                             by inspecting the existing `Transaction` ledger.
 *   3. withLock()           — process-wide in-memory critical section per order.
 *
 * Mapping note (SPEC §1 conflict C-A): SPEC names (PENDING_PAYMENT/PAID/
 * IN_PROGRESS/REFUNDED) are mapped onto the real `OrderStatus` enum:
 *   PAID / IN_PROGRESS → 'active', DELIVERED → 'delivered',
 *   COMPLETED → 'completed', REFUNDED → 'cancelled', DISPUTED → 'disputed'.
 *
 * Lock note: this is an in-memory lock (single Node process). It is NOT a
 * distributed lock — under horizontal scaling it does not span instances.
 * The authoritative double-spend protection remains the DB-level CAS already
 * present in escrow/withdrawals; this layer is defense-in-depth.
 */
@Injectable()
export class OrderGuardService {
  private readonly logger = new Logger(OrderGuardService.name);

  /** orderId → tail promise, forming a per-order serialized queue. */
  private readonly locks = new Map<number, Promise<unknown>>();

  constructor(private prisma: PrismaService) {}

  /**
   * Allowed status transitions (role-agnostic superset of the existing
   * OrdersService.getAllowedTransitions — never rejects a currently-valid move).
   * DISPUTED and final states are terminal at the user level; admin resolution
   * uses dedicated escrow methods (adminReleaseEscrow / refundEscrow).
   */
  private static readonly ALLOWED: Record<OrderStatus, OrderStatus[]> = {
    pending: ['active', 'cancelled'],
    active: ['delivered', 'disputed', 'cancelled'],
    delivered: ['completed', 'revision_requested', 'disputed'],
    revision_requested: ['delivered', 'disputed'],
    completed: [],
    cancelled: [],
    disputed: [],
    archived: [],
  };

  canTransition(current: OrderStatus, next: OrderStatus): boolean {
    return OrderGuardService.ALLOWED[current]?.includes(next) ?? false;
  }

  /** Throws BadRequestException when the transition is not allowed. */
  assertCanTransition(current: OrderStatus, next: OrderStatus): void {
    if (!this.canTransition(current, next)) {
      throw new BadRequestException(
        `Illegal order transition: '${current}' → '${next}'`,
      );
    }
  }

  /**
   * SPEC §3.2 / §5 — idempotency. Maps an action to the ledger transaction
   * type(s) that a *completed* execution would have written, then throws
   * ConflictException if such an entry already exists for this order.
   *
   * Uses the existing `Transaction.metadata` JSON path { orderId } — no schema
   * change. Read-only.
   */
  async assertNotProcessed(
    orderId: number,
    action: 'ESCROW_RELEASE' | 'PAYMENT_CAPTURE' | 'REFUND',
  ): Promise<void> {
    const typeByAction: Record<typeof action, string[]> = {
      ESCROW_RELEASE: ['escrow_release'],
      PAYMENT_CAPTURE: ['escrow_create'],
      REFUND: ['escrow_refund'],
    } as const;

    const existing = await this.prisma.transaction.findFirst({
      where: {
        type: { in: typeByAction[action] as any },
        status: 'completed',
        metadata: { path: ['orderId'], equals: orderId },
      },
      select: { id: true },
    });

    if (existing) {
      this.logger.warn(
        `[IDEMPOTENT] ${action} already processed for order ${orderId} ` +
          `(transaction ${existing.id}) — blocking duplicate.`,
      );
      throw new ConflictException(
        `Action ${action} has already been processed for order ${orderId}.`,
      );
    }
  }

  /**
   * SPEC §3.3 — per-order critical section. Serializes async callbacks for the
   * same orderId within this process (FIFO). Different orders run in parallel.
   *
   * Each call chains onto the tail promise stored in `this.locks`. The stored
   * tail is the promise that settles when THIS call finishes, so the next
   * caller waits for us. We only delete the map entry when we are still the
   * tail (no newer caller chained on), preventing unbounded Map growth.
   */
  async withLock<T>(orderId: number, fn: () => Promise<T>): Promise<T> {
    const prev = this.locks.get(orderId) ?? Promise.resolve();

    // Run fn only after the previous holder settles (ignore its errors).
    const run = prev.then(() => fn(), () => fn());

    // The tail others wait on: settles when `run` settles (success or failure).
    const tail = run.then(
      () => undefined,
      () => undefined,
    );
    this.locks.set(orderId, tail);

    try {
      return await run;
    } finally {
      // GC: drop the entry only if no newer caller replaced the tail.
      if (this.locks.get(orderId) === tail) {
        this.locks.delete(orderId);
      }
    }
  }
}
