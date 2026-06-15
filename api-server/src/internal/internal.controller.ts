import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { FinanceObservabilityService } from './finance-observability.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';

/**
 * F-11 — Internal financial observability endpoints (admin only, read-only).
 * Not exposed to the FE. For ops/debug + external monitoring polling.
 */
@ApiTags('Internal/Finance')
@Controller('internal/finance')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin')
@ApiBearerAuth('jwt')
export class InternalController {
  constructor(private readonly obs: FinanceObservabilityService) {}

  @Get('summary')
  @ApiOperation({ summary: 'Settlement counts by type × time window (read-only)' })
  summary() {
    return this.obs.settlementSummary();
  }

  @Get('stuck-events')
  @ApiOperation({ summary: 'TonEvents stuck at/over retry ceiling (read-only)' })
  stuckEvents(@Query('threshold') threshold?: string) {
    return this.obs.stuckTonEvents(threshold ? parseInt(threshold, 10) : undefined);
  }

  @Get('orphans')
  @ApiOperation({ summary: 'Mismatches between DB status, settlement, and TonEvent (read-only)' })
  orphans() {
    return this.obs.orphanedFinancialStates();
  }

  @Get('latency')
  @ApiOperation({ summary: 'Settlement & TonEvent pipeline latency percentiles (read-only)' })
  latency() {
    return this.obs.pipelineLatencyMetrics();
  }

  @Get('alerts')
  @ApiOperation({ summary: 'Alert conditions (no auto-fix) for external monitors' })
  alerts(@Query('stuckHours') stuckHours?: string) {
    return this.obs.alerts(stuckHours ? { stuckHours: parseInt(stuckHours, 10) } : undefined);
  }
}
