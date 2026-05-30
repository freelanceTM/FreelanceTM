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
  ) {}

  /**
   * Create a new gig order with optional package selection and extras.
   *
   * S2-3: If packageId is supplied, the order inherits price, deliveryDays
   *       and revisionsAllowed from that GigPackage (Basic / Standard / Premium).
   *       When omitted, the gig's own price/deliveryDays/revisions are used.
   *
   * S2-4: Each extraId is validated against the gig's active extras.
   *       Extra prices are summed and appended to the base price.
   *       Each extra's deliveryDays are added to the final delivery window.
   *       An OrderItem ledger row is created per extra inside the transaction.
   *
   * All DB writes (order + items + gig.orderCount) are a single $transaction.
   */
  async create(
    userId: number,
    data: {
      gigId: number;
      packageId?: number;
      extraIds?: number[];
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

    // S2-3: Resolve base price / deliveryDays / revisions from selected package or gig defaults
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

    // S2-4: Validate extras and compute surcharge + extra delivery days
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
    const totalPrice = basePrice.plus(extrasTotal);
    const finalDeliveryDays = deliveryDays + extraAdditionalDays;

    // Single ACID transaction: create order + OrderItem ledger + gig orderCount bump
    const order = await this.prisma.$transaction(async (tx) => {
      const created = await tx.order.create({
        data: {
          gigId: gig.id,
          buyerId: userId,
          sellerId: gig.sellerId,
          packageId,
          totalPrice,
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

      return tx.order.findUnique({
        where: { id: created.id },
        include: {
          gig: true,
          buyer: true,
          seller: true,
          package: true,
          items: { include: { extra: true } },
        },
      });
    });

    // Escrow creation is non-fatal — order stays in 'pending' if it fails
    try { await this.escrow.createEscrow(order!.id); } catch {}

    this.eventEmitter.emit(EVENTS.ORDER_CREATED, {
      orderId: order!.id,
      buyerId: order!.buyerId,
      sellerId: order!.sellerId,
      gigTitle: order!.gig?.title ?? 'Order',
      totalPrice: order!.totalPrice.toString(),
    } as OrderCreatedEvent);

    return this.mapOrder(order!);
  }

  /**
   * S1-3: Tender → Order Bridge
   *
   * Creates an Order from a selected TenderBid without requiring a Gig.
   * Called internally by TendersService.selectBid() immediately after the
   * buyer selects a winning proposal from the tender exchange.
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

    const order = await this.prisma.order.create({
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
      include: { buyer: true, seller: true },
    });

    try { await this.escrow.createEscrow(order.id); } catch {}

    this.eventEmitter.emit(EVENTS.ORDER_CREATED, {
      orderId: order.id,
      buyerId: order.buyerId,
      sellerId: order.sellerId,
      gigTitle: params.title,
      totalPrice: order.totalPrice.toString(),
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
   * S2-2: The 'revision_requested' transition is gated:
   *   - Only the buyer can request a revision, only from 'delivered'.
   *   - revisionsUsed must be < revisionsAllowed (set at order creation
   *     from the chosen package, or 1 for bare gig / tender orders).
   *   - When the transition is allowed, revisionsUsed is incremented and
   *     the buyer's revisionNote is persisted for the seller to read.
   *   - The seller resets the flow by re-delivering (revision_requested → delivered).
   *
   * opts.revisionNote is only consumed when newStatus === 'revision_requested'.
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

    // S2-2: Revision limit guard — checked before any DB write
    if (newStatus === 'revision_requested') {
      if (order.revisionsUsed >= order.revisionsAllowed) {
        throw new BadRequestException(
          `Revision limit reached (${order.revisionsUsed}/${order.revisionsAllowed}). ` +
          `Please file a dispute via POST /orders/${orderId}/dispute instead.`,
        );
      }
    }

    // Escrow side-effects
    if (newStatus === 'delivered') {
      await this.escrow.markDelivered(orderId);
    }
    if (newStatus === 'completed') {
      await this.escrow.releaseEscrow(orderId, userId);
    }
    if (newStatus === 'disputed') {
      // Legacy path: use POST /orders/:id/dispute for structured dispute filing (S1-4).
      await this.escrow.openDispute(orderId, userId);
    }

    // Build update payload
    const updateData: Prisma.OrderUpdateInput = { status: newStatus as any };
    if (newStatus === 'revision_requested') {
      updateData.revisionsUsed = { increment: 1 };
      if (opts?.revisionNote) {
        updateData.revisionNote = opts.revisionNote.trim();
      }
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
   *
   * Creates a Dispute record in the database (so admin can track and resolve it)
   * and transitions the order to 'disputed' state via EscrowService.openDispute().
   *
   * This is the correct, structured way to open a dispute.  The legacy
   * updateStatus(..., 'disputed') path still exists for backward compatibility
   * but does NOT create a Dispute row — use this endpoint instead.
   *
   * Validations:
   *   - Caller must be buyer or seller of the order.
   *   - Order must be in 'active', 'delivered', or 'revision_requested' state.
   *   - Only one Dispute row is allowed per order (DB @unique on orderId).
   *   - reason must be non-empty.
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
    if (existing) {
      throw new ConflictException('A dispute already exists for this order');
    }

    const dispute = await this.prisma.dispute.create({
      data: {
        orderId,
        initiatorId: userId,
        reason: reason.trim(),
        status: 'open',
      },
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

  // ─── State machine ────────────────────────────────────────────────────────

  /**
   * Returns the list of statuses the current user is allowed to transition
   * this order into, given its current status and the user's role.
   *
   * S2-2: 'revision_requested' added as a buyer transition from 'delivered'.
   *        Revision limit is enforced separately in updateStatus().
   */
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
        // Buyer: accept → complete | request revision | escalate → dispute
        return userId === buyerId ? ['completed', 'revision_requested', 'disputed'] : [];
      case 'revision_requested' as any:
        // Seller: re-delivers after completing the requested revisions
        return userId === sellerId ? ['delivered'] : [];
      case 'disputed':
        return []; // Admin resolves via PATCH /admin/disputes/:id
      default:
        return [];
    }
  }

  // ─── Serialization ────────────────────────────────────────────────────────

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
