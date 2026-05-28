import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class PaymentsService {
  constructor(private prisma: PrismaService) {}

  async create(userId: number, amountManat: string, screenshotUrl?: string, note?: string) {
    return this.prisma.payment.create({
      data: {
        userId,
        amountManat: parseFloat(amountManat),
        screenshotUrl,
        note,
        status: 'pending',
      },
    });
  }

  async listMyPayments(userId: number) {
    return this.prisma.payment.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
  }
}
