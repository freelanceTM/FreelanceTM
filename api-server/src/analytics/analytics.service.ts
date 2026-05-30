import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class AnalyticsService {
  private readonly logger = new Logger(AnalyticsService.name);

  constructor(private prisma: PrismaService) {}

  async getSellerAnalytics(userId: number) {
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const weekAgo = new Date(today); weekAgo.setDate(weekAgo.getDate() - 7);
    const monthAgo = new Date(today); monthAgo.setDate(monthAgo.getDate() - 30);

    const [ordersToday, ordersWeek, ordersMonth, revenueToday, revenueWeek, revenueMonth, gigs] = await Promise.all([
      this.prisma.order.count({ where: { sellerId: userId, createdAt: { gte: today } } }),
      this.prisma.order.count({ where: { sellerId: userId, createdAt: { gte: weekAgo } } }),
      this.prisma.order.count({ where: { sellerId: userId, createdAt: { gte: monthAgo } } }),
      this.prisma.order.aggregate({ where: { sellerId: userId, status: 'completed', completedAt: { gte: today } }, _sum: { totalPrice: true } }),
      this.prisma.order.aggregate({ where: { sellerId: userId, status: 'completed', completedAt: { gte: weekAgo } }, _sum: { totalPrice: true } }),
      this.prisma.order.aggregate({ where: { sellerId: userId, status: 'completed', completedAt: { gte: monthAgo } }, _sum: { totalPrice: true } }),
      this.prisma.gig.findMany({ where: { sellerId: userId }, select: { id: true, views: true, clicks: true, orderCount: true } }),
    ]);

    const totalViews = gigs.reduce((s, g) => s + g.views, 0);
    const totalClicks = gigs.reduce((s, g) => s + g.clicks, 0);
    const conversion = totalClicks > 0 ? (gigs.reduce((s, g) => s + g.orderCount, 0) / totalClicks) * 100 : 0;

    const stats = await this.prisma.sellerAnalytics.upsert({
      where: { userId },
      update: {
        viewsToday: totalViews,
        ordersToday,
        ordersWeek,
        ordersMonth,
        revenueToday: revenueToday._sum.totalPrice || 0,
        revenueWeek: revenueWeek._sum.totalPrice || 0,
        revenueMonth: revenueMonth._sum.totalPrice || 0,
        conversionRate: conversion,
        lastCalculatedAt: new Date(),
      },
      create: {
        userId,
        viewsToday: totalViews,
        ordersToday,
        ordersWeek,
        ordersMonth,
        revenueToday: revenueToday._sum.totalPrice || 0,
        revenueWeek: revenueWeek._sum.totalPrice || 0,
        revenueMonth: revenueMonth._sum.totalPrice || 0,
        conversionRate: conversion,
      },
    });

    return {
      ...stats,
      revenueToday: stats.revenueToday.toString(),
      revenueWeek: stats.revenueWeek.toString(),
      revenueMonth: stats.revenueMonth.toString(),
    };
  }

  async trackGigView(gigId: number) {
    await this.prisma.gig.update({ where: { id: gigId }, data: { views: { increment: 1 } } });
  }

  async trackGigClick(gigId: number) {
    await this.prisma.gig.update({ where: { id: gigId }, data: { clicks: { increment: 1 } } });
  }

  /**
   * S3-4: Daily analytics refresh — runs at 02:00 every night.
   *
   * Iterates all active sellers (users with at least one gig) and refreshes
   * their SellerAnalytics snapshot. Runs sequentially to avoid spiking the
   * DB with N concurrent aggregation queries.
   *
   * ScheduleModule is registered globally in AppModule.
   */
  @Cron(CronExpression.EVERY_DAY_AT_2AM)
  async refreshAllSellerAnalytics(): Promise<void> {
    this.logger.log('Daily seller analytics refresh started');

    const sellers = await this.prisma.user.findMany({
      where: { role: { in: ['freelancer', 'both'] } },
      select: { id: true },
    });

    let refreshed = 0;
    for (const seller of sellers) {
      try {
        await this.getSellerAnalytics(seller.id);
        refreshed++;
      } catch (err) {
        this.logger.error(`Analytics refresh failed for userId ${seller.id}: ${err}`);
      }
    }

    this.logger.log(`Daily seller analytics refresh complete — ${refreshed}/${sellers.length} sellers updated`);
  }
}
