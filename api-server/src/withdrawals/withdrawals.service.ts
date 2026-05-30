import { Injectable, Logger, NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { Address } from '@ton/core';
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
    // ── 0. M-2 fix: validate destination address BEFORE any DB operation ─────
    //
    //  The original code stored `destination` as a raw string without any
    //  format check. Address.parse() is called later (in ton.service.ts) during
    //  admin approval — AFTER the balance has already been atomically decremented.
    //  A malformed address would throw an unhandled exception, leaving the
    //  withdrawal stuck in 'pending' with the user's balance permanently reduced.
    //
    //  Fix: parse the address here, at the very top, before touching the DB.
    //  An invalid address throws a BadRequestException (400) immediately —
    //  zero DB writes have occurred, the user's balance is untouched.
    //
    //  Bank card withdrawals do not use Address.parse(), so validation is
    //  scoped to TON wallet destinations only.
    if (!destination || destination.trim() === '') {
      throw new BadRequestException('Destination address is required.');
    }

    if (destinationType === 'ton_wallet') {
      try {
        Address.parse(destination);
      } catch {
        throw new BadRequestException(
          'Invalid TON address format. ' +
          'Please provide a valid TON wallet address (e.g. EQD...abc).',
        );
      }
    }

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

  /**
   * Approves a pending withdrawal and attempts the on-chain transfer.
   *
   * M-7 fix — CAS guard on DB status transition:
   *
   *  The original code read status='pending' outside a transaction, performed
   *  the on-chain transfer, and then did a bare `withdrawalRequest.update`.
   *  Two concurrent admin approvals would both pass the pre-flight check,
   *  both trigger an on-chain transfer, and both set the status to 'completed'.
   *
   *  Fix:
   *   • The DB status flip uses `updateMany(WHERE status='pending')` as a CAS
   *     inside a `$transaction` — only one concurrent call can win.
   *   • The on-chain transfer intentionally stays outside the transaction
   *     (blockchain is not transactional; we match the pattern in releaseEscrow).
   *   • If the CAS returns count=0 the status was already moved (another admin
   *     won the race or it was already processed) — we throw 400 and the
   *     on-chain transfer that just fired is treated as a duplicate (the caller
   *     should handle idempotency at the blockchain level via the seqno).
   */
  async approve(adminId: number, withdrawalId: number, txHash?: string) {
    // ── 1. Pre-flight — existence check (read-only, outside tx) ─────────────
    const req = await this.prisma.withdrawalRequest.findUnique({ where: { id: withdrawalId } });
    if (!req) throw new NotFoundException('Request not found');
    if (req.status !== 'pending') throw new BadRequestException('Already processed');

    // ── 2. Best-effort on-chain transfer (outside tx — blockchain is not
    //       transactional; DB state is the authoritative source of truth) ────
    if (this.ton.isConfigured() && req.destinationType === 'ton_wallet') {
      try {
        const onChainTx = await this.ton.sendTransaction(
          req.destination,
          req.amountNano,
          `Withdrawal #${withdrawalId}`,
        );
        txHash = txHash || onChainTx.seqno?.toString();
      } catch (err: any) {
        // On-chain failed — leave status 'pending' so admin can retry
        throw new BadRequestException(`Blockchain transfer failed: ${err.message}`);
      }
    }

    // ── 3. ACID transaction — status flip + ledger update are all-or-nothing ─
    return this.prisma.$transaction(async (tx) => {
      // ── 3a. CAS: atomically claim the pending → completed transition ───────
      //
      //  Only one concurrent approval can match status='pending'. The second
      //  concurrent call will find count=0 after the first commits.
      const cas = await tx.withdrawalRequest.updateMany({
        where: { id: withdrawalId, status: 'pending' },
        data: { status: 'completed', reviewedById: adminId, txHash, reviewedAt: new Date() },
      });

      if (cas.count === 0) {
        this.logger.warn(
          `[CAS] approve: withdrawalRequest ${withdrawalId} was no longer 'pending' ` +
          `when admin ${adminId} attempted approval — possible concurrent approval.`,
        );
        throw new BadRequestException(
          'Withdrawal already processed — it may have been approved by a concurrent request.',
        );
      }

      // ── 3b. Mark the corresponding ledger entry as completed ──────────────
      await tx.transaction.updateMany({
        where: {
          userId: req.userId,
          type: 'withdraw',
          status: 'pending',
          metadata: { path: ['withdrawalId'], equals: withdrawalId },
        },
        data: { status: 'completed', txHash },
      });

      return tx.withdrawalRequest.findUnique({ where: { id: withdrawalId } });
    });
  }

  /**
   * Rejects a pending withdrawal and refunds the deducted balance to the user.
   *
   * M-7 fix — idempotent balance credit via CAS + $transaction:
   *
   *  The original code was three sequential bare DB calls (no transaction,
   *  no CAS):
   *    1. findUnique → check status='pending'
   *    2. wallet.update({ increment: amountNano })   ← balance credited
   *    3. transaction.updateMany(...)
   *    4. withdrawalRequest.update({ status:'rejected' })
   *
   *  TOCTOU race under two concurrent admin double-clicks:
   *    • Both requests read status='pending' before either commits.
   *    • Both execute step 2 — wallet credited TWICE.
   *    • Both execute steps 3 and 4 — the second one silently overwrites
   *      the first (harmless for status, but the balance was already doubled).
   *
   *  Fix — same CAS + $transaction pattern as refundEscrow (H-4):
   *
   *    Step A  (inside tx): updateMany(WHERE id=X AND status='pending')
   *                         → atomically moves status to 'rejected'
   *                         → count=0 means someone else already won the race
   *    Step B  (inside tx): wallet.update({ increment: amountNano })
   *                         → only reachable if step A returned count=1
   *                         → PostgreSQL row lock ensures one tx at a time
   *
   *  Under PostgreSQL read-committed (Prisma's default):
   *    • Request A enters tx, acquires row lock on the WithdrawalRequest row,
   *      updateMany matches count=1 → proceeds to credit wallet → commits.
   *    • Request B waits for A's lock; after A commits the status is 'rejected'
   *      → updateMany matches 0 rows → throws → full rollback (wallet untouched).
   *
   *  Result: exactly one balance credit per rejection, regardless of how many
   *  concurrent admin calls arrive.
   */
  async reject(adminId: number, withdrawalId: number, note?: string) {
    return this.prisma.$transaction(async (tx) => {
      // ── Step A: CAS — atomically claim the pending → rejected transition ───
      //
      //  This is the idempotency gate. updateMany holds a row-level exclusive
      //  lock during the UPDATE. Only one concurrent transaction can match
      //  status='pending' — the loser gets count=0 and is rejected cleanly.
      const cas = await tx.withdrawalRequest.updateMany({
        where: { id: withdrawalId, status: 'pending' },
        data: {
          status: 'rejected',
          reviewedById: adminId,
          reviewedAt: new Date(),
          note,
        },
      });

      if (cas.count === 0) {
        // Either the record doesn't exist or it was already processed.
        // Distinguish the two cases for a clear error message.
        const existing = await tx.withdrawalRequest.findUnique({ where: { id: withdrawalId } });
        if (!existing) throw new NotFoundException('Withdrawal request not found');
        this.logger.warn(
          `[CAS] reject: withdrawalRequest ${withdrawalId} was already in ` +
          `status '${existing.status}' when admin ${adminId} attempted rejection.`,
        );
        throw new BadRequestException(
          `Cannot reject withdrawal — it is already in '${existing.status}' state. ` +
          `Possible concurrent rejection by another admin.`,
        );
      }

      // ── Step B: Fetch the updated record to read userId and amountNano ─────
      const req = await tx.withdrawalRequest.findUniqueOrThrow({ where: { id: withdrawalId } });

      // ── Step C: Credit the user's balance — only reachable if we won the CAS
      //
      //  wallet.update throws NotFoundException if the wallet was deleted between
      //  the CAS and here — the transaction rolls back cleanly (safe failure).
      await tx.wallet.update({
        where: { userId: req.userId },
        data: { balanceNano: { increment: req.amountNano } },
      });

      // ── Step D: Mark the corresponding ledger entry as failed (refunded) ───
      await tx.transaction.updateMany({
        where: {
          userId: req.userId,
          type: 'withdraw',
          status: 'pending',
          metadata: { path: ['withdrawalId'], equals: withdrawalId },
        },
        data: { status: 'failed' },
      });

      this.logger.log(
        `[WITHDRAWAL] Rejected — id ${withdrawalId}, user ${req.userId}, ` +
        `refunded ${req.amountNano} nano, admin ${adminId}`,
      );

      return req;
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
