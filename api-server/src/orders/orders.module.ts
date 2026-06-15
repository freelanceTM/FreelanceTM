import { Module } from '@nestjs/common';
import { OrdersService } from './orders.service';
import { OrdersController } from './orders.controller';
import { EscrowModule } from '../escrow/escrow.module';
import { ReviewsModule } from '../reviews/reviews.module';
import { PromocodesModule } from '../promocodes/promocodes.module';
import { OrderGuardModule } from '../common/order-guard/order-guard.module';

@Module({
  imports: [EscrowModule, ReviewsModule, PromocodesModule, OrderGuardModule],
  providers: [OrdersService],
  controllers: [OrdersController],
  exports: [OrdersService],
})
export class OrdersModule {}
