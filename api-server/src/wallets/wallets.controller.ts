import { Controller, Get, UseGuards, Post, Body, Param, ParseIntPipe } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { WalletsService } from './wallets.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@ApiTags('Wallets')
@Controller('wallets')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth('jwt')
export class WalletsController {
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

  @Post(':userId/update-balance')
  @ApiOperation({ summary: 'Admin/Sync: update user balance (internal)' })
  async updateBalance(
    @Param('userId', ParseIntPipe) userId: number,
    @Body('balanceNano') balanceNano: string,
  ) {
    const wallet = await this.walletsService.updateBalance(userId, BigInt(balanceNano));
    return {
      address: wallet.address,
      balanceNano: wallet.balanceNano.toString(),
    };
  }
}
