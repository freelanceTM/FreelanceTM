import { Module } from '@nestjs/common';
import { OrdersService } from './orders.service';
import { OrdersController } from './orders.controller';
import { EscrowModule } from '../escrow/escrow.module';
import { ReviewsModule } from '../reviews/reviews.module';
import { PromocodesModule } from '../promocodes/promocodes.module';

@Module({
  imports: [EscrowModule, ReviewsModule, PromocodesModule],
  providers: [OrdersService],
  controllers: [OrdersController],
  exports: [OrdersService],
})
export class OrdersModule {}
