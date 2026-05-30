import { Injectable, NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { OrdersService } from '../orders/orders.service';
import { Prisma } from '@prisma/client';

@Injectable()
export class TendersService {
  constructor(
    private prisma: PrismaService,
    private ordersService: OrdersService,
  ) {}

  async create(userId: number, data: Prisma.TenderCreateInput & { categoryId: number }) {
    const tender = await this.prisma.tender.create({
      data: {
        title: data.title,
        description: data.description,
        budgetMin: data.budgetMin ? new Prisma.Decimal(data.budgetMin as any) : undefined,
        budgetMax: data.budgetMax ? new Prisma.Decimal(data.budgetMax as any) : undefined,
        deadlineDays: data.deadlineDays || 7,
        skills: data.skills || [],
        attachments: data.attachments || [],
        currency: (data.currency as any) || 'MANAT',
        author: { connect: { id: userId } },
        category: { connect: { id: data.categoryId } },
        status: 'open',
      },
      include: { author: true, category: true },
    });
    return this.mapTender(tender);
  }

  async list(params: { categoryId?: number; status?: string; page?: number; limit?: number; search?: string }) {
    const { categoryId, status = 'open', page = 1, limit = 20, search } = params;
    const where: Prisma.TenderWhereInput = { status: status as any };
    if (categoryId) where.categoryId = categoryId;
    if (search) where.title = { contains: search, mode: 'insensitive' };

    const [tenders, total] = await Promise.all([
      this.prisma.tender.findMany({ where, skip: (page - 1) * limit, take: limit, orderBy: { createdAt: 'desc' }, include: { author: true, category: true, _count: { select: { bids: true } } } }),
      this.prisma.tender.count({ where }),
    ]);
    return { data: tenders.map(this.mapTender), meta: { total, page, limit } };
  }

  async getOne(id: number) {
    const tender = await this.prisma.tender.findUnique({
      where: { id },
      include: { author: true, category: true, bids: { include: { freelancer: { select: { id: true, username: true, displayName: true, avatarUrl: true, rating: true, completedOrders: true } } } } },
    });
    if (!tender) throw new NotFoundException('Tender not found');
    return this.mapTender(tender);
  }

  async placeBid(tenderId: number, freelancerId: number, data: { price: number; message?: string; deliveryDays: number }) {
    const tender = await this.prisma.tender.findUnique({ where: { id: tenderId } });
    if (!tender) throw new NotFoundException('Tender not found');
    if (tender.status !== 'open') throw new BadRequestException('Tender is closed');
    if (tender.authorId === freelancerId) throw new ForbiddenException('Cannot bid on own tender');

    const bid = await this.prisma.tenderBid.upsert({
      where: { tenderId_freelancerId: { tenderId, freelancerId } },
      update: {
        price: new Prisma.Decimal(data.price),
        message: data.message,
        deliveryDays: data.deliveryDays,
      },
      create: {
        tender: { connect: { id: tenderId } },
        freelancer: { connect: { id: freelancerId } },
        price: new Prisma.Decimal(data.price),
        message: data.message,
        deliveryDays: data.deliveryDays,
      },
    });
    return bid;
  }

  /**
   * S1-3: Tender → Order Bridge
   *
   * Selects a winning bid and immediately spawns a real Order with escrow.
   *
   * Flow:
   *   1. Validate caller is the tender author and tender is still open/in_progress.
   *   2. Clear any previously selected bid (supports re-selection before order creation).
   *   3. Mark the chosen bid as selected.
   *   4. Advance tender status to 'in_progress' and set assignedToId.
   *   5. Call OrdersService.createForTender() — creates Order + fires escrow atomically.
   *
   * The returned payload contains both the updated Tender and the new Order so the
   * client can immediately display the order status and escrow address.
   */
  async selectBid(tenderId: number, authorId: number, bidId: number) {
    const tender = await this.prisma.tender.findUnique({ where: { id: tenderId } });
    if (!tender) throw new NotFoundException('Tender not found');
    if (tender.authorId !== authorId) throw new ForbiddenException('Only author can select');
    if (tender.status !== 'open') {
      throw new BadRequestException(`Cannot select a bid on a tender with status '${tender.status}'`);
    }

    const bid = await this.prisma.tenderBid.findUnique({
      where: { id: bidId },
      include: { freelancer: true },
    });
    if (!bid || bid.tenderId !== tenderId) throw new NotFoundException('Bid not found');

    // Clear any previously selected bid so only one can be selected at a time
    await this.prisma.tenderBid.updateMany({
      where: { tenderId },
      data: { isSelected: false },
    });

    await this.prisma.tenderBid.update({
      where: { id: bidId },
      data: { isSelected: true },
    });

    // Advance the tender state
    const updatedTender = await this.prisma.tender.update({
      where: { id: tenderId },
      data: { status: 'in_progress', assignedToId: bid.freelancerId },
      include: { bids: { include: { freelancer: true } } },
    });

    // ── S1-3: Create the Order and lock escrow ────────────────────────────────
    //  createForTender() fires escrow creation and ORDER_CREATED event internally.
    //  If Order creation fails, the bid is already marked selected and the tender
    //  is in_progress — the error bubbles up so the caller knows to retry.
    const order = await this.ordersService.createForTender({
      buyerId: tender.authorId,
      sellerId: bid.freelancerId,
      tenderId: tender.id,
      title: tender.title,
      totalPrice: bid.price,
      deliveryDays: bid.deliveryDays,
      requirements: tender.description,
    });

    return {
      tender: this.mapTender(updatedTender),
      order,
    };
  }

  async cancel(tenderId: number, userId: number) {
    const tender = await this.prisma.tender.findUnique({ where: { id: tenderId } });
    if (!tender) throw new NotFoundException('Tender not found');
    if (tender.authorId !== userId) throw new ForbiddenException('Only author');

    return this.prisma.tender.update({
      where: { id: tenderId },
      data: { status: 'cancelled' },
    });
  }

  private mapTender(t: any) {
    return {
      ...t,
      budgetMin: t.budgetMin?.toString?.() || t.budgetMin,
      budgetMax: t.budgetMax?.toString?.() || t.budgetMax,
      createdAt: t.createdAt?.toISOString?.() || t.createdAt,
      updatedAt: t.updatedAt?.toISOString?.() || t.updatedAt,
      completedAt: t.completedAt?.toISOString?.() || t.completedAt,
    };
  }
}
