import { Controller, Get, Post, Body, Param, ParseIntPipe, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { ConversationsService } from './conversations.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@ApiTags('Conversations')
@Controller('conversations')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth('jwt')
export class ConversationsController {
  constructor(private conversationsService: ConversationsService) {}

  @Post('with/:userId')
  @ApiOperation({ summary: 'Start or get direct conversation with user' })
  async getOrCreate(@CurrentUser('sub') userId: number, @Param('userId', ParseIntPipe) otherUserId: number) {
    return this.conversationsService.getOrCreateDirect(userId, otherUserId);
  }

  @Get()
  @ApiOperation({ summary: 'My conversations' })
  async list(@CurrentUser('sub') userId: number) {
    return this.conversationsService.listMy(userId);
  }

  @Get(':id/messages')
  @ApiOperation({ summary: 'Messages in conversation' })
  async messages(
    @CurrentUser('sub') userId: number,
    @Param('id', ParseIntPipe) id: number,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.conversationsService.getMessages(id, userId, page ? parseInt(page, 10) : 1, limit ? parseInt(limit, 10) : 50);
  }

  @Post(':id/messages')
  @ApiOperation({ summary: 'Send message to conversation' })
  async send(
    @CurrentUser('sub') userId: number,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: { content: string; attachments?: string[] },
  ) {
    return this.conversationsService.sendMessage(id, userId, dto.content, dto.attachments);
  }
}
