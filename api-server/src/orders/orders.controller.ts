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
  /**
   * S3-2: Promotional discount code.
   * Applied atomically inside the order $transaction — race-safe for single-use codes.
   * 'percent' type: reduces price by value%. 'fixed' type: subtracts value (floor at 0).
   */
  promoCode?: string;
  requirements?: string;
}

/**
 * S2-2: Extended status update DTO.
 * revisionNote is only consumed when status === 'revision_requested'.
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
      'Supports optional package (S2-3), extras (S2-4), and promo code (S3-2). ' +
      'Response includes grossPrice and discountAmount when a promo code is applied.',
  })
  async create(@CurrentUser('sub') userId: number, @Body() dto: CreateOrderDto) {
    return this.ordersService.create(userId, dto);
  }

  @Post('from-gig/:gigId')
  @ApiOperation({
    summary: 'Create an order directly from a gig (SPEC #3 §3)',
    description:
      'Loads the gig, validates it is active, price > 0, and buyer ≠ seller, ' +
      'then creates a pending order with the gig price snapshotted into ' +
      'Order.totalPrice (price freeze). Delegates to the standard create() pipeline.',
  })
  async createFromGig(
    @CurrentUser('sub') userId: number,
    @Param('gigId', ParseIntPipe) gigId: number,
  ) {
    return this.ordersService.createFromGig(userId, gigId);
  }

  @Get()
  @ApiOperation({ summary: 'List my orders' })
  @ApiQuery({ name: 'role', required: false, enum: ['buyer', 'seller'] })
  async findAll(@CurrentUser('sub') userId: number, @Query('role') role?: 'buyer' | 'seller') {
    return this.ordersService.findAll(userId, role);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get order details (includes package, extras ledger, revision info)' })
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
      'S2-2: Supply revisionNote when transitioning to revision_requested.',
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
   * Creates a Dispute record + transitions order to 'disputed'.
   * Prefer this over PATCH /status { status: disputed } which has no DB record.
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
   * Buyer submits a review for a completed order.
   * Enters moderation; on approval triggers rating recalculation (S1-2) and
   * seller level re-evaluation (S2-1).
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
