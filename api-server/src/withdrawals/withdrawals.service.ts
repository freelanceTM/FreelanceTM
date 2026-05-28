import { Injectable, NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { TonService } from '../ton/ton.service';
import { Prisma } from '@prisma/client';

@Injectable()
export class WithdrawalsService {
  constructor(
    private prisma: PrismaService,
    private ton: TonService,
  ) {}

  async requestWithdrawal(userId: number, amountNano: bigint, destination: string, destinationType = 'ton_wallet') {
    const user = await this.prisma.user.findUnique({ where: { id: userId }, include: { wallet: true } });
    if (!user || !user.wallet) throw new NotFoundException('User/wallet not found');
    if (user.wallet.balanceNano < amountNano) throw new BadRequestException('Insufficient balance');

    // Deduct immediately (pending)
    await this.prisma.wallet.update({
      where: { userId },
      data: { balanceNano: { decrement: amountNano } },
    });

    const req = await this.prisma.withdrawalRequest.create({
      data: {
        userId,
        amountNano,
        destination,
        destinationType,
        currency: 'TON',
        status: 'pending',
      },
    });

    // Record transaction
    await this.prisma.transaction.create({
      data: {
        userId,
        type: 'withdraw',
        status: 'pending',
        amountNano: amountNano * -1n,
        currency: 'TON',
        metadata: { withdrawalId: req.id, destination },
      },
    });

    return req;
  }

  async approve(adminId: number, withdrawalId: number, txHash?: string) {
    const req = await this.prisma.withdrawalRequest.findUnique({ where: { id: withdrawalId } });
    if (!req) throw new NotFoundException('Request not found');
    if (req.status !== 'pending') throw new BadRequestException('Already processed');

    // Try on-chain transfer if configured
    if (this.ton.isConfigured() && req.destinationType === 'ton_wallet') {
      try {
        const tx = await this.ton.sendTransaction(req.destination, req.amountNano, `Withdrawal #${withdrawalId}`);
        txHash = txHash || tx.seqno?.toString();
      } catch (err: any) {
        // On-chain failed — keep pending for manual retry
        throw new BadRequestException(`Blockchain transfer failed: ${err.message}`);
      }
    }

    const updated = await this.prisma.withdrawalRequest.update({
      where: { id: withdrawalId },
      data: { status: 'completed', reviewedById: adminId, txHash, reviewedAt: new Date() },
    });

    await this.prisma.transaction.updateMany({
      where: { userId: req.userId, type: 'withdraw', status: 'pending', metadata: { path: ['withdrawalId'], equals: withdrawalId } },
      data: { status: 'completed', txHash },
    });

    return updated;
  }

  async reject(adminId: number, withdrawalId: number, note?: string) {
    const req = await this.prisma.withdrawalRequest.findUnique({ where: { id: withdrawalId } });
    if (!req) throw new NotFoundException('Request not found');
    if (req.status !== 'pending') throw new BadRequestException('Already processed');

    // Refund balance
    await this.prisma.wallet.update({
      where: { userId: req.userId },
      data: { balanceNano: { increment: req.amountNano } },
    });

    await this.prisma.transaction.updateMany({
      where: { userId: req.userId, type: 'withdraw', status: 'pending', metadata: { path: ['withdrawalId'], equals: withdrawalId } },
      data: { status: 'failed' },
    });

    return this.prisma.withdrawalRequest.update({
      where: { id: withdrawalId },
      data: { status: 'rejected', reviewedById: adminId, reviewedAt: new Date(), note },
    });
  }

  async listMy(userId: number) {
    return this.prisma.withdrawalRequest.findMany({ where: { userId }, orderBy: { createdAt: 'desc' } });
  }

  async listPending() {
    return this.prisma.withdrawalRequest.findMany({
      where: { status: 'pending' },
      orderBy: { createdAt: 'asc' },
      include: { user: { select: { username: true, displayName: true, wallet: { select: { address: true, balanceNano: true } } } } },
    });
  }
}
