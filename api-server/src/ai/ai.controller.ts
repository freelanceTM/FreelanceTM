import { Controller, Post, Body, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { AiService } from './ai.service';

class ChatMessageDto {
  role: 'user' | 'assistant';
  content: string;
}

class ChatDto {
  messages: ChatMessageDto[];
  mode?: 'general' | 'tz';
}

@ApiTags('AI')
@Controller('ai')
export class AiController {
  constructor(private aiService: AiService) {}

  @Post('chat')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Chat with FreelanceTM AI assistant' })
  async chat(@Body() dto: ChatDto) {
    return this.aiService.chat(dto.messages, dto.mode || 'general');
  }
}
