import { Controller, Get, UseGuards, Post, Body, Param, ParseIntPipe, Logger } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { WalletsService } from './wallets.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@ApiTags('Wallets')
@Controller('wallets')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth('jwt')
export class WalletsController {
  private readonly logger = new Logger(WalletsController.name);

  constructor(private walletsService: WalletsService) {}

  @Get('me')
  @ApiOperation({ summary: 'Get my custodial wallet' })
  async getMyWallet(@CurrentUser('sub') userId: number) {
    const wallet = await this.walletsService.getWallet(userId);
    if (!wallet) return null;
    return {
      address: wallet.address,
      publicKey: wallet.publicKey,
      version: wallet.version,
      balanceNano: wallet.balanceNano.toString(),
      isActive: wallet.isActive,
    };
  }

  /**
   * Admin-only: manually sync a user's on-chain balance into the DB.
   * Requires role=admin in the JWT payload.
   * Every invocation is written to the logger for audit trail.
   */
  @Post(':userId/update-balance')
  @UseGuards(RolesGuard)
  @Roles('admin')
  @ApiOperation({ summary: 'Admin/Sync: update user balance (internal, admin only)' })
  async updateBalance(
    @CurrentUser('sub') adminId: number,
    @Param('userId', ParseIntPipe) userId: number,
    @Body('balanceNano') balanceNano: string,
  ) {
    this.logger.warn(
      `[AUDIT] Admin ${adminId} updating balance for user ${userId} → ${balanceNano} nano`,
    );

    const wallet = await this.walletsService.updateBalance(userId, BigInt(balanceNano));

    this.logger.log(
      `[AUDIT] Balance updated — user ${userId} new balance: ${wallet.balanceNano.toString()} nano (by admin ${adminId})`,
    );

    return {
      address: wallet.address,
      balanceNano: wallet.balanceNano.toString(),
    };
  }
}
