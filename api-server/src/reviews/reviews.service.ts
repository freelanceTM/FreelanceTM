import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
  Logger,
} from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { PrismaService } from '../prisma/prisma.service';
import { ReviewApprovedEvent } from '../events/notification.events';

@Injectable()
export class ReviewsService {
  private readonly logger = new Logger(ReviewsService.name);

  constructor(private prisma: PrismaService) {}

  /**
   * S1-2: Submit a review for a completed order.
   *
   * Rules:
   *   - Only the buyer of the order can submit a review.
   *   - Order must be in 'completed' status (escrow released).
   *   - Only one review is allowed per order (Prisma @unique on orderId).
   *   - Review enters 'pending' moderation queue — admin must approve it
   *     before it is counted in ratings (see recalculateRatings).
   *
   * @param authorId - the authenticated buyer (CurrentUser.sub)
   * @param orderId  - the completed order being reviewed
   * @param data     - { rating: 1-5, comment?: string }
   */
  async create(authorId: number, orderId: number, data: { rating: number; comment?: string }) {
    if (!Number.isInteger(data.rating) || data.rating < 1 || data.rating > 5) {
      throw new BadRequestException('Rating must be an integer between 1 and 5');
    }

    const order = await this.prisma.order.findUnique({ where: { id: orderId } });
    if (!order) throw new NotFoundException('Order not found');

    if (order.buyerId !== authorId) {
      throw new BadRequestException('Only the buyer of this order can submit a review');
    }

    if (order.status !== 'completed') {
      throw new BadRequestException(
        `Reviews can only be submitted for completed orders (current status: '${order.status}')`,
      );
    }

    const existing = await this.prisma.review.findUnique({ where: { orderId } });
    if (existing) {
      throw new ConflictException('A review has already been submitted for this order');
    }

    const review = await this.prisma.review.create({
      data: {
        orderId,
        gigId: order.gigId ?? null,
        authorId,
        targetId: order.sellerId,
        rating: data.rating,
        comment: data.comment?.trim() || null,
        status: 'pending',
      },
    });

    this.logger.log(
      `Review submitted — orderId: ${orderId}, author: ${authorId}, ` +
      `target: ${order.sellerId}, rating: ${data.rating} (pending moderation)`,
    );

    return review;
  }

  /**
   * S1-2: Event listener — fires after admin approves a review.
   *
   * Triggered by AdminService.moderateReview() via EventEmitter2.
   * Delegates to recalculateRatings() to recompute seller and gig averages.
   */
  @OnEvent('review.approved')
  async onReviewApproved(payload: ReviewApprovedEvent) {
    await this.recalculateRatings(payload.reviewId);
  }

  /**
   * Recompute user.rating and gig.rating from the full set of approved reviews.
   *
   * Uses a PostgreSQL-side AVG aggregate rather than incrementally adjusting
   * the stored value — this prevents floating-point drift over time and ensures
   * the ratings are always consistent with the review table.
   *
   * Both updates are issued in a single Prisma $transaction so a crash between
   * the user update and the gig update cannot leave ratings out of sync.
   */
  async recalculateRatings(reviewId: number) {
    const review = await this.prisma.review.findUnique({ where: { id: reviewId } });
    if (!review) {
      this.logger.warn(`recalculateRatings: review ${reviewId} not found`);
      return;
    }
    if (review.status !== 'approved') {
      this.logger.warn(`recalculateRatings: review ${reviewId} is not approved (status: ${review.status})`);
      return;
    }

    // Compute seller average over all approved reviews (DB-side AVG, no floats in app)
    const userAgg = await this.prisma.review.aggregate({
      where: { targetId: review.targetId, status: 'approved' },
      _avg: { rating: true },
      _count: { id: true },
    });

    await this.prisma.$transaction(async (tx) => {
      // Update seller's rating
      await tx.user.update({
        where: { id: review.targetId },
        data: { rating: userAgg._avg.rating ?? 0 },
      });

      // Update gig rating and review count (only for gig-originated orders)
      if (review.gigId) {
        const gigAgg = await tx.review.aggregate({
          where: { gigId: review.gigId, status: 'approved' },
          _avg: { rating: true },
          _count: { id: true },
        });

        await tx.gig.update({
          where: { id: review.gigId },
          data: {
            rating: gigAgg._avg.rating ?? 0,
            reviewCount: gigAgg._count.id,
          },
        });
      }
    });

    this.logger.log(
      `Ratings recalculated — targetUser: ${review.targetId}, ` +
      `newRating: ${userAgg._avg.rating?.toFixed(2) ?? '0'} ` +
      `(${userAgg._count.id} approved reviews)` +
      (review.gigId ? `, gigId: ${review.gigId}` : ' [no gig]'),
    );
  }
}
