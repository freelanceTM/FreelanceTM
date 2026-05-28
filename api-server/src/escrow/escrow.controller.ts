import { Controller, Post, Param, ParseIntPipe, UseGuards, Body } from '@nestjs/common';
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

  @Post('order/:orderId/create')
  @ApiOperation({ summary: 'Create escrow for an order (platform automation)' })
  async createEscrow(
    @Param('orderId', ParseIntPipe) orderId: number,
  ) {
    return this.escrowService.createEscrow(orderId);
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

  @Post('order/:orderId/deliver')
  @ApiOperation({ summary: 'Mark order as delivered in escrow (platform)' })
  async markDelivered(
    @Param('orderId', ParseIntPipe) orderId: number,
  ) {
    return this.escrowService.markDelivered(orderId);
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
