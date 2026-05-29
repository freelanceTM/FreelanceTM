import { Controller, Post, Body, Headers, UnauthorizedException, Logger } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { TelegramService } from './telegram.service';
import { ConfigService } from '@nestjs/config';
import { timingSafeEqual } from 'crypto';

@ApiTags('Telegram')
@Controller('telegram')
export class TelegramController {
  private readonly logger = new Logger(TelegramController.name);

  constructor(
    private telegramService: TelegramService,
    private config: ConfigService,
  ) {}

  /**
   * Telegram Bot webhook endpoint.
   *
   * M-3 fix — incoming payload authentication:
   *
   *  Telegram forwards the `secret_token` you passed to `setWebhook` as the
   *  `X-Telegram-Bot-Api-Secret-Token` request header on every update it
   *  delivers. Without this check, any party that discovers the endpoint URL
   *  can forge arbitrary bot updates (fake payments, fake messages, etc.).
   *
   *  Verification steps:
   *    1. Read the header (Telegram always sends it when configured; absence = reject).
   *    2. Compare against TELEGRAM_WEBHOOK_SECRET using timingSafeEqual so the
   *       comparison time is constant regardless of how many bytes match —
   *       preventing a timing oracle that could brute-force the secret byte-by-byte.
   *    3. Buffers must be the same length before timingSafeEqual; a length
   *       mismatch is itself a mismatch, so we reject early if lengths differ.
   *
   *  Deployment note: set the same value you pass to `setWebhook` as the
   *  TELEGRAM_WEBHOOK_SECRET environment variable (max 256 chars, A-Z a-z 0-9 _ -).
   */
  @Post('webhook')
  @ApiOperation({ summary: 'Telegram Bot webhook endpoint (production)' })
  async webhook(
    @Headers('x-telegram-bot-api-secret-token') incomingToken: string | undefined,
    @Body() update: any,
  ) {
    const expectedToken = this.config.get<string>('app.telegramWebhookSecret');

    if (!expectedToken) {
      this.logger.error(
        'TELEGRAM_WEBHOOK_SECRET is not configured. ' +
        'All incoming Telegram webhook requests are being rejected to prevent unauthenticated access.',
      );
      throw new UnauthorizedException('Webhook endpoint is not configured for authenticated access.');
    }

    if (!incomingToken) {
      this.logger.warn('[M-3] Telegram webhook: missing X-Telegram-Bot-Api-Secret-Token header — rejected.');
      throw new UnauthorizedException('Missing webhook secret token.');
    }

    const expected = Buffer.from(expectedToken, 'utf8');
    const incoming = Buffer.from(incomingToken, 'utf8');

    // timingSafeEqual requires equal-length buffers; length mismatch is a guaranteed rejection
    if (expected.length !== incoming.length || !timingSafeEqual(expected, incoming)) {
      this.logger.warn('[M-3] Telegram webhook: invalid secret token — rejected.');
      throw new UnauthorizedException('Invalid webhook secret token.');
    }

    await this.telegramService.handleUpdate(update);
    return { ok: true };
  }
}
