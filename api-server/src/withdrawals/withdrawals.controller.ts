import { Controller, Post, Get, Body, Param, ParseIntPipe, UseGuards, Patch } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { WithdrawalsService } from './withdrawals.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';

@ApiTags('Withdrawals')
@Controller('withdrawals')
export class WithdrawalsController {
  constructor(private withdrawalsService: WithdrawalsService) {}

  @Post()
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('jwt')
  @ApiOperation({ summary: 'Request withdrawal (TON wallet / bank card)' })
  async request(
    @CurrentUser('sub') userId: number,
    @Body() dto: { amountNano: string; destination: string; destinationType?: string },
  ) {
    return this.withdrawalsService.requestWithdrawal(userId, BigInt(dto.amountNano), dto.destination, dto.destinationType);
  }

  @Get('my')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('jwt')
  @ApiOperation({ summary: 'My withdrawal history' })
  async my(@CurrentUser('sub') userId: number) {
    return this.withdrawalsService.listMy(userId);
  }

  @Get('pending')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  @ApiBearerAuth('jwt')
  @ApiOperation({ summary: 'List pending withdrawals (admin)' })
  async pending() {
    return this.withdrawalsService.listPending();
  }

  @Patch(':id/approve')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  @ApiBearerAuth('jwt')
  @ApiOperation({ summary: 'Approve withdrawal (admin)' })
  async approve(@CurrentUser('sub') adminId: number, @Param('id', ParseIntPipe) id: number, @Body('txHash') txHash?: string) {
    return this.withdrawalsService.approve(adminId, id, txHash);
  }

  @Patch(':id/reject')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  @ApiBearerAuth('jwt')
  @ApiOperation({ summary: 'Reject withdrawal (admin)' })
  async reject(@CurrentUser('sub') adminId: number, @Param('id', ParseIntPipe) id: number, @Body('note') note?: string) {
    return this.withdrawalsService.reject(adminId, id, note);
  }
}
