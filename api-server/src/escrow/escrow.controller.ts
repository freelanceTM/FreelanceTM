import { Controller, Post, Param, ParseIntPipe, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { EscrowService } from './escrow.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';

@ApiTags('Escrow')
@Controller('escrow')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth('jwt')
export class EscrowController {
  constructor(private escrowService: EscrowService) {}

  /**
   * Buyer only. Verified against order.buyerId inside the service.
   * The DB writes (order update, transaction record, TON event) are
   * executed inside a single Prisma transaction — see escrow.service.ts.
   */
  @Post('order/:orderId/create')
  @ApiOperation({ summary: 'Create escrow for an order (buyer only)' })
  async createEscrow(
    @CurrentUser('sub') userId: number,
    @Param('orderId', ParseIntPipe) orderId: number,
  ) {
    return this.escrowService.createEscrow(orderId, undefined, userId);
  }

  @Post('order/:orderId/release')
  @ApiOperation({ summary: 'Release funds to seller (buyer confirms)' })
  async releaseEscrow(
    @CurrentUser('sub') userId: number,
    @Param('orderId', ParseIntPipe) orderId: number,
  ) {
    return this.escrowService.releaseEscrow(orderId, userId);
  }

  @Post('order/:orderId/refund')
  @UseGuards(RolesGuard)
  @Roles('admin')
  @ApiOperation({ summary: 'Refund escrow to buyer (admin only)' })
  async refundEscrow(
    @CurrentUser('sub') adminId: number,
    @Param('orderId', ParseIntPipe) orderId: number,
  ) {
    return this.escrowService.refundEscrow(orderId, adminId);
  }

  /**
   * Seller only. Verified against order.sellerId inside the service.
   * Order must be in 'active' status.
   */
  @Post('order/:orderId/deliver')
  @ApiOperation({ summary: 'Mark order as delivered (seller only)' })
  async markDelivered(
    @CurrentUser('sub') userId: number,
    @Param('orderId', ParseIntPipe) orderId: number,
  ) {
    return this.escrowService.markDelivered(orderId, userId);
  }

  @Post('order/:orderId/dispute')
  @ApiOperation({ summary: 'Open dispute for an order' })
  async openDispute(
    @CurrentUser('sub') userId: number,
    @Param('orderId', ParseIntPipe) orderId: number,
  ) {
    return this.escrowService.openDispute(orderId, userId);
  }
}
