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

    const allowedTransitions = this.getAllowedTransitions(order.status, userId, order.buyerId, order.sellerId);
    if (!allowedTransitions.includes(newStatus)) {
      throw new BadRequestException(`Cannot transition from ${order.status} to ${newStatus}`);
    }

    if (newStatus === 'delivered') {
      await this.escrow.markDelivered(orderId);
    }

    if (newStatus === 'completed') {
      await this.escrow.releaseEscrow(orderId, userId);
    }

    if (newStatus === 'disputed') {
      // Legacy path: transitions to disputed without a structured reason.
      // Prefer POST /orders/:id/dispute for structured dispute filing (S1-4).
      await this.escrow.openDispute(orderId, userId);
    }

    // H-3 fix: completedAt and completedOrders are owned by releaseEscrow()'s
    // ACID transaction — do not set them here to avoid duplicates.
    const updated = await this.prisma.order.update({
      where: { id: orderId },
      data: { status: newStatus },
      include: { gig: true, buyer: true, seller: true },
    });

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
   *   - Order must be in 'active' or 'delivered' state.
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

    if (order.status !== 'active' && order.status !== 'delivered') {
      throw new BadRequestException(
        `Cannot open a dispute on an order with status '${order.status}'. ` +
        `Order must be active or delivered.`,
      );
    }

    // Dispute.orderId is @unique — guard against duplicate disputes
    const existing = await this.prisma.dispute.findUnique({ where: { orderId } });
    if (existing) {
      throw new ConflictException('A dispute already exists for this order');
    }

    // Create the structured Dispute record first
    const dispute = await this.prisma.dispute.create({
      data: {
        orderId,
        initiatorId: userId,
        reason: reason.trim(),
        status: 'open',
      },
    });

    // Transition order status → 'disputed' and write TonEvent
    await this.escrow.openDispute(orderId, userId);

    // Fire notification event for both parties
    this.eventEmitter.emit(EVENTS.DISPUTE_OPENED, {
      disputeId: dispute.id,
      orderId,
      initiatorId: userId,
      reason: reason.trim(),
    } as DisputeOpenedEvent);

    return { dispute };
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
