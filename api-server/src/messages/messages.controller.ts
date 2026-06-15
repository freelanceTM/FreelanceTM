import {
  Controller,
  Get,
  Param,
  ParseIntPipe,
  UseGuards,
  Post,
  Body,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { MessagesService } from './messages.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { SendMessageDto } from './dto/send-message.dto';

@ApiTags('Messages')
@Controller('messages')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth('jwt')
export class MessagesController {
  constructor(private messagesService: MessagesService) {}

  @Get()
  @ApiOperation({ summary: 'List my order chats (SPEC #4 §4.2)' })
  async listMyChats(@CurrentUser('sub') userId: number) {
    return this.messagesService.listMyChats(userId);
  }

  @Get('order/:orderId')
  @ApiOperation({ summary: 'Get messages for an order (buyer/seller/admin)' })
  async getMessages(
    @CurrentUser('sub') userId: number,
    @CurrentUser('role') role: string,
    @Param('orderId', ParseIntPipe) orderId: number,
  ) {
    return this.messagesService.getMessages(orderId, userId, role);
  }

  @Post('order/:orderId')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Send a message to an order chat over HTTP (SPEC #4 §4.4)' })
  async sendMessage(
    @CurrentUser('sub') userId: number,
    @Param('orderId', ParseIntPipe) orderId: number,
    @Body() dto: SendMessageDto,
  ) {
    return this.messagesService.createMessage(orderId, userId, dto.content, dto.attachments);
  }

  @Post('order/:orderId/read')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Mark messages as read' })
  async markRead(@CurrentUser('sub') userId: number, @Param('orderId', ParseIntPipe) orderId: number) {
    await this.messagesService.markAsRead(orderId, userId);
  }
}
