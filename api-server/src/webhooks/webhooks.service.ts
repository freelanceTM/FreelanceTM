import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class WebhooksService {
  constructor(private prisma: PrismaService) {}

  async create(userId: number, data: { url: string; events: string[]; secret?: string }) {
    return this.prisma.webhook.create({
      data: {
        userId,
        url: data.url,
        secret: data.secret || this.generateSecret(),
        events: data.events || [],
        isActive: true,
      },
    });
  }

  async list(userId: number) {
    return this.prisma.webhook.findMany({ where: { userId }, orderBy: { createdAt: 'desc' } });
  }

  async delete(userId: number, id: string) {
    const wh = await this.prisma.webhook.findUnique({ where: { id } });
    if (!wh || wh.userId !== userId) throw new Error('Not found');
    return this.prisma.webhook.delete({ where: { id } });
  }

  async dispatch(event: string, payload: any) {
    const hooks = await this.prisma.webhook.findMany({
      where: { isActive: true, events: { has: event } },
    });

    for (const hook of hooks) {
      try {
        const res = await fetch(hook.url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Webhook-Secret': hook.secret,
            'X-Webhook-Event': event,
          },
          body: JSON.stringify({ event, payload, timestamp: new Date().toISOString() }),
        });
        if (!res.ok) {
          await this.prisma.webhook.update({
            where: { id: hook.id },
            data: { lastError: `${res.status}: ${await res.text().catch(() => '')}` },
          });
        }
      } catch (err: any) {
        await this.prisma.webhook.update({
          where: { id: hook.id },
          data: { lastError: err.message },
        });
      }
    }
  }

  private generateSecret() {
    const arr = new Uint8Array(32);
    crypto.getRandomValues(arr);
    return Array.from(arr).map((b) => b.toString(16).padStart(2, '0')).join('');
  }
}
