import { Module } from '@nestjs/common';
import { AdminService } from './admin.service';
import { AdminController } from './admin.controller';
import { EscrowModule } from '../escrow/escrow.module';
import { WithdrawalsModule } from '../withdrawals/withdrawals.module';

@Module({
  imports: [EscrowModule, WithdrawalsModule],
  providers: [AdminService],
  controllers: [AdminController],
  exports: [AdminService],
})
export class AdminModule {}
