import { Injectable, Logger, NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { TonService } from '../ton/ton.service';

@Injectable()
export class WithdrawalsService {
  private readonly logger = new Logger(WithdrawalsService.name);

  constructor(
    private prisma: PrismaService,
    private ton: TonService,
  ) {}

  /**
   * Requests a withdrawal, atomically deducting the balance from the user's
   * custodial wallet.
   *
   * Overdraft protection (C-4):
   *   The balance check and deduction are combined into one atomic
   *   compare-and-swap UPDATE:
   *
   *     UPDATE wallets
   *        SET balance_nano = balance_nano - amountNano
   *      WHERE user_id = ? AND balance_nano >= amountNano
   *
   *   PostgreSQL acquires a row-level exclusive lock during the UPDATE.
   *   Under two concurrent requests where the combined withdrawal would
   *   exceed the available balance:
   *     • Request A gets the lock → WHERE matches → count=1 → balance deducted.
   *     • Request B waits for A's lock; after A commits the remaining balance
   *       may be below amountNano → WHERE matches 0 rows → count=0 → throws
   *       → full rollback (no withdrawal record, no ledger entry created).
   *
   *   All three writes (wallet deduction, WithdrawalRequest record, Transaction
   *   ledger entry) share a single $transaction boundary — if any step fails,
   *   everything rolls back.
   */
  async requestWithdrawal(userId: number, amountNano: bigint, destination: string, destinationType = 'ton_wallet') {
    // ── 1. Pre-flight: verify user and wallet exist (read-only, outside tx) ──
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { wallet: true },
    });

    if (!user || !user.wallet) throw new NotFoundException('User/wallet not found');

    if (amountNano <= 0n) {
      throw new BadRequestException('Withdrawal amount must be greater than zero');
    }

    // ── 2. ACID transaction — balance deduction + records are all-or-nothing ──
    const req = await this.prisma.$transaction(async (tx) => {
      // ── 2a. Atomic compare-and-swap deduction ─────────────────────────────
      //
      //  WHERE balance_nano >= amountNano ensures the check and deduction
      //  happen in one SQL statement under a row lock. No concurrent request
      //  can read a stale balance and overdraw.
      const deducted = await tx.wallet.updateMany({
        where: {
          userId,
          balanceNano: { gte: amountNano },
        },
        data: { balanceNano: { decrement: amountNano } },
      });

      if (deducted.count === 0) {
        this.logger.warn(
          `[CAS] requestWithdrawal failed for user ${userId} — ` +
          `requested ${amountNano} nano but balance is insufficient (possible concurrent withdrawal).`,
        );
        throw new BadRequestException('Insufficient balance');
      }

      // ── 2b. Create the withdrawal request record ──────────────────────────
      const withdrawalReq = await tx.withdrawalRequest.create({
        data: {
          userId,
          amountNano,
          destination,
          destinationType,
          currency: 'TON',
          status: 'pending',
        },
      });

      // ── 2c. Immutable accounting ledger entry (negative = debit) ─────────
      await tx.transaction.create({
        data: {
          userId,
          type: 'withdraw',
          status: 'pending',
          amountNano: amountNano * -1n,
          currency: 'TON',
          metadata: { withdrawalId: withdrawalReq.id, destination },
        },
      });

      return withdrawalReq;
    }); // ← rolls back wallet deduction + both records if any step throws

    this.logger.log(
      `[WITHDRAWAL] Requested — user ${userId}, amount ${amountNano} nano, ` +
      `dest ${destination}, requestId ${req.id}`,
    );

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
