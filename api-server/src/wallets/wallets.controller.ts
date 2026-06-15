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

  @Get('transactions')
  @ApiOperation({ summary: 'Get my ledger transactions (single source of truth)' })
  async getMyTransactions(@CurrentUser('sub') userId: number) {
    const txs = await this.walletsService.listTransactions(userId);
    return txs.map((t) => ({
      id: t.id,
      type: t.type,
      status: t.status,
      amountNano: t.amountNano.toString(),
      currency: t.currency,
      metadata: t.metadata,
      txHash: t.txHash,
      createdAt: t.createdAt,
    }));
  }

  /**
   * Admin-only: apply an audited balance ADJUSTMENT (signed delta).
   *
   * F-2 fix: this no longer overwrites the balance to an absolute value
   * (which bypassed the ledger and lost concurrent escrow/withdrawal writes).
   * It now applies a signed delta atomically, writes a Transaction audit row,
   * and refuses to overdraft. Body: { amountNano: string (signed), reason?: string }.
   */
  @Post(':userId/update-balance')
  @UseGuards(RolesGuard)
  @Roles('admin')
  @ApiOperation({ summary: 'Admin: audited balance adjustment by signed delta (admin only)' })
  async updateBalance(
    @CurrentUser('sub') adminId: number,
    @Param('userId', ParseIntPipe) userId: number,
    @Body('amountNano') amountNano: string,
    @Body('reason') reason?: string,
  ) {
    const delta = BigInt(amountNano);
    this.logger.warn(
      `[AUDIT] Admin ${adminId} adjusting balance for user ${userId} by ${delta} nano (reason: ${reason ?? 'n/a'})`,
    );

    const wallet = await this.walletsService.adjustBalance(userId, delta, adminId, reason);

    this.logger.log(
      `[AUDIT] Balance adjusted — user ${userId} new balance: ${wallet?.balanceNano.toString()} nano (by admin ${adminId})`,
    );

    return {
      address: wallet?.address,
      balanceNano: wallet?.balanceNano.toString(),
    };
  }
}
