import {
  Controller,
  Post,
  Get,
  Body,
  Param,
  ParseIntPipe,
  UseGuards,
  ForbiddenException,
  Headers,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiHeader } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import { SubscriptionsService } from './subscriptions.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { SubscriptionTier } from '@prisma/client';

class ActivateSubscriptionDto {
  userId: number;
  /** Target tier. 'free' can be used to manually downgrade. */
  tier: 'free' | 'pro' | 'business';
  /** Number of days to activate from today (or extend from current expiry). 1–3650. */
  durationDays: number;
}

@ApiTags('Subscriptions')
@Controller('subscriptions')
export class SubscriptionsController {
  constructor(
    private subscriptionsService: SubscriptionsService,
    private configService: ConfigService,
  ) {}

  /**
   * Get the current user's subscription status and limits.
   * Public to the authenticated user (no admin required).
   */
  @Get('me')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('jwt')
  @ApiOperation({ summary: 'Get my subscription status and gig limits' })
  async getMyStatus(@CurrentUser('sub') userId: number) {
    return this.subscriptionsService.getStatus(userId);
  }

  /**
   * Activate or extend a subscription.
   * Admin-only: requires X-Admin-Secret header matching ADMIN_SECRET env var.
   *
   * Intended to be called by:
   *  - Admin dashboard after manual payment verification
   *  - Payment webhook handler (PaymentsModule) after automated payment
   */
  @Post('activate')
  @ApiOperation({
    summary: 'Activate or extend a user subscription (admin only)',
    description:
      'Requires X-Admin-Secret header. Sets subscriptionTier and extends ' +
      'subscriptionExpiresAt by durationDays. If the current subscription is ' +
      'still active, the days are stacked onto the existing expiry date.',
  })
  @ApiHeader({ name: 'X-Admin-Secret', description: 'Admin secret from ADMIN_SECRET env var', required: true })
  async activate(
    @Headers('x-admin-secret') adminSecret: string,
    @Body() dto: ActivateSubscriptionDto,
  ) {
    const expected = this.configService.get<string>('app.adminSecret');
    if (!expected || adminSecret !== expected) {
      throw new ForbiddenException('Invalid admin secret');
    }

    return this.subscriptionsService.activateSubscription(
      dto.userId,
      dto.tier as SubscriptionTier,
      dto.durationDays,
    );
  }

  /**
   * Get any user's subscription status (admin only).
   */
  @Get(':userId')
  @ApiOperation({ summary: 'Get subscription status for any user (admin only)' })
  @ApiHeader({ name: 'X-Admin-Secret', required: true })
  async getStatus(
    @Headers('x-admin-secret') adminSecret: string,
    @Param('userId', ParseIntPipe) userId: number,
  ) {
    const expected = this.configService.get<string>('app.adminSecret');
    if (!expected || adminSecret !== expected) {
      throw new ForbiddenException('Invalid admin secret');
    }
    return this.subscriptionsService.getStatus(userId);
  }
}
