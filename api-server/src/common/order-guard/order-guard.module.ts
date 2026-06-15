import { Module } from '@nestjs/common';
import { OrderGuardService } from './order-guard.service';

/**
 * SPEC #2 — exposes OrderGuardService to feature modules (orders, escrow).
 * PrismaService is provided by the @Global PrismaModule, so no extra imports
 * are required here.
 */
@Module({
  providers: [OrderGuardService],
  exports: [OrderGuardService],
})
export class OrderGuardModule {}
