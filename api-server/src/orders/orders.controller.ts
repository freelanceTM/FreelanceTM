import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  Query,
  ParseIntPipe,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { OrdersService } from './orders.service';
import { ReviewsService } from '../reviews/reviews.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';

class CreateOrderDto {
  gigId: number;
  /** S2-3: Select a pricing package (Basic / Standard / Premium). Optional. */
  packageId?: number;
  /** S2-4: IDs of active GigExtras to add to the order. Optional. */
  extraIds?: number[];
  requirements?: string;
}

/**
 * S2-2: Extended status update DTO.
 *
 * revisionNote is only consumed when status === 'revision_requested'.
 * The seller reads this note to understand what the buyer wants changed.
 */
class UpdateStatusDto {
  status: 'pending' | 'active' | 'delivered' | 'revision_requested' | 'completed' | 'cancelled' | 'disputed';
  revisionNote?: string;
}

class FileDisputeDto {
  reason: string;
}

class CreateReviewDto {
  rating: number;
  comment?: string;
}

@ApiTags('Orders')
@Controller('orders')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth('jwt')
export class OrdersController {
  constructor(
    private ordersService: OrdersService,
    private reviewsService: ReviewsService,
  ) {}

  @Post()
  @ApiOperation({
    summary: 'Create an order from a gig',
    description:
      'Supports optional package selection (S2-3) and extras (S2-4). ' +
      'If packageId is supplied, price/deliveryDays/revisions are taken from that package. ' +
      'extraIds adds line-item extras to the order with their individual prices summed in.',
  })
  async create(@CurrentUser('sub') userId: number, @Body() dto: CreateOrderDto) {
    return this.ordersService.create(userId, dto);
  }

  @Get()
  @ApiOperation({ summary: 'List my orders' })
  @ApiQuery({ name: 'role', required: false, enum: ['buyer', 'seller'] })
  async findAll(@CurrentUser('sub') userId: number, @Query('role') role?: 'buyer' | 'seller') {
    return this.ordersService.findAll(userId, role);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get order details (includes package and extras ledger)' })
  async findOne(@CurrentUser('sub') userId: number, @Param('id', ParseIntPipe) id: number) {
    return this.ordersService.findOne(userId, id);
  }

  @Patch(':id/status')
  @ApiOperation({
    summary: 'Update order status',
    description:
      'Allowed transitions:\n' +
      '  pending → active | cancelled (seller)\n' +
      '  active → delivered (seller)\n' +
      '  delivered → completed | revision_requested | disputed (buyer)\n' +
      '  revision_requested → delivered (seller — re-delivers after revisions)\n\n' +
      'S2-2: When transitioning to revision_requested, supply revisionNote so the ' +
      'seller knows what to change. revisionsUsed is incremented automatically and ' +
      'cannot exceed revisionsAllowed (set from the chosen package at order creation).',
  })
  async updateStatus(
    @CurrentUser('sub') userId: number,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateStatusDto,
  ) {
    return this.ordersService.updateStatus(userId, id, dto.status, {
      revisionNote: dto.revisionNote,
    });
  }

  /**
   * S1-4: Structured dispute filing.
   *
   * Creates a Dispute record in the database (admin can track and resolve it)
   * and transitions the order to 'disputed' state with escrow locked.
   * Either the buyer or seller can file a dispute on an active, delivered,
   * or revision_requested order.
   *
   * POST /orders/:id/dispute
   * Body: { "reason": "Seller did not deliver what was agreed" }
   */
  @Post(':id/dispute')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Open a structured dispute for an order (S1-4)' })
  async fileDispute(
    @CurrentUser('sub') userId: number,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: FileDisputeDto,
  ) {
    return this.ordersService.fileDispute(userId, id, dto.reason);
  }

  /**
   * S1-2: Review submission.
   *
   * Allows the buyer to submit a review for a completed order.
   * Review enters 'pending' moderation queue.
   * Once admin approves it, seller rating and gig rating are recalculated,
   * and LevelsService re-evaluates the seller's tier (S2-1).
   *
   * POST /orders/:id/review
   * Body: { "rating": 4, "comment": "Great work, delivered on time" }
   */
  @Post(':id/review')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Submit a review for a completed order (S1-2)' })
  async createReview(
    @CurrentUser('sub') userId: number,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: CreateReviewDto,
  ) {
    return this.reviewsService.create(userId, id, dto);
  }
}
