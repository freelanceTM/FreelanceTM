import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { PrismaService } from '../prisma/prisma.service';
import { OrderStatusChangedEvent, ReviewApprovedEvent } from '../events/notification.events';

@Injectable()
export class LevelsService {
  private readonly logger = new Logger(LevelsService.name);

  constructor(private prisma: PrismaService) {}

  /**
   * Hook 1: fires whenever an order changes status.
   * Only acts on 'completed' transitions — the moment user.completedOrders
   * is bumped (by EscrowService.releaseEscrow), re-evaluate the seller's tier.
   */
  @OnEvent('order.status_changed')
  async onOrderStatusChanged(payload: OrderStatusChangedEvent): Promise<void> {
    if (payload.newStatus === 'completed') {
      await this.recalculateSellerLevel(payload.sellerId);
    }
  }

  /**
   * Hook 2: fires after AdminService approves a review.
   * The review approval updates user.rating (via ReviewsService), so we
   * re-evaluate the tier immediately after that write propagates.
   *
   * Both hooks converge on the same idempotent recalculateSellerLevel().
   */
  @OnEvent('review.approved')
  async onReviewApproved(payload: ReviewApprovedEvent): Promise<void> {
    const review = await this.prisma.review.findUnique({
      where: { id: payload.reviewId },
      select: { targetId: true },
    });
    if (review) await this.recalculateSellerLevel(review.targetId);
  }

  /**
   * S2-1: Seller Level Automation
   *
   * Reads the seller's current completedOrders and rating (both already
   * maintained by EscrowService and ReviewsService respectively) and maps
   * them to a UserLevel tier using strictly ordered thresholds.
   *
   * Thresholds:
   *   pro    → completedOrders >= 200 AND rating >= 4.8
   *   top    → completedOrders >= 50  AND rating >= 4.5
   *   rising → completedOrders >= 10  AND rating >= 4.2
   *   new    → anything below the above
   *
   * Both conditions must be satisfied — high volume with a poor rating does
   * not promote, and a high rating with few orders does not promote either.
   *
   * The update is a no-op if the computed level equals the stored level,
   * preventing spurious writes and audit-log noise.
   */
  async recalculateSellerLevel(userId: number): Promise<void> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, completedOrders: true, rating: true, level: true },
    });
    if (!user) {
      this.logger.warn(`recalculateSellerLevel: user ${userId} not found`);
      return;
    }

    const { completedOrders, rating } = user;

    // Evaluate from highest tier to lowest — first match wins
    let newLevel: string = 'new';
    if (completedOrders >= 200 && rating >= 4.8) newLevel = 'pro';
    else if (completedOrders >= 50 && rating >= 4.5) newLevel = 'top';
    else if (completedOrders >= 10 && rating >= 4.2) newLevel = 'rising';

    if (newLevel === user.level) return; // idempotent — no change required

    await this.prisma.user.update({
      where: { id: userId },
      data: { level: newLevel as any },
    });

    this.logger.log(
      `Seller level changed — userId: ${userId}, ` +
      `${user.level} → ${newLevel} ` +
      `(completedOrders: ${completedOrders}, rating: ${rating.toFixed(2)})`,
    );
  }
}
