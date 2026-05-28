import { Controller, Get, Patch, Post, Body, Query, UseGuards, ParseIntPipe } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { NotificationsService } from './notifications.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@ApiTags('Notifications')
@Controller('notifications')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth('jwt')
export class NotificationsController {
  constructor(private notificationsService: NotificationsService) {}

  @Get()
  @ApiOperation({ summary: 'Get my notifications' })
  @ApiQuery({ name: 'unreadOnly', required: false, type: Boolean })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  async getMyNotifications(
    @CurrentUser('sub') userId: number,
    @Query('unreadOnly') unreadOnly?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.notificationsService.getMyNotifications(
      userId,
      unreadOnly === 'true',
      page ? parseInt(page, 10) : 1,
      limit ? parseInt(limit, 10) : 20,
    );
  }

  @Get('unread-count')
  @ApiOperation({ summary: 'Count unread notifications' })
  async getUnreadCount(@CurrentUser('sub') userId: number) {
    return this.notificationsService.getUnreadCount(userId);
  }

  @Patch(':id/read')
  @ApiOperation({ summary: 'Mark notification as read' })
  async markOneAsRead(
    @CurrentUser('sub') userId: number,
    @Query('id', ParseIntPipe) notificationId: number,
  ) {
    return this.notificationsService.markAsRead(userId, notificationId);
  }

  @Patch('read-all')
  @ApiOperation({ summary: 'Mark all as read' })
  async markAllAsRead(@CurrentUser('sub') userId: number) {
    return this.notificationsService.markAsRead(userId);
  }

  @Post('settings')
  @ApiOperation({ summary: 'Toggle push notifications' })
  async toggle(
    @CurrentUser('sub') userId: number,
    @Body('enabled') enabled: boolean,
  ) {
    return this.notificationsService.toggleNotifications(userId, enabled);
  }
}
