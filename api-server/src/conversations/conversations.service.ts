import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class ConversationsService {
  constructor(private prisma: PrismaService) {}

  async getOrCreateDirect(userId: number, otherUserId: number) {
    // Find existing direct conversation
    const existing = await this.prisma.conversation.findFirst({
      where: {
        type: 'direct',
        participants: { every: { userId: { in: [userId, otherUserId] } } },
      },
      include: { participants: true },
    });

    if (existing && existing.participants.length === 2) {
      return this.enrich(existing.id, userId);
    }

    const conv = await this.prisma.conversation.create({
      data: {
        type: 'direct',
        participants: {
          create: [
            { userId },
            { userId: otherUserId },
          ],
        },
      },
      include: { participants: { include: { user: { select: { id: true, username: true, displayName: true, avatarUrl: true } } } } },
    });
    return this.enrich(conv.id, userId);
  }

  async listMy(userId: number) {
    const convs = await this.prisma.conversation.findMany({
      where: { participants: { some: { userId } } },
      orderBy: { lastMessageAt: 'desc' },
      include: {
        participants: { include: { user: { select: { id: true, username: true, displayName: true, avatarUrl: true } } } },
        messages: { orderBy: { createdAt: 'desc' }, take: 1 },
      },
    });

    return convs.map((c) => {
      const other = c.participants.find((p) => p.userId !== userId)?.user;
      const unread = c.messages.filter((m) => m.senderId !== userId && !m.readAt).length;
      return {
        id: c.id,
        type: c.type,
        otherUser: other,
        lastMessage: c.messages[0]?.content?.slice(0, 60),
        lastMessageAt: c.lastMessageAt,
        unreadCount: unread,
      };
    });
  }

  async getMessages(conversationId: number, userId: number, page = 1, limit = 50) {
    const participant = await this.prisma.conversationParticipant.findUnique({
      where: { conversationId_userId: { conversationId, userId } },
    });
    if (!participant) throw new ForbiddenException('Not in conversation');

    const [messages, total] = await Promise.all([
      this.prisma.chatMessage.findMany({
        where: { conversationId },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        include: { sender: { select: { id: true, username: true, displayName: true, avatarUrl: true } } },
      }),
      this.prisma.chatMessage.count({ where: { conversationId } }),
    ]);

    // Mark read
    await this.prisma.chatMessage.updateMany({
      where: { conversationId, senderId: { not: userId }, readAt: null },
      data: { readAt: new Date() },
    });

    return {
      data: messages.reverse().map((m) => ({
        ...m,
        createdAt: m.createdAt.toISOString(),
        readAt: m.readAt?.toISOString() || null,
      })),
      meta: { total, page, limit },
    };
  }

  async sendMessage(conversationId: number, senderId: number, content: string, attachments?: string[]) {
    const participant = await this.prisma.conversationParticipant.findUnique({
      where: { conversationId_userId: { conversationId, senderId } },
    });
    if (!participant) throw new ForbiddenException('Not in conversation');

    const msg = await this.prisma.chatMessage.create({
      data: {
        conversationId,
        senderId,
        content,
        attachments: attachments || [],
      },
      include: { sender: { select: { id: true, username: true, displayName: true, avatarUrl: true } } },
    });

    await this.prisma.conversation.update({
      where: { id: conversationId },
      data: { lastMessageAt: new Date() },
    });

    return { ...msg, createdAt: msg.createdAt.toISOString(), readAt: null };
  }

  private async enrich(conversationId: number, userId: number) {
    const conv = await this.prisma.conversation.findUnique({
      where: { id: conversationId },
      include: { participants: { include: { user: { select: { id: true, username: true, displayName: true, avatarUrl: true } } } } },
    });
    const other = conv?.participants.find((p) => p.userId !== userId)?.user;
    return { id: conv?.id, type: conv?.type, otherUser: other };
  }
}
