import { Injectable } from '@nestjs/common';
import { createHmac } from 'crypto';
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
        // M-3 fix — HMAC-SHA256 payload signing:
        //
        //  The original code transmitted the raw `hook.secret` in the
        //  `X-Webhook-Secret` header. This exposes the long-lived shared secret
        //  in every request (logs, proxies, CDN edge nodes). An intercepted
        //  request leaks the secret permanently; the attacker can then forge
        //  arbitrary future payloads.
        //
        //  Fix: never send the secret itself. Instead sign the serialised body
        //  with HMAC-SHA256 (same scheme used by GitHub, Stripe, Shopify):
        //
        //    signature = hex(HMAC-SHA256(key=hook.secret, msg=body))
        //
        //  The `X-Webhook-Signature` header carries only the derived MAC — the
        //  secret stays on both sides and is never transmitted. Receivers verify
        //  by computing the same HMAC over the raw body and comparing with
        //  timingSafeEqual to prevent timing oracles.
        //
        //  `X-Webhook-Timestamp` lets receivers reject replayed requests older
        //  than their tolerance window (recommended: 5 minutes).
        const timestamp   = new Date().toISOString();
        const body        = JSON.stringify({ event, payload, timestamp });
        const signature   = createHmac('sha256', hook.secret).update(body).digest('hex');

        const res = await fetch(hook.url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Webhook-Event':     event,
            'X-Webhook-Timestamp': timestamp,
            'X-Webhook-Signature': `sha256=${signature}`,
          },
          body,
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
