import { Module } from '@nestjs/common';
import { EscrowService } from './escrow.service';
import { EscrowController } from './escrow.controller';
import { TonModule } from '../ton/ton.module';
import { OrderGuardModule } from '../common/order-guard/order-guard.module';

@Module({
  imports: [TonModule, OrderGuardModule],
  providers: [EscrowService],
  controllers: [EscrowController],
  exports: [EscrowService],
})
export class EscrowModule {}
