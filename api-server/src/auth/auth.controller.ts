import { Controller, Post, Body, HttpCode, HttpStatus, UseGuards, Get, Req } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { Throttle, SkipThrottle } from '@nestjs/throttler';
import { Request } from 'express';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { TelegramLoginDto } from './dto/telegram-login.dto';
import { RefreshTokenDto } from './dto/refresh.dto';

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(private authService: AuthService) {}

  /**
   * Tightest limit: HMAC verification + DB write on every call.
   * 3 attempts/s burst cap, 5 attempts/min sustained, 10 attempts/hr absolute.
   */
  @Post('telegram')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Login via Telegram WebApp initData' })
  @Throttle({
    short: { limit: 3, ttl: 1_000 },
    medium: { limit: 5, ttl: 60_000 },
    long: { limit: 10, ttl: 3_600_000 },
  })
  async telegramLogin(@Body() dto: TelegramLoginDto) {
    return this.authService.telegramLogin(dto.initData, dto.role);
  }

  /**
   * Tight limit: full session table scan + DB read.
   * 5 attempts/s burst cap, 10 attempts/min sustained, 30 attempts/hr absolute.
   */
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Refresh access token' })
  @Throttle({
    short: { limit: 5, ttl: 1_000 },
    medium: { limit: 10, ttl: 60_000 },
    long: { limit: 30, ttl: 3_600_000 },
  })
  async refresh(@Body() dto: RefreshTokenDto) {
    const tokens = await this.authService.refreshTokens(dto.refreshToken);
    return { tokens };
  }

  /**
   * Moderate limit: requires a valid refresh token (already a possession check).
   * 5 attempts/s burst cap, 20 attempts/min sustained, 60 attempts/hr absolute.
   */
  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Logout current session' })
  @Throttle({
    short: { limit: 5, ttl: 1_000 },
    medium: { limit: 20, ttl: 60_000 },
    long: { limit: 60, ttl: 3_600_000 },
  })
  async logout(@Body() dto: RefreshTokenDto, @Req() req: Request) {
    await this.authService.logout(dto.refreshToken);
  }

  /**
   * Moderate limit: JWT-guarded — caller must already hold a valid access token.
   * 5 attempts/s burst cap, 10 attempts/min sustained, 30 attempts/hr absolute.
   */
  @Post('logout-all')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiBearerAuth('jwt')
  @ApiOperation({ summary: 'Logout from all devices' })
  @Throttle({
    short: { limit: 5, ttl: 1_000 },
    medium: { limit: 10, ttl: 60_000 },
    long: { limit: 30, ttl: 3_600_000 },
  })
  async logoutAll(@CurrentUser('sub') userId: number) {
    await this.authService.logoutAll(userId);
  }

  /**
   * Read-only profile lookup; gated behind JwtAuthGuard — global throttle limits
   * are sufficient. Exempt from the extra auth-specific tiers.
   */
  @Get('me')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('jwt')
  @ApiOperation({ summary: 'Get current user profile' })
  @SkipThrottle({ medium: true, long: true })
  async me(@CurrentUser('sub') userId: number) {
    return { userId };
  }
}
