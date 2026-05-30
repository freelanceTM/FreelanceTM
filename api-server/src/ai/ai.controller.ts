import {
  Controller,
  Post,
  Body,
  HttpCode,
  HttpStatus,
  UseGuards,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import {
  IsArray,
  IsIn,
  IsOptional,
  IsString,
  ArrayMaxSize,
  ArrayMinSize,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { AiService } from './ai.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';

class ChatMessageDto {
  @IsString()
  @IsIn(['user', 'assistant'])
  role: 'user' | 'assistant';

  @IsString()
  @MaxLength(4000, { message: 'Message content must not exceed 4000 characters' })
  content: string;
}

class ChatDto {
  @IsArray()
  @ArrayMinSize(1, { message: 'messages array must contain at least one message' })
  @ArrayMaxSize(20, { message: 'messages array must not exceed 20 items' })
  @ValidateNested({ each: true })
  @Type(() => ChatMessageDto)
  messages: ChatMessageDto[];

  @IsOptional()
  @IsIn(['general', 'tz'])
  mode?: 'general' | 'tz';
}

@ApiTags('AI')
@Controller('ai')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth('jwt')
// AI-3: Override the global throttler limits with stricter per-user caps.
// Global defaults (short=10/s, medium=100/10s, long=300/60s) are far too
// permissive for LLM requests — each call consumes real Gemini quota.
// These limits allow: 2/s burst, 10 per 10s, 20 per minute.
@Throttle({
  short: { limit: 2, ttl: 1000 },
  medium: { limit: 10, ttl: 10000 },
  long: { limit: 20, ttl: 60000 },
})
export class AiController {
  constructor(private aiService: AiService) {}

  @Post('chat')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Chat with FreelanceTM AI assistant' })
  @UsePipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }))
  async chat(@Body() dto: ChatDto) {
    return this.aiService.chat(dto.messages, dto.mode || 'general');
  }
}
