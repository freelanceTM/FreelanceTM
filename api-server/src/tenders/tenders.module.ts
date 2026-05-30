import { Module } from '@nestjs/common';
import { TendersService } from './tenders.service';
import { TendersController } from './tenders.controller';
import { OrdersModule } from '../orders/orders.module';

@Module({
  imports: [OrdersModule],
  providers: [TendersService],
  controllers: [TendersController],
  exports: [TendersService],
})
export class TendersModule {}
