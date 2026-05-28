import { Controller, Get, Post, Param, ParseIntPipe, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { AnalyticsService } from './analytics.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@ApiTags('Analytics')
@Controller('analytics')
export class AnalyticsController {
  constructor(private analyticsService: AnalyticsService) {}

  @Get('seller')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('jwt')
  @ApiOperation({ summary: 'My seller analytics' })
  async my(@CurrentUser('sub') userId: number) {
    return this.analyticsService.getSellerAnalytics(userId);
  }

  @Post('track-view/:gigId')
  @ApiOperation({ summary: 'Track gig view' })
  async trackView(@Param('gigId', ParseIntPipe) gigId: number) {
    await this.analyticsService.trackGigView(gigId);
    return { success: true };
  }
}
