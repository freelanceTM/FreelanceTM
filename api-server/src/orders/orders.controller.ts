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
  requirements?: string;
}

class UpdateStatusDto {
  status: 'pending' | 'active' | 'delivered' | 'completed' | 'cancelled' | 'disputed';
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
  @ApiOperation({ summary: 'Create an order from a gig' })
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
  @ApiOperation({ summary: 'Get order details' })
  async findOne(@CurrentUser('sub') userId: number, @Param('id', ParseIntPipe) id: number) {
    return this.ordersService.findOne(userId, id);
  }

  @Patch(':id/status')
  @ApiOperation({ summary: 'Update order status (accept / deliver / complete / cancel)' })
  async updateStatus(
    @CurrentUser('sub') userId: number,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateStatusDto,
  ) {
    return this.ordersService.updateStatus(userId, id, dto.status as any);
  }

  /**
   * S1-4: Structured dispute filing.
   *
   * Creates a Dispute record in the database (admin can track and resolve it)
   * and transitions the order to 'disputed' state with escrow locked.
   * Either the buyer or seller can file a dispute on an active or delivered order.
   *
   * POST /orders/:id/dispute
   * Body: { reason: string }
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
   * Once admin approves it, seller rating and gig rating are recalculated.
   *
   * POST /orders/:id/review
   * Body: { rating: 1-5, comment?: string }
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
