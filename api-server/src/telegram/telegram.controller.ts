import { Controller, Post, Body, Headers } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { TelegramService } from './telegram.service';
import { ConfigService } from '@nestjs/config';

@ApiTags('Telegram')
@Controller('telegram')
export class TelegramController {
  constructor(
    private telegramService: TelegramService,
    private config: ConfigService,
  ) {}

  @Post('webhook')
  @ApiOperation({ summary: 'Telegram Bot webhook endpoint (production)' })
  async webhook(@Body() update: any) {
    await this.telegramService.handleUpdate(update);
    return { ok: true };
  }
}
