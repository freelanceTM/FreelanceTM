import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { PrismaService } from '../prisma/prisma.service';
import { EVENTS, OrderStatusChangedEvent } from '../events/notification.events';
import {
  REFERRAL_BONUS_NANO,
  REFERRAL_CODE_PREFIX,
  REFERRAL_CODE_CHARS,
  REFERRAL_CODE_LENGTH,
} from './referral-config';

@Injectable()
export class ReferralsService {
  private readonly logger = new Logger(ReferralsService.name);

  constructor(private readonly prisma: PrismaService) {}

  // ─── Code generation ───────────────────────────────────────────────────────

  /**
   * Returns the caller's referral code.
   * Generates and persists a unique code if the user does not yet have one.
   *
   * Format: REF-<8 uppercase alphanumeric chars>
   * Collision retry: up to 5 attempts before giving up (astronomically unlikely
   * even at millions of users given 32^8 ≈ 1 trillion combinations).
   */
  async getOrCreateCode(userId: number): Promise<string> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { referralCode: true },
    });
    if (!user) throw new NotFoundException('User not found');
    if (user.referralCode) return user.referralCode;

    // Generate a new unique code with retry
    for (let attempt = 0; attempt < 5; attempt++) {
      const suffix = Array.from({ length: REFERRAL_CODE_LENGTH }, () =>
        REFERRAL_CODE_CHARS[Math.floor(Math.random() * REFERRAL_CODE_CHARS.length)],
      ).join('');
      const code = `${REFERRAL_CODE_PREFIX}-${suffix}`;

      try {
        const updated = await this.prisma.user.update({
          where: { id: userId },
          data: { referralCode: code },
          select: { referralCode: true },
        });
        return updated.referralCode!;
      } catch {
        // P2002 unique constraint — collision, retry with a new code
        this.logger.warn(`Referral code collision on attempt ${attempt + 1}: ${code}`);
      }
    }
    throw new BadRequestException('Could not generate a unique referral code — please try again');
  }

  // ─── Apply a referral code ─────────────────────────────────────────────────

  /**
   * Applies a referral code to the caller's account.
   *
   * Business rules:
   *  1. Self-referral is forbidden.
   *  2. A user can only be referred once (User.referredById is unique once set).
   *  3. The referral code must belong to an existing user.
   *  4. Creates a Referral row { status: 'pending' } and sets User.referredById.
   *
   * Idempotency:
   *  If the user is already referred by the same referrer, this is a no-op
   *  and returns the existing Referral record.
   */
  async applyCode(userId: number, code: string): Promise<object> {
    const normalised = code.trim().toUpperCase();

    // 1. Find referrer by code
    const referrer = await this.prisma.user.findUnique({
      where: { referralCode: normalised },
      select: { id: true },
    });
    if (!referrer) throw new NotFoundException('Referral code not found');

    // 2. Self-referral guard
    if (referrer.id === userId) {
      throw new BadRequestException('You cannot refer yourself');
    }

    // 3. Already-referred guard — check if Referral row exists
    const alreadyReferred = await this.prisma.referral.findUnique({
      where: { referredId: userId },
    });
    if (alreadyReferred) {
      if (alreadyReferred.referrerId === referrer.id) {
        // Idempotent: same referrer, same user — no-op
        return alreadyReferred;
      }
      throw new ConflictException('You have already applied a referral code');
    }

    // 4. Also check User.referredById (belt-and-suspenders)
    const self = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { referredById: true },
    });
    if (self?.referredById) {
      throw new ConflictException('You have already been referred by another user');
    }

    // 5. Create Referral record + link User.referredById atomically
    const referral = await this.prisma.$transaction(async (tx) => {
      const ref = await tx.referral.create({
        data: {
          referrerId: referrer.id,
          referredId: userId,
          status: 'pending',
        },
      });
      await tx.user.update({
        where: { id: userId },
        data: { referredById: referrer.id },
      });
      return ref;
    });

    this.logger.log(
      `[REFERRAL] Applied — referrer ${referrer.id} → referred user ${userId} (code ${normalised})`,
    );
    return referral;
  }

  // ─── Bonus payout — triggered by the first completed order ────────────────

  /**
   * Listens to order status changes.
   *
   * When a buyer's order reaches 'completed':
   *  1. Check if the buyer was referred (Referral { referredId=buyerId, status='pending' })
   *  2. CAS: atomically flip status 'pending' → 'completed' (prevents double-pay)
   *  3. Credit the referrer's wallet with REFERRAL_BONUS_NANO
   *  4. Record an immutable Transaction(type='referral_bonus') ledger entry
   *  5. Mark Referral status → 'paid' and record bonusEarnedNano
   *
   * Concurrency: the CAS on the Referral row is the idempotency gate.
   * Only one concurrent call can flip pending→completed; the rest see count=0.
   */
  @OnEvent(EVENTS.ORDER_STATUS_CHANGED)
  async onOrderStatusChanged(payload: OrderStatusChangedEvent): Promise<void> {
    if (payload.newStatus !== 'completed') return;

    const buyerId = payload.buyerId;

    // Fast check: does the buyer even have a referral? (No DB join needed)
    const referral = await this.prisma.referral.findUnique({
      where: { referredId: buyerId },
      select: { id: true, referrerId: true, status: true },
    });
    if (!referral || referral.status !== 'pending') return;

    // CAS — atomically claim the pending → completed transition
    const cas = await this.prisma.referral.updateMany({
      where: { id: referral.id, status: 'pending' },
      data: { status: 'completed', completedAt: new Date() },
    });
    if (cas.count === 0) {
      // Another concurrent event already processed this referral
      this.logger.warn(`[REFERRAL] CAS miss for referral ${referral.id} — already completed`);
      return;
    }

    // Credit wallet + ledger inside a single transaction
    try {
      await this.prisma.$transaction(async (tx) => {
        // Credit referrer's wallet
        const walletUpdate = await tx.wallet.updateMany({
          where: { userId: referral.referrerId },
          data: { balanceNano: { increment: REFERRAL_BONUS_NANO } },
        });
        if (walletUpdate.count === 0) {
          this.logger.warn(
            `[REFERRAL] Referrer ${referral.referrerId} has no wallet — bonus skipped`,
          );
          // Don't throw — the referral is still marked completed, bonus just not credited
          return;
        }

        // Immutable ledger entry
        await tx.transaction.create({
          data: {
            userId: referral.referrerId,
            type: 'referral_bonus',
            status: 'completed',
            amountNano: REFERRAL_BONUS_NANO,
            currency: 'TON',
            metadata: {
              referralId: referral.id,
              referredUserId: buyerId,
              orderId: payload.orderId,
            },
          },
        });

        // Mark referral 'paid' + record bonus amount
        await tx.referral.update({
          where: { id: referral.id },
          data: { status: 'paid', bonusEarnedNano: REFERRAL_BONUS_NANO },
        });
      });

      this.logger.log(
        `[REFERRAL] Bonus paid — referrer ${referral.referrerId} earned ` +
        `${REFERRAL_BONUS_NANO} nano for referring user ${buyerId} (order ${payload.orderId})`,
      );
    } catch (err: any) {
      // Don't crash the event — log and alert
      this.logger.error(
        `[REFERRAL] Failed to credit bonus for referral ${referral.id}: ${err.message}`,
        err.stack,
      );
    }
  }

  // ─── Query endpoints ───────────────────────────────────────────────────────

  /**
   * Returns all users referred by the caller, with their current status.
   *
   * Response shape per entry:
   *  { referredUserId, referredUsername, status, bonusEarnedNano, createdAt, completedAt }
   */
  async listMyReferrals(userId: number): Promise<object[]> {
    const referrals = await this.prisma.referral.findMany({
      where: { referrerId: userId },
      orderBy: { createdAt: 'desc' },
      include: {
        // Prisma relation: Referral.referredId → User
        // We select only public-safe fields
      },
    });

    // Enrich with referred user data
    const referredIds = referrals.map(r => r.referredId);
    const users = await this.prisma.user.findMany({
      where: { id: { in: referredIds } },
      select: { id: true, username: true, displayName: true, avatarUrl: true },
    });
    const userMap = new Map(users.map(u => [u.id, u]));

    return referrals.map(r => ({
      id: r.id,
      referredUserId: r.referredId,
      referredUser: userMap.get(r.referredId) ?? null,
      status: r.status,                          // pending | completed | paid
      bonusEarnedNano: r.bonusEarnedNano.toString(),
      createdAt: r.createdAt.toISOString(),
      completedAt: r.completedAt?.toISOString() ?? null,
    }));
  }

  /**
   * Summary stats for the caller's referral activity.
   *
   * { code, totalReferrals, pendingCount, paidCount, totalBonusNano }
   */
  async getStats(userId: number): Promise<object> {
    const [user, referrals] = await Promise.all([
      this.prisma.user.findUnique({
        where: { id: userId },
        select: { referralCode: true },
      }),
      this.prisma.referral.findMany({
        where: { referrerId: userId },
        select: { status: true, bonusEarnedNano: true },
      }),
    ]);
    if (!user) throw new NotFoundException('User not found');

    const totalBonusNano = referrals.reduce(
      (acc, r) => acc + r.bonusEarnedNano,
      0n,
    );

    return {
      code: user.referralCode ?? null,
      totalReferrals: referrals.length,
      pendingCount: referrals.filter(r => r.status === 'pending').length,
      completedCount: referrals.filter(r => r.status === 'completed').length,
      paidCount: referrals.filter(r => r.status === 'paid').length,
      totalBonusNano: totalBonusNano.toString(),
      bonusPerReferralNano: REFERRAL_BONUS_NANO.toString(),
    };
  }
}
