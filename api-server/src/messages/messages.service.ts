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

  async getMessages(orderId: number, userId: number, role?: string) {
    const order = await this.prisma.order.findUnique({ where: { id: orderId } });
    if (!order) throw new NotFoundException('Order not found');
    this.assertParticipant(order, userId, role);

    return this.prisma.message.findMany({
      where: { orderId },
      orderBy: { createdAt: 'asc' },
      include: { sender: { select: { id: true, username: true, displayName: true, avatarUrl: true } } },
    });
  }

  /**
   * SPEC #4 §4.2 — list the current user's order-linked chats.
   *
   * Returns one entry per order the user participates in that has at least one
   * message, with last message, unread count, partner info and order context.
   * Admins are intentionally excluded here (this is the *my* chats view).
   */
  async listMyChats(userId: number) {
    const orders = await this.prisma.order.findMany({
      where: {
        OR: [{ buyerId: userId }, { sellerId: userId }],
        messages: { some: {} },
      },
      include: {
        gig: { select: { id: true, title: true } },
        buyer: { select: { id: true, username: true, displayName: true, avatarUrl: true } },
        seller: { select: { id: true, username: true, displayName: true, avatarUrl: true } },
        messages: { orderBy: { createdAt: 'desc' }, take: 1 },
      },
    });

    const result = await Promise.all(
      orders.map(async (o) => {
        const unreadCount = await this.prisma.message.count({
          where: { orderId: o.id, senderId: { not: userId }, readAt: null },
        });
        const partner = o.buyerId === userId ? o.seller : o.buyer;
        const last = o.messages[0];
        return {
          orderId: o.id,
          status: o.status,
          gigTitle: o.gig?.title ?? null,
          partner,
          lastMessage: last?.content?.slice(0, 60) ?? null,
          lastMessageAt: last?.createdAt?.toISOString() ?? null,
          unreadCount,
        };
      }),
    );

    // Most recent activity first.
    return result.sort((a, b) =>
      (b.lastMessageAt ?? '').localeCompare(a.lastMessageAt ?? ''),
    );
  }

  async createMessage(orderId: number, senderId: number, content: string, attachments?: string[]) {
    const order = await this.prisma.order.findUnique({ where: { id: orderId } });
    if (!order) throw new NotFoundException('Order not found');
    // Sending is restricted to the order's buyer/seller (admins read-only here).
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

  /**
   * SPEC #4 RULE 2 — access control. Only the order's buyer, seller, or an
   * admin may access the conversation. Throws ForbiddenException otherwise.
   */
  private assertParticipant(
    order: { buyerId: number; sellerId: number },
    userId: number,
    role?: string,
  ) {
    if (role === 'admin') return;
    if (order.buyerId !== userId && order.sellerId !== userId) {
      throw new ForbiddenException('Access denied');
    }
  }
}
