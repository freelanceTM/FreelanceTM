import { Module } from '@nestjs/common';
import { FinanceObservabilityService } from './finance-observability.service';
import { InternalController } from './internal.controller';

/**
 * F-11 — internal observability module. PrismaService is provided by the
 * @Global PrismaModule, so no extra imports are required.
 */
@Module({
  providers: [FinanceObservabilityService],
  controllers: [InternalController],
  exports: [FinanceObservabilityService],
})
export class InternalModule {}
