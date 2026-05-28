import { Injectable, NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma } from '@prisma/client';

@Injectable()
export class GigsService {
  constructor(private prisma: PrismaService) {}

  async create(userId: number, data: Prisma.GigCreateInput & { categoryId: number; extras?: any[]; packages?: any[] }) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user || (user.role !== 'freelancer' && user.role !== 'both')) {
      throw new ForbiddenException('Only freelancers can create gigs');
    }

    const gig = await this.prisma.gig.create({
      data: {
        title: data.title,
        description: data.description,
        price: new Prisma.Decimal(data.price as any),
        deliveryDays: data.deliveryDays || 3,
        revisions: data.revisions || 1,
        status: (data.status as any) || 'pending_review',
        tags: (data.tags as string[]) || [],
        images: (data.images as string[]) || [],
        seller: { connect: { id: userId } },
        category: { connect: { id: data.categoryId } },
        extras: data.extras ? { create: data.extras.map((e) => ({ title: e.title, description: e.description, price: new Prisma.Decimal(e.price), deliveryDays: e.deliveryDays || 0 })) } : undefined,
        packages: data.packages ? { create: data.packages.map((p) => ({ name: p.name, description: p.description, price: new Prisma.Decimal(p.price), deliveryDays: p.deliveryDays || 3, revisions: p.revisions || 1, includes: p.includes || [] })) } : undefined,
      },
      include: { seller: true, category: true, extras: true, packages: true },
    });

    return this.mapGig(gig);
  }

  async findAll(params: {
    page?: number;
    limit?: number;
    categoryId?: number;
    sellerId?: number;
    search?: string;
    minPrice?: number;
    maxPrice?: number;
    sortBy?: string;
    requesterId?: number;
  }) {
    const { page = 1, limit = 20, categoryId, sellerId, search, minPrice, maxPrice, sortBy, requesterId } = params;

    const where: Prisma.GigWhereInput = {};
    const isOwn = sellerId !== undefined && sellerId === requesterId;
    if (!isOwn) where.status = 'active';
    if (categoryId) where.categoryId = categoryId;
    if (sellerId) where.sellerId = sellerId;
    if (minPrice !== undefined) where.price = { gte: new Prisma.Decimal(minPrice) };
    if (maxPrice !== undefined) where.price = { ...((where.price as object) || {}), lte: new Prisma.Decimal(maxPrice) };
    if (search) where.title = { contains: search, mode: 'insensitive' };

    let orderBy: Prisma.GigOrderByWithRelationInput = { createdAt: 'desc' };
    if (sortBy === 'price_asc') orderBy = { price: 'asc' };
    if (sortBy === 'price_desc') orderBy = { price: 'desc' };
    if (sortBy === 'rating') orderBy = { rating: 'desc' };
    if (sortBy === 'orders') orderBy = { orderCount: 'desc' };

    const [gigs, total] = await Promise.all([
      this.prisma.gig.findMany({ where, orderBy, skip: (page - 1) * limit, take: limit, include: { seller: true, category: true, extras: { where: { isActive: true } }, packages: { where: { isActive: true } } } }),
      this.prisma.gig.count({ where }),
    ]);
    return { data: gigs.map(this.mapGig), meta: { total, page, limit } };
  }

  async findFeatured() {
    const gigs = await this.prisma.gig.findMany({
      where: { isFeatured: true, status: 'active' },
      orderBy: { orderCount: 'desc' },
      take: 8,
      include: { seller: true, category: true },
    });
    return gigs.map(this.mapGig);
  }

  async findStats() {
    const [freelancers, gigs, orders, categories] = await Promise.all([
      this.prisma.user.count({ where: { role: { in: ['freelancer', 'both'] } } }),
      this.prisma.gig.count({ where: { status: 'active' } }),
      this.prisma.order.count(),
      this.prisma.category.findMany({ orderBy: { gigCount: 'desc' }, take: 5 }),
    ]);

    return { totalFreelancers: freelancers, totalGigs: gigs, totalOrders: orders, topCategories: categories };
  }

  async findOne(id: number) {
    const gig = await this.prisma.gig.findUnique({ where: { id }, include: { seller: true, category: true, extras: { where: { isActive: true } }, packages: { where: { isActive: true } } } });
    if (!gig) throw new NotFoundException('Gig not found');
    return this.mapGig(gig);
  }

  async update(userId: number, id: number, data: Prisma.GigUpdateInput) {
    const gig = await this.prisma.gig.findUnique({ where: { id } });
    if (!gig) throw new NotFoundException('Gig not found');
    if (gig.sellerId !== userId) throw new ForbiddenException('You can only update your own gigs');

    const updated = await this.prisma.gig.update({
      where: { id },
      data,
      include: { seller: true, category: true, extras: { where: { isActive: true } }, packages: { where: { isActive: true } } },
    });
    return this.mapGig(updated);
  }

  async remove(userId: number, id: number) {
    const gig = await this.prisma.gig.findUnique({ where: { id } });
    if (!gig) throw new NotFoundException('Gig not found');
    if (gig.sellerId !== userId) throw new ForbiddenException('You can only delete your own gigs');

    await this.prisma.gig.delete({ where: { id } });
    if (gig.status === 'active') {
      await this.prisma.category.update({
        where: { id: gig.categoryId },
        data: { gigCount: { decrement: 1 } },
      });
    }
  }

  private mapGig(gig: any) {
    return {
      ...gig,
      price: gig.price.toString(),
      sellerUsername: gig.seller?.username,
      sellerDisplayName: gig.seller?.displayName,
      sellerAvatarUrl: gig.seller?.avatarUrl,
      sellerRating: gig.seller?.rating,
      sellerLevel: gig.seller?.level,
      sellerIsVerified: gig.seller?.isVerified,
      sellerCompletedOrders: gig.seller?.completedOrders,
      categoryName: gig.category?.name,
      createdAt: gig.createdAt.toISOString(),
      updatedAt: gig.updatedAt.toISOString(),
      extras: (gig.extras || []).map((e: any) => ({ ...e, price: e.price?.toString?.() || e.price })),
      packages: (gig.packages || []).map((p: any) => ({ ...p, price: p.price?.toString?.() || p.price })),
    };
  }
}
