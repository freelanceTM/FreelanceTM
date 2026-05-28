import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class PortfolioService {
  constructor(private prisma: PrismaService) {}

  async create(userId: number, data: { title: string; description?: string; imageUrls?: string[]; videoUrl?: string; categoryId?: number; tags?: string[]; linkUrl?: string }) {
    return this.prisma.portfolioItem.create({
      data: {
        userId,
        title: data.title,
        description: data.description,
        imageUrls: data.imageUrls || [],
        videoUrl: data.videoUrl,
        categoryId: data.categoryId,
        tags: data.tags || [],
        linkUrl: data.linkUrl,
      },
    });
  }

  async listByUser(userId: number) {
    return this.prisma.portfolioItem.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      include: { user: { select: { username: true, displayName: true } } },
    });
  }

  async listPublic(page = 1, limit = 20, categoryId?: number) {
    const where: any = {};
    if (categoryId) where.categoryId = categoryId;
    const [items, total] = await Promise.all([
      this.prisma.portfolioItem.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        include: { user: { select: { id: true, username: true, displayName: true, avatarUrl: true, rating: true } } },
      }),
      this.prisma.portfolioItem.count({ where }),
    ]);
    return { data: items, meta: { total, page, limit } };
  }

  async delete(userId: number, itemId: number) {
    const item = await this.prisma.portfolioItem.findUnique({ where: { id: itemId } });
    if (!item || item.userId !== userId) throw new Error('Not found or not owner');
    return this.prisma.portfolioItem.delete({ where: { id: itemId } });
  }
}
