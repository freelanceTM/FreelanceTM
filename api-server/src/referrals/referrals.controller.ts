import {
  Controller,
  Get,
  Post,
  Body,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiBody } from '@nestjs/swagger';
import { ReferralsService } from './referrals.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';

class ApplyCodeDto {
  /** Referral code from the inviter (e.g. REF-AB3XK9QZ) */
  code: string;
}

@ApiTags('Referrals')
@Controller('referrals')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth('jwt')
export class ReferralsController {
  constructor(private readonly referralsService: ReferralsService) {}

  /**
   * GET /referrals/my-code
   *
   * Returns the caller's referral code, creating one if it doesn't exist yet.
   * The code should be shared with friends — when they register and call
   * POST /referrals/apply, they become linked to this referrer.
   *
   * The referrer earns 0.5 TON credited to their custodial wallet the first
   * time the referred user completes a paid order.
   */
  @Get('my-code')
  @ApiOperation({
    summary: 'Get (or generate) my referral code',
    description:
      'Returns your unique referral code. Created on first call — subsequent ' +
      'calls return the same code. Share this with friends: when they call ' +
      'POST /referrals/apply with your code, you earn 0.5 TON on their first completed order.',
  })
  async getMyCode(@CurrentUser('sub') userId: number) {
    const code = await this.referralsService.getOrCreateCode(userId);
    return { code };
  }

  /**
   * POST /referrals/apply
   *
   * Applies a referral code to the caller's account.
   * Can only be done once per account and cannot be reversed.
   *
   * Idempotent if called twice with the same code from the same account.
   * Returns 409 if the user has already applied a different referral code.
   */
  @Post('apply')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Apply a referral code to my account',
    description:
      'Links your account to a referrer. Can only be done once.\n\n' +
      'Idempotent: calling with the same code twice returns the existing referral.\n' +
      'Throws 409 if you have already applied a different code.\n' +
      'Throws 400 if you try to refer yourself.',
  })
  @ApiBody({ type: ApplyCodeDto })
  async apply(@CurrentUser('sub') userId: number, @Body('code') code: string) {
    if (!code || !code.trim()) {
      return { error: 'code is required' };
    }
    return this.referralsService.applyCode(userId, code);
  }

  /**
   * GET /referrals/my-referrals
   *
   * Lists all users the caller has referred, with per-entry status:
   *  - pending   → user registered but has not yet completed an order
   *  - completed → first order completed, bonus being processed
   *  - paid      → referrer wallet credited with 0.5 TON
   */
  @Get('my-referrals')
  @ApiOperation({
    summary: 'List all users I have referred',
    description:
      'Returns an array of referrals initiated by you.\n\n' +
      'Status lifecycle: pending → (referred user completes first order) → paid\n' +
      'Each paid entry earned you 0.5 TON (500_000_000 nanoTON).',
  })
  async listMyReferrals(@CurrentUser('sub') userId: number) {
    return this.referralsService.listMyReferrals(userId);
  }

  /**
   * GET /referrals/stats
   *
   * Summary statistics for the caller's referral program activity:
   *  { code, totalReferrals, pendingCount, paidCount, totalBonusNano, bonusPerReferralNano }
   */
  @Get('stats')
  @ApiOperation({
    summary: 'My referral program stats',
    description:
      'Returns aggregate stats: total referrals made, breakdown by status, ' +
      'and cumulative bonus earned in nanoTON.',
  })
  async getStats(@CurrentUser('sub') userId: number) {
    return this.referralsService.getStats(userId);
  }
}
