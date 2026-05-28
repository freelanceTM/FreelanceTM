import { Module } from '@nestjs/common';
import { PromocodesService } from './promocodes.service';
import { PromocodesController } from './promocodes.controller';

@Module({
  providers: [PromocodesService],
  controllers: [PromocodesController],
  exports: [PromocodesService],
})
export class PromocodesModule {}
