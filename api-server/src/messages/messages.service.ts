import { Injectable, ForbiddenException, NotFoundException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaService } from '../prisma/prisma.service';
import { EVENTS, MessageReceivedEvent } from '../events/notification.events';

@Injectable()
export class MessagesService {
  constructor(
    private prisma: PrismaService,
    private eventEmitter: EventEmitter2,
  ) {}

  async getMessages(orderId: number, userId: number) {
    const order = await this.prisma.order.findUnique({ where: { id: orderId } });
    if (!order) throw new NotFoundException('Order not found');
    if (order.buyerId !== userId && order.sellerId !== userId) {
      throw new ForbiddenException('Access denied');
    }

    return this.prisma.message.findMany({
      where: { orderId },
      orderBy: { createdAt: 'asc' },
      include: { sender: { select: { id: true, username: true, displayName: true, avatarUrl: true } } },
    });
  }

  async createMessage(orderId: number, senderId: number, content: string, attachments?: string[]) {
    const order = await this.prisma.order.findUnique({ where: { id: orderId } });
    if (!order) throw new NotFoundException('Order not found');
    if (order.buyerId !== senderId && order.sellerId !== senderId) {
      throw new ForbiddenException('Access denied');
    }

    const message = await this.prisma.message.create({
      data: {
        orderId,
        senderId,
        content,
        attachments: attachments || [],
      },
      include: { sender: { select: { id: true, username: true, displayName: true, avatarUrl: true } } },
    });

    const recipientId = senderId === order.buyerId ? order.sellerId : order.buyerId;

    // Emit push notification
    this.eventEmitter.emit(EVENTS.MESSAGE_RECEIVED, {
      messageId: message.id,
      orderId,
      senderId,
      recipientId,
      senderName: message.sender.displayName || message.sender.username,
      content,
    } as MessageReceivedEvent);

    return {
      ...message,
      createdAt: message.createdAt.toISOString(),
      readAt: message.readAt?.toISOString() || null,
    };
  }

  async markAsRead(orderId: number, userId: number) {
    await this.prisma.message.updateMany({
      where: { orderId, senderId: { not: userId }, readAt: null },
      data: { readAt: new Date() },
    });
  }
}
