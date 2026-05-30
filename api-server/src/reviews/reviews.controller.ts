import {
  Controller,
  Post,
  Get,
  Param,
  Body,
  ParseIntPipe,
  UseGuards,
  Query,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { ReviewsService } from './reviews.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { PrismaService } from '../prisma/prisma.service';

@ApiTags('Reviews')
@Controller('reviews')
export class ReviewsController {
  constructor(
    private readonly reviewsService: ReviewsService,
    private readonly prisma: PrismaService,
  ) {}

  /**
   * POST /reviews
   *
   * Submit a review for a completed order.
   *
   * Rules enforced in ReviewsService.create():
   *   - Caller must be the buyer of the order
   *   - Order must be in 'completed' status
   *   - One review per order (unique constraint)
   *   - Review enters 'pending' moderation queue
   *
   * Rating recalculation is triggered AFTER admin approves the review
   * (AdminService.moderateReview → EventEmitter → ReviewsService.onReviewApproved).
   */
  @Post()
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Submit a review for a completed order',
    description:
      'Only the buyer of a completed order can submit a review.\n' +
      'Review enters pending moderation queue — admin must approve before it affects ratings.',
  })
  async create(
    @CurrentUser('sub') userId: number,
    @Body() dto: { orderId: number; rating: number; comment?: string },
  ) {
    return this.reviewsService.create(userId, dto.orderId, {
      rating: dto.rating,
      comment: dto.comment,
    });
  }

  /**
   * GET /reviews/gig/:gigId
   *
   * Returns all approved reviews for a gig, ordered by newest first.
   * Public — no auth required (used on gig detail pages).
   */
  @Get('gig/:gigId')
  @ApiOperation({
    summary: 'List approved reviews for a gig (public)',
    description: 'Paginated. Only approved reviews are returned. Ordered by newest first.',
  })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'limit', required: false })
  async listByGig(
    @Param('gigId', ParseIntPipe) gigId: number,
    @Query('page') page = '1',
    @Query('limit') limit = '20',
  ) {
    const p = Math.max(1, parseInt(page, 10) || 1);
    const l = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));

    const [reviews, total] = await Promise.all([
      this.prisma.review.findMany({
        where: { gigId, status: 'approved' },
        orderBy: { createdAt: 'desc' },
        skip: (p - 1) * l,
        take: l,
        include: {
          author: {
            select: {
              id: true,
              username: true,
              displayName: true,
              avatarUrl: true,
            },
          },
        },
      }),
      this.prisma.review.count({ where: { gigId, status: 'approved' } }),
    ]);

    return { data: reviews, meta: { total, page: p, limit: l } };
  }

  /**
   * GET /reviews/seller/:sellerId
   *
   * Returns all approved reviews for a seller (across all their gigs).
   * Public — no auth required (used on seller profile pages).
   */
  @Get('seller/:sellerId')
  @ApiOperation({
    summary: 'List approved reviews for a seller (public)',
    description: 'All approved reviews targeting this seller. Newest first.',
  })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'limit', required: false })
  async listBySeller(
    @Param('sellerId', ParseIntPipe) sellerId: number,
    @Query('page') page = '1',
    @Query('limit') limit = '20',
  ) {
    const p = Math.max(1, parseInt(page, 10) || 1);
    const l = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));

    const [reviews, total] = await Promise.all([
      this.prisma.review.findMany({
        where: { targetId: sellerId, status: 'approved' },
        orderBy: { createdAt: 'desc' },
        skip: (p - 1) * l,
        take: l,
        include: {
          author: {
            select: {
              id: true,
              username: true,
              displayName: true,
              avatarUrl: true,
            },
          },
          gig: {
            select: { id: true, title: true },
          },
        },
      }),
      this.prisma.review.count({ where: { targetId: sellerId, status: 'approved' } }),
    ]);

    return { data: reviews, meta: { total, page: p, limit: l } };
  }

  /**
   * GET /reviews/my
   *
   * Returns reviews submitted BY the authenticated user (buyer's review history).
   */
  @Get('my')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: "Get the authenticated user's submitted reviews",
  })
  async myReviews(@CurrentUser('sub') userId: number) {
    return this.prisma.review.findMany({
      where: { authorId: userId },
      orderBy: { createdAt: 'desc' },
      include: {
        gig: { select: { id: true, title: true } },
        target: { select: { id: true, username: true, displayName: true } },
      },
    });
  }
}
