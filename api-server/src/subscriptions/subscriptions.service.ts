import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { SubscriptionTier } from '@prisma/client';
import { TIER_GIG_LIMITS, TIER_LABELS } from './subscription-limits';

@Injectable()
export class SubscriptionsService {
  private readonly logger = new Logger(SubscriptionsService.name);

  constructor(private prisma: PrismaService) {}

  /**
   * S3-1: Activate or upgrade a user's subscription.
   *
   * Sets `subscriptionTier` and extends `subscriptionExpiresAt` by `durationDays`
   * from today. If the user already has an active subscription to the same or
   * higher tier, the expiry is extended rather than reset.
   *
   * Called by:
   *   - Admin UI / REST endpoint when a payment is confirmed.
   *   - PaymentsService after a successful TM CELL / TON payment.
   *
   * @param userId       Target user ID
   * @param tier         Desired tier ('pro' | 'business')
   * @param durationDays How many days the subscription is valid for
   */
  async activateSubscription(
    userId: number,
    tier: SubscriptionTier,
    durationDays: number,
  ): Promise<{ userId: number; tier: SubscriptionTier; expiresAt: Date }> {
    if (durationDays < 1 || durationDays > 3650) {
      throw new BadRequestException('durationDays must be between 1 and 3650');
    }

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, subscriptionTier: true, subscriptionExpiresAt: true },
    });
    if (!user) throw new NotFoundException(`User ${userId} not found`);

    // Extend from the current expiry if it's in the future, otherwise from today
    const now = new Date();
    const base = user.subscriptionExpiresAt && user.subscriptionExpiresAt > now
      ? user.subscriptionExpiresAt
      : now;

    const expiresAt = new Date(base);
    expiresAt.setDate(expiresAt.getDate() + durationDays);

    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: { subscriptionTier: tier, subscriptionExpiresAt: expiresAt },
      select: { id: true, subscriptionTier: true, subscriptionExpiresAt: true },
    });

    this.logger.log(
      `Subscription activated: userId=${userId} tier=${tier} ` +
      `durationDays=${durationDays} expiresAt=${expiresAt.toISOString()}`,
    );

    return {
      userId: updated.id,
      tier: updated.subscriptionTier,
      expiresAt: updated.subscriptionExpiresAt!,
    };
  }

  /**
   * Get subscription status and limits for a user.
   */
  async getStatus(userId: number) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { subscriptionTier: true, subscriptionExpiresAt: true },
    });
    if (!user) throw new NotFoundException(`User ${userId} not found`);

    const now = new Date();
    const isActive = !user.subscriptionExpiresAt || user.subscriptionExpiresAt > now;
    const tier = isActive ? user.subscriptionTier : 'free';

    return {
      tier,
      tierLabel: TIER_LABELS[tier] ?? tier,
      expiresAt: user.subscriptionExpiresAt?.toISOString() ?? null,
      isActive: user.subscriptionTier !== 'free' ? isActive : null, // null for free (no expiry)
      gigLimit: TIER_GIG_LIMITS[tier] ?? 3,
    };
  }

  /**
   * S3-1: Daily subscription expiry enforcement.
   *
   * Runs every night at 03:00. Finds all users whose `subscriptionExpiresAt`
   * is in the past (and who are not already on the free tier) and downgrades
   * them to `free`.
   *
   * Side-effects of downgrade:
   *   - The user's active gig count may now exceed `TIER_GIG_LIMITS['free']` (3).
   *   - Excess gigs are automatically paused — we pick the most recently created
   *     active gigs to keep (oldest ones get paused first) so the seller retains
   *     their best-performing gigs.
   *   - A Notification row is created for each affected user.
   *
   * ScheduleModule is registered globally in AppModule.
   */
  @Cron(CronExpression.EVERY_DAY_AT_3AM)
  async enforceSubscriptionExpiry(): Promise<void> {
    this.logger.log('Subscription expiry enforcement started');

    const now = new Date();

    // Find users with expired non-free subscriptions
    const expired = await this.prisma.user.findMany({
      where: {
        subscriptionTier: { not: 'free' },
        subscriptionExpiresAt: { lte: now },
      },
      select: { id: true, subscriptionTier: true },
    });

    if (expired.length === 0) {
      this.logger.log('No expired subscriptions found');
      return;
    }

    this.logger.log(`Downgrading ${expired.length} expired subscriptions to free`);

    const freeLimit = TIER_GIG_LIMITS['free'];
    let downgraded = 0;
    let gigsPaused = 0;

    for (const user of expired) {
      try {
        // Downgrade the tier
        await this.prisma.user.update({
          where: { id: user.id },
          data: { subscriptionTier: 'free' },
        });

        // Find active gigs sorted oldest-first (we keep the newest freeLimit gigs)
        const activeGigs = await this.prisma.gig.findMany({
          where: { sellerId: user.id, status: 'active' },
          orderBy: { createdAt: 'asc' },  // oldest first
          select: { id: true },
        });

        // Pause excess gigs (oldest ones, to preserve the best-performing recent ones)
        const excessGigs = activeGigs.slice(0, Math.max(0, activeGigs.length - freeLimit));
        if (excessGigs.length > 0) {
          const { count } = await this.prisma.gig.updateMany({
            where: { id: { in: excessGigs.map(g => g.id) } },
            data: { status: 'paused' },
          });
          gigsPaused += count;
        }

        // Notify the user
        await this.prisma.notification.create({
          data: {
            userId: user.id,
            type: 'subscription_expired',
            title: '⚠️ Подписка истекла',
            body:
              `Ваша ${TIER_LABELS[user.subscriptionTier] ?? user.subscriptionTier} подписка истекла. ` +
              `Аккаунт переведён на Free (максимум ${freeLimit} активных гигов). ` +
              (excessGigs.length > 0
                ? `${excessGigs.length} гиг(ов) приостановлено — обновите подписку, чтобы возобновить их.`
                : 'Все ваши гиги остаются активными.'),
            data: { previousTier: user.subscriptionTier, gigsPaused: excessGigs.length },
            channel: 'in_app',
          },
        });

        downgraded++;
      } catch (err) {
        this.logger.error(`Failed to downgrade userId=${user.id}: ${err}`);
      }
    }

    this.logger.log(
      `Subscription expiry enforcement complete — ` +
      `${downgraded}/${expired.length} users downgraded, ${gigsPaused} gigs paused`,
    );
  }
}
