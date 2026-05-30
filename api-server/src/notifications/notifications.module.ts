import { Module } from '@nestjs/common';
import { NotificationsService } from './notifications.service';
import { NotificationsController } from './notifications.controller';
import { NotificationsListener } from './notifications.listener';

@Module({
  providers: [NotificationsService, NotificationsListener],
  controllers: [NotificationsController],
  exports: [NotificationsService],
})
export class NotificationsModule {}
