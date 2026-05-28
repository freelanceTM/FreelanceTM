import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class PromocodesService {
  constructor(private prisma: PrismaService) {}

  async create(data: { code: string; type: string; value: number; maxUses?: number; expiresAt?: Date }) {
    return this.prisma.promoCode.create({
      data: {
        code: data.code.toUpperCase(),
        type: data.type,
        value: data.value,
        maxUses: data.maxUses || 1,
        expiresAt: data.expiresAt,
        usedCount: 0,
        isActive: true,
      },
    });
  }

  async validate(code: string) {
    const pc = await this.prisma.promoCode.findUnique({ where: { code: code.toUpperCase() } });
    if (!pc || !pc.isActive) return null;
    if (pc.maxUses && pc.usedCount >= pc.maxUses) return null;
    if (pc.expiresAt && pc.expiresAt < new Date()) return null;
    return pc;
  }

  async apply(code: string, userId: number) {
    const pc = await this.validate(code);
    if (!pc) return null;

    await this.prisma.promoCode.update({
      where: { id: pc.id },
      data: { usedCount: { increment: 1 } },
    });

    // If referral logic embedded here
    if (code.startsWith('REF')) {
      // Lookup referrer
    }

    return pc;
  }

  async list() {
    return this.prisma.promoCode.findMany({ orderBy: { createdAt: 'desc' } });
  }
}
