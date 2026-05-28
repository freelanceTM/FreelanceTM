import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class NotificationsService {
  constructor(private prisma: PrismaService) {}

  async getMyNotifications(userId: number, onlyUnread = false, page = 1, limit = 20) {
    const where = { userId, ...(onlyUnread ? { read: false } : {}) };
    const [data, total] = await Promise.all([
      this.prisma.notification.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.notification.count({ where }),
    ]);
    return { data, meta: { total, page, limit } };
  }

  async markAsRead(userId: number, notificationId?: number) {
    if (notificationId) {
      const notif = await this.prisma.notification.findUnique({ where: { id: notificationId } });
      if (!notif || notif.userId !== userId) return { count: 0 };
      await this.prisma.notification.update({ where: { id: notificationId }, data: { read: true } });
      return { count: 1 };
    }
    const { count } = await this.prisma.notification.updateMany({
      where: { userId, read: false },
      data: { read: true },
    });
    return { count };
  }

  async toggleNotifications(userId: number, enabled: boolean) {
    await this.prisma.user.update({
      where: { id: userId },
      data: { notificationsEnabled: enabled },
    });
    return { enabled };
  }

  async getUnreadCount(userId: number) {
    const count = await this.prisma.notification.count({ where: { userId, read: false } });
    return { count };
  }
}
