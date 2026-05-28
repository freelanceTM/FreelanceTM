import { Controller, Get, Param, ParseIntPipe, UseGuards, Post, Body, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { MessagesService } from './messages.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@ApiTags('Messages')
@Controller('messages')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth('jwt')
export class MessagesController {
  constructor(private messagesService: MessagesService) {}

  @Get('order/:orderId')
  @ApiOperation({ summary: 'Get messages for an order' })
  async getMessages(@CurrentUser('sub') userId: number, @Param('orderId', ParseIntPipe) orderId: number) {
    return this.messagesService.getMessages(orderId, userId);
  }

  @Post('order/:orderId/read')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Mark messages as read' })
  async markRead(@CurrentUser('sub') userId: number, @Param('orderId', ParseIntPipe) orderId: number) {
    await this.messagesService.markAsRead(orderId, userId);
  }
}
