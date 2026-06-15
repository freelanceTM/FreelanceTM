import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaService } from '../prisma/prisma.service';
import { OrderStatus, Prisma } from '@prisma/client';
import { EscrowService } from '../escrow/escrow.service';
import { PromocodesService } from '../promocodes/promocodes.service';
import { OrderGuardService } from '../common/order-guard/order-guard.service';
import {
  EVENTS,
  OrderCreatedEvent,
  OrderStatusChangedEvent,
  DisputeOpenedEvent,
} from '../events/notification.events';

@Injectable()
export class OrdersService {
  constructor(
    private prisma: PrismaService,
    private eventEmitter: EventEmitter2,
    private escrow: EscrowService,
    private promocodes: PromocodesService,
    private orderGuard: OrderGuardService,
  ) {}

  /**
   * Create a new gig order with optional package, extras, and promo code.
   *
   * S2-3: packageId selects a GigPackage (Basic / Standard / Premium).
   *       Price, deliveryDays, and revisionsAllowed are inherited from the package.
   *       Falls back to gig-level defaults when omitted.
   *
   * S2-4: extraIds are validated against the gig's active extras.
   *       Each extra's price is summed and delivery days accumulated.
   *       An OrderItem ledger row is created per extra inside the transaction.
   *
   * S3-2: promoCode applies an atomic discount inside the $transaction.
   *       'percent' type: price × (1 – value/100), floor at 0.
   *       'fixed' type:   price – value, floor at 0.
   *       Race-safe CAS: updateMany(WHERE usedCount < maxUses) — concurrent
   *       redemptions cannot both succeed for a single-use code.
   *
   * All DB writes (order + items + gig.orderCount + promo.usedCount) are
   * committed in a single ACID $transaction.
   */
  async create(
    userId: number,
    data: {
      gigId: number;
      packageId?: number;
      extraIds?: number[];
      promoCode?: string;
      requirements?: string;
    },
  ) {
    const gig = await this.prisma.gig.findUnique({
      where: { id: data.gigId },
      include: {
        packages: { where: { isActive: true } },
        extras: { where: { isActive: true } },
      },
    });
    if (!gig) throw new NotFoundException('Gig not found');
    if (gig.sellerId === userId) throw new BadRequestException('Cannot order your own gig');
    if (gig.status !== 'active') throw new BadRequestException('Gig is not active');

    // S2-3: Resolve base price / deliveryDays / revisions from package or gig defaults
    let basePrice: Prisma.Decimal = gig.price;
    let deliveryDays = gig.deliveryDays;
    let revisionsAllowed = gig.revisions;
    let packageId: number | null = null;

    if (data.packageId) {
      const pkg = gig.packages.find(p => p.id === data.packageId);
      if (!pkg) {
        throw new BadRequestException(
          `Package ${data.packageId} not found on this gig or is inactive`,
        );
      }
      basePrice = pkg.price;
      deliveryDays = pkg.deliveryDays;
      revisionsAllowed = pkg.revisions;
      packageId = pkg.id;
    }

    // S2-4: Validate extras — must belong to this gig and be active
    const validExtras: Array<{ id: number; price: Prisma.Decimal; deliveryDays: number }> = [];
    let extraAdditionalDays = 0;

    if (data.extraIds && data.extraIds.length > 0) {
      const activeExtraMap = new Map(gig.extras.map(e => [e.id, e]));
      for (const extraId of data.extraIds) {
        const extra = activeExtraMap.get(extraId);
        if (!extra) {
          throw new BadRequestException(
            `Extra ${extraId} does not belong to this gig or is inactive`,
          );
        }
        validExtras.push({ id: extra.id, price: extra.price, deliveryDays: extra.deliveryDays });
        extraAdditionalDays += extra.deliveryDays;
      }
    }

    const extrasTotal = validExtras.reduce(
      (sum, e) => sum.plus(e.price),
      new Prisma.Decimal(0),
    );
    const grossPrice = basePrice.plus(extrasTotal);
    const finalDeliveryDays = deliveryDays + extraAdditionalDays;

    // Single ACID transaction: validate promo + create order + ledger + orderCount
    const result = await this.prisma.$transaction(async (tx) => {
      // S3-2: Promo code — validate and atomically consume inside the transaction
      let finalPrice = grossPrice;
      let discountAmount = new Prisma.Decimal(0);

      if (data.promoCode) {
        const promo = await tx.promoCode.findFirst({
          where: {
            code: data.promoCode.toUpperCase().trim(),
            isActive: true,
            OR: [{ expiresAt: null }, { expiresAt: { gte: new Date() } }],
          },
        });
        if (!promo) {
          throw new BadRequestException('Invalid or expired promo code');
        }

        // CAS consume: only succeeds if usedCount is still within limit
        const { count } = await tx.promoCode.updateMany({
          where: {
            id: promo.id,
            usedCount: { lt: promo.maxUses },
          },
          data: { usedCount: { increment: 1 } },
        });
        if (count === 0) {
          throw new BadRequestException('Promo code has been fully used');
        }

        if (promo.type === 'percent') {
          discountAmount = grossPrice.times(promo.value).dividedBy(100);
        } else {
          discountAmount = promo.value;
        }
        // Floor at zero — discount cannot exceed the order total
        finalPrice = Prisma.Decimal.max(
          grossPrice.minus(discountAmount),
          new Prisma.Decimal(0),
        );
      }

      const created = await tx.order.create({
        data: {
          gigId: gig.id,
          buyerId: userId,
          sellerId: gig.sellerId,
          packageId,
          totalPrice: finalPrice,
          requirements: data.requirements?.trim() || '',
          deliveryDays: finalDeliveryDays,
          revisionsAllowed,
          revisionsUsed: 0,
          status: 'pending',
        },
      });

      // Ledger receipt: one OrderItem per selected extra
      if (validExtras.length > 0) {
        await tx.orderItem.createMany({
          data: validExtras.map(e => ({
            orderId: created.id,
            extraId: e.id,
            price: e.price,
          })),
        });
      }

      await tx.gig.update({
        where: { id: gig.id },
        data: { orderCount: { increment: 1 } },
      });

      // F-4 (A2): create escrow IN THE SAME transaction as the order.
      //  If this throws, the whole order tx rolls back → no phantom order.
      //  Invariant: ORDER EXISTS ⇔ ESCROW EXISTS.
      await this.escrow.createEscrowWrites(tx, created.id);

      const order = await tx.order.findUnique({
        where: { id: created.id },
        include: {
          gig: true,
          buyer: true,
          seller: true,
          package: true,
          items: { include: { extra: true } },
        },
      });

      return { order: order!, grossPrice, finalPrice, discountAmount };
    });

    const { order, grossPrice: gross, finalPrice: net, discountAmount: discount } = result;

    // On-chain escrow settlement — best-effort, AFTER the atomic DB commit.
    await this.escrow.settleEscrowOnChain(order.id);

    this.eventEmitter.emit(EVENTS.ORDER_CREATED, {
      orderId: order.id,
      buyerId: order.buyerId,
      sellerId: order.sellerId,
      gigTitle: order.gig?.title ?? 'Order',
      totalPrice: order.totalPrice.toString(),
    } as OrderCreatedEvent);

    return {
      ...this.mapOrder(order),
      grossPrice: gross.toString(),
      discountAmount: discount.toString(),
    };
  }

  /**
   * SPEC #3 §3 — Gig → Order bridge (POST /orders/from-gig/:gigId).
   *
   * Thin entry point that reuses the existing create() pipeline so there is
   * NO duplicated order/escrow logic. create() already enforces:
   *   • gig.status === 'active'        (SPEC §5)
   *   • gig.sellerId !== buyer         (SPEC §5: seller ≠ buyer)
   *   • price snapshot into Order.totalPrice  (SPEC RULE 1/3: price freeze —
   *     the order stores its own totalPrice and never reads live gig.price)
   *
   * This method adds the SPEC §5 `price > 0` guard up front (create() does not
   * assert it explicitly), then delegates.
   *
   * Conflict note (reported, not silently resolved): SPEC §3 sets the new order
   * status to PENDING_PAYMENT. That value does not exist in the real OrderStatus
   * enum and the schema must not change, so the order is created with the
   * existing default 'pending' (the equivalent pre-payment state).
   */
  async createFromGig(userId: number, gigId: number) {
    const gig = await this.prisma.gig.findUnique({
      where: { id: gigId },
      select: { id: true, price: true, status: true, sellerId: true },
    });
    if (!gig) throw new NotFoundException('Gig not found');

    // SPEC §5: price must be > 0
    if (new Prisma.Decimal(String(gig.price)).lte(0)) {
      throw new BadRequestException('Gig price must be greater than zero');
    }

    // Delegate — create() performs active-check, self-order-check, price
    // snapshot, ledger/extras, and non-fatal escrow creation.
    return this.create(userId, { gigId });
  }

  /**
   * S1-3: Tender → Order Bridge
   */
  async createForTender(params: {
    buyerId: number;
    sellerId: number;
    tenderId: number;
    title: string;
    totalPrice: Prisma.Decimal;
    deliveryDays: number;
    requirements?: string;
  }) {
    if (params.buyerId === params.sellerId) {
      throw new BadRequestException('Buyer and seller cannot be the same user');
    }

    // F-4 (A2): order + escrow are created atomically in one transaction.
    const order = await this.prisma.$transaction(async (tx) => {
      const created = await tx.order.create({
        data: {
          gigId: null,
          tenderId: params.tenderId,
          buyerId: params.buyerId,
          sellerId: params.sellerId,
          totalPrice: params.totalPrice,
          requirements: params.requirements
            ? `[Tender: ${params.title}]\n${params.requirements}`
            : `[Tender: ${params.title}]`,
          deliveryDays: params.deliveryDays,
          revisionsAllowed: 1,
          revisionsUsed: 0,
          status: 'pending',
        },
      });

      // Escrow in the SAME tx → no phantom order if it fails.
      await this.escrow.createEscrowWrites(tx, created.id);

      return tx.order.findUnique({
        where: { id: created.id },
        include: { buyer: true, seller: true },
      });
    });

    // On-chain settlement — best-effort, after commit.
    await this.escrow.settleEscrowOnChain(order!.id);

    this.eventEmitter.emit(EVENTS.ORDER_CREATED, {
      orderId: order!.id,
      buyerId: order!.buyerId,
      sellerId: order!.sellerId,
      gigTitle: params.title,
      totalPrice: order!.totalPrice.toString(),
    } as OrderCreatedEvent);

    return this.mapOrder(order);
  }

  async findAll(userId: number, role?: 'buyer' | 'seller') {
    let where: Prisma.OrderWhereInput;
    if (role === 'buyer') where = { buyerId: userId };
    else if (role === 'seller') where = { sellerId: userId };
    else where = { OR: [{ buyerId: userId }, { sellerId: userId }] };

    const orders = await this.prisma.order.findMany({
      where,
      include: {
        gig: true,
        buyer: true,
        seller: true,
        package: true,
        items: { include: { extra: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
    return orders.map(this.mapOrder);
  }

  async findOne(userId: number, orderId: number) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: {
        gig: true,
        buyer: true,
        seller: true,
        package: true,
        items: { include: { extra: true } },
        messages: { orderBy: { createdAt: 'asc' } },
      },
    });
    if (!order) throw new NotFoundException('Order not found');
    if (order.buyerId !== userId && order.sellerId !== userId) {
      throw new ForbiddenException('Access denied');
    }
    return this.mapOrder(order);
  }

  /**
   * Advance an order through the state machine.
   *
   * S2-2: 'revision_requested' transition is gated on revisionsUsed < revisionsAllowed.
   *       When allowed: revisionsUsed is incremented and revisionNote is persisted.
   *       Seller resets the flow by re-delivering (revision_requested → delivered).
   */
  async updateStatus(
    userId: number,
    orderId: number,
    newStatus: OrderStatus | string,
    opts?: { revisionNote?: string },
  ) {
    const order = await this.prisma.order.findUnique({ where: { id: orderId } });
    if (!order) throw new NotFoundException('Order not found');
    if (order.buyerId !== userId && order.sellerId !== userId) {
      throw new ForbiddenException('Access denied');
    }

    const allowed = this.getAllowedTransitions(
      order.status,
      userId,
      order.buyerId,
      order.sellerId,
    );
    if (!allowed.includes(newStatus as string)) {
      throw new BadRequestException(
        `Cannot transition from '${order.status}' to '${newStatus}'`,
      );
    }

    // SPEC #2 §1 — state-machine guard (defense-in-depth on top of the
    // role-based check above). Fixes illegal status jumps regardless of role.
    this.orderGuard.assertCanTransition(
      order.status,
      newStatus as OrderStatus,
    );

    // S2-2: Revision limit guard
    if (newStatus === 'revision_requested') {
      if (order.revisionsUsed >= order.revisionsAllowed) {
        throw new BadRequestException(
          `Revision limit reached (${order.revisionsUsed}/${order.revisionsAllowed}). ` +
          `Please file a dispute via POST /orders/${orderId}/dispute instead.`,
        );
      }
    }

    if (newStatus === 'delivered') await this.escrow.markDelivered(orderId);
    if (newStatus === 'completed') await this.escrow.releaseEscrow(orderId, userId);
    if (newStatus === 'disputed') await this.escrow.openDispute(orderId, userId);

    const updateData: Prisma.OrderUpdateInput = { status: newStatus as any };
    if (newStatus === 'revision_requested') {
      updateData.revisionsUsed = { increment: 1 };
      if (opts?.revisionNote) updateData.revisionNote = opts.revisionNote.trim();
    }

    const updated = await this.prisma.order.update({
      where: { id: orderId },
      data: updateData,
      include: {
        gig: true,
        buyer: true,
        seller: true,
        package: true,
        items: { include: { extra: true } },
      },
    });

    this.eventEmitter.emit(EVENTS.ORDER_STATUS_CHANGED, {
      orderId: updated.id,
      buyerId: updated.buyerId,
      sellerId: updated.sellerId,
      oldStatus: order.status,
      newStatus,
      gigTitle: updated.gig?.title ?? `Order #${orderId}`,
    } as OrderStatusChangedEvent);

    return this.mapOrder(updated);
  }

  /**
   * S1-4: Structured Dispute Filing
   */
  async fileDispute(userId: number, orderId: number, reason: string) {
    if (!reason || reason.trim().length === 0) {
      throw new BadRequestException('Dispute reason is required');
    }

    const order = await this.prisma.order.findUnique({ where: { id: orderId } });
    if (!order) throw new NotFoundException('Order not found');
    if (order.buyerId !== userId && order.sellerId !== userId) {
      throw new ForbiddenException('Access denied');
    }

    const disputeableStatuses = ['active', 'delivered', 'revision_requested'];
    if (!disputeableStatuses.includes(order.status as string)) {
      throw new BadRequestException(
        `Cannot open a dispute on an order with status '${order.status}'. ` +
        `Order must be active, delivered, or revision_requested.`,
      );
    }

    const existing = await this.prisma.dispute.findUnique({ where: { orderId } });
    if (existing) throw new ConflictException('A dispute already exists for this order');

    const dispute = await this.prisma.dispute.create({
      data: { orderId, initiatorId: userId, reason: reason.trim(), status: 'open' },
    });

    await this.escrow.openDispute(orderId, userId);

    this.eventEmitter.emit(EVENTS.DISPUTE_OPENED, {
      disputeId: dispute.id,
      orderId,
      initiatorId: userId,
      reason: reason.trim(),
    } as DisputeOpenedEvent);

    return { dispute };
  }

  // ─── State machine ─────────────────────────────────────────────────────

  private getAllowedTransitions(
    status: OrderStatus,
    userId: number,
    buyerId: number,
    sellerId: number,
  ): string[] {
    switch (status) {
      case 'pending':
        return userId === sellerId ? ['active', 'cancelled'] : [];
      case 'active':
        return userId === sellerId ? ['delivered'] : [];
      case 'delivered':
        return userId === buyerId ? ['completed', 'revision_requested', 'disputed'] : [];
      case 'revision_requested' as any:
        return userId === sellerId ? ['delivered'] : [];
      case 'disputed':
        return [];
      default:
        return [];
    }
  }

  // ─── Serialization ──────────────────────────────────────────────────────

  private mapOrder(order: any) {
    return {
      ...order,
      totalPrice: order.totalPrice?.toString?.() || order.totalPrice,
      createdAt: order.createdAt?.toISOString?.() || order.createdAt,
      updatedAt: order.updatedAt?.toISOString?.() || order.updatedAt,
      completedAt: order.completedAt?.toISOString?.() || order.completedAt,
      gigTitle: order.gig?.title ?? (order.tenderId ? `Tender Order #${order.tenderId}` : undefined),
      buyerUsername: order.buyer?.username,
      sellerUsername: order.seller?.username,
      packageName: order.package?.name ?? null,
      extras: order.items?.map((i: any) => ({
        id: i.extra.id,
        title: i.extra.title,
        price: i.price?.toString?.() || i.price,
      })) ?? [],
    };
  }
}
