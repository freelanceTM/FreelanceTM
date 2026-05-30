import { Module } from '@nestjs/common';
import { WebhooksService } from './webhooks.service';
import { WebhooksController } from './webhooks.controller';
import { WebhookEventsListener } from './webhook-events.listener';

@Module({
  providers: [WebhooksService, WebhookEventsListener],
  controllers: [WebhooksController],
  exports: [WebhooksService],
})
export class WebhooksModule {}
