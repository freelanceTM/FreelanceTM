import { Injectable, NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaService } from '../prisma/prisma.service';
import { OrderStatus, Prisma } from '@prisma/client';
import { EscrowService } from '../escrow/escrow.service';
import { EVENTS, OrderCreatedEvent, OrderStatusChangedEvent } from '../events/notification.events';

@Injectable()
export class OrdersService {
  constructor(
    private prisma: PrismaService,
    private eventEmitter: EventEmitter2,
    private escrow: EscrowService,
  ) {}

  async create(userId: number, data: { gigId: number; requirements?: string }) {
    const gig = await this.prisma.gig.findUnique({ where: { id: data.gigId } });
    if (!gig) throw new NotFoundException('Gig not found');
    if (gig.sellerId === userId) throw new BadRequestException('Cannot order your own gig');
    if (gig.status !== 'active') throw new BadRequestException('Gig is not active');

    const order = await this.prisma.order.create({
      data: {
        gigId: gig.id,
        buyerId: userId,
        sellerId: gig.sellerId,
        totalPrice: gig.price,
        requirements: data.requirements || '',
        deliveryDays: gig.deliveryDays,
        status: 'pending',
      },
      include: { gig: true, buyer: true, seller: true },
    });

    await this.prisma.gig.update({
      where: { id: gig.id },
      data: { orderCount: { increment: 1 } },
    });

    // Auto-create escrow for the order
    try {
      await this.escrow.createEscrow(order.id);
    } catch {
      // escrow creation failure is non-fatal; order stays pending
    }

    // Emit notification event
    this.eventEmitter.emit(EVENTS.ORDER_CREATED, {
      orderId: order.id,
      buyerId: order.buyerId,
      sellerId: order.sellerId,
      gigTitle: order.gig?.title ?? 'Order',
      totalPrice: order.totalPrice.toString(),
    } as OrderCreatedEvent);

    return this.mapOrder(order);
  }

  /**
   * S1-3: Tender → Order Bridge
   *
   * Creates an Order from a selected TenderBid without requiring a Gig.
   * Called internally by TendersService.selectBid() immediately after the
   * buyer selects a winning proposal from the tender exchange.
   *
   * Unlike create(), this method:
   *   - Does NOT check gig status (there is no gig)
   *   - Sets tenderId for traceability
   *   - Uses bid.price as totalPrice and bid.deliveryDays as deliveryDays
   *   - Fires escrow creation synchronously (non-fatal on failure)
   *   - Emits the same ORDER_CREATED event so notifications work unchanged
   *
   * @param params.buyerId      - tender.authorId (the client who posted the tender)
   * @param params.sellerId     - bid.freelancerId (the freelancer whose bid was chosen)
   * @param params.tenderId     - the parent Tender.id (for traceability)
   * @param params.title        - tender.title (used as order label, stored in requirements)
   * @param params.totalPrice   - bid.price (Prisma Decimal — no float conversion)
   * @param params.deliveryDays - bid.deliveryDays
   * @param params.requirements - optional extra context from the tender description
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
        status: 'pending',
      },
      include: { buyer: true, seller: true },
    });

    // Auto-create escrow — non-fatal on failure (order stays pending and
    // the buyer can re-trigger escrow creation via the escrow endpoint)
    try {
      await this.escrow.createEscrow(order.id);
    } catch {
      // intentionally swallowed — same pattern as create()
    }

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
      include: { gig: true, buyer: true, seller: true },
      orderBy: { createdAt: 'desc' },
    });
    return orders.map(this.mapOrder);
  }

  async findOne(userId: number, orderId: number) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: { gig: true, buyer: true, seller: true, messages: { orderBy: { createdAt: 'asc' } } },
    });
    if (!order) throw new NotFoundException('Order not found');
    if (order.buyerId !== userId && order.sellerId !== userId) {
      throw new ForbiddenException('Access denied');
    }
    return this.mapOrder(order);
  }

  async updateStatus(userId: number, orderId: number, newStatus: OrderStatus) {
    const order = await this.prisma.order.findUnique({ where: { id: orderId } });
    if (!order) throw new NotFoundException('Order not found');
    if (order.buyerId !== userId && order.sellerId !== userId) {
      throw new ForbiddenException('Access denied');
    }

    const oldStatus = order.status;

    // Status transition validation
    const allowedTransitions = this.getAllowedTransitions(order.status, userId, order.buyerId, order.sellerId);
    if (!allowedTransitions.includes(newStatus)) {
      throw new BadRequestException(`Cannot transition from ${order.status} to ${newStatus}`);
    }

    // Side effects per status
    if (newStatus === 'active' && order.status === 'pending') {
      // Accept order — escrow already created
    }

    if (newStatus === 'delivered') {
      // Seller delivered — mark in escrow
      await this.escrow.markDelivered(orderId);
    }

    if (newStatus === 'completed') {
      // Buyer accepted — release escrow
      await this.escrow.releaseEscrow(orderId, userId);
    }

    if (newStatus === 'disputed') {
      await this.escrow.openDispute(orderId, userId);
    }

    // H-3 fix: `completedAt` is no longer set here.
    // `releaseEscrow()` (C-3) already sets it atomically inside its
    // $transaction CAS step — overwriting it here would replace the
    // canonical, in-transaction timestamp with a later, post-commit one.
    //
    // H-3 fix: the `completedOrders` increment has also been removed from
    // this method.  `releaseEscrow()` owns that counter exclusively at
    // step 3f of its $transaction.  The previous duplicate increment here
    // caused every completed order to inflate the seller's reputation score
    // by 2 instead of 1.
    const updated = await this.prisma.order.update({
      where: { id: orderId },
      data: { status: newStatus },
      include: { gig: true, buyer: true, seller: true },
    });

    // Emit status change notification
    this.eventEmitter.emit(EVENTS.ORDER_STATUS_CHANGED, {
      orderId: updated.id,
      buyerId: updated.buyerId,
      sellerId: updated.sellerId,
      oldStatus,
      newStatus,
      gigTitle: updated.gig?.title ?? `Order #${orderId}`,
    } as OrderStatusChangedEvent);

    return this.mapOrder(updated);
  }

  private getAllowedTransitions(status: OrderStatus, userId: number, buyerId: number, sellerId: number): OrderStatus[] {
    switch (status) {
      case 'pending':
        return userId === sellerId ? ['active', 'cancelled'] : [];
      case 'active':
        return userId === sellerId ? ['delivered'] : [];
      case 'delivered':
        return userId === buyerId ? ['completed', 'disputed'] : [];
      case 'disputed':
        return ['resolved']; // Admin resolves, handled separately
      default:
        return [];
    }
  }

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
    };
  }
}
