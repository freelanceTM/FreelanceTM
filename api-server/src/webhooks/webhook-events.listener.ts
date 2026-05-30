import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { WebhooksService } from './webhooks.service';
import {
  EVENTS,
  OrderCreatedEvent,
  OrderStatusChangedEvent,
  MessageReceivedEvent,
  EscrowReleasedEvent,
  EscrowRefundedEvent,
  PaymentApprovedEvent,
  PaymentRejectedEvent,
  DisputeOpenedEvent,
  DisputeResolvedEvent,
  KycStatusChangedEvent,
  ReviewApprovedEvent,
} from '../events/notification.events';

/**
 * Sprint 6 — Webhook Dispatch Integration.
 *
 * Listens to every platform event and forwards the payload to all
 * registered external webhooks that have subscribed to that event
 * (via POST /webhooks with the matching event name in their `events` array).
 *
 * Delivery is best-effort and fire-and-forget — failures are logged to
 * Webhook.lastError but do not affect the in-process event flow.
 *
 * Payload signature:
 *   HMAC-SHA256 over JSON({ event, payload, timestamp })
 *   sent in X-Webhook-Signature header as "sha256=<hex>"
 *   (see WebhooksService.dispatch() for full details)
 */
@Injectable()
export class WebhookEventsListener {
  private readonly logger = new Logger(WebhookEventsListener.name);

  constructor(private readonly webhooksService: WebhooksService) {}

  @OnEvent(EVENTS.ORDER_CREATED, { async: true })
  async onOrderCreated(payload: OrderCreatedEvent) {
    await this.dispatch(EVENTS.ORDER_CREATED, payload);
  }

  @OnEvent(EVENTS.ORDER_STATUS_CHANGED, { async: true })
  async onOrderStatusChanged(payload: OrderStatusChangedEvent) {
    await this.dispatch(EVENTS.ORDER_STATUS_CHANGED, payload);
  }

  @OnEvent(EVENTS.MESSAGE_RECEIVED, { async: true })
  async onMessageReceived(payload: MessageReceivedEvent) {
    await this.dispatch(EVENTS.MESSAGE_RECEIVED, payload);
  }

  @OnEvent(EVENTS.ESCROW_RELEASED, { async: true })
  async onEscrowReleased(payload: EscrowReleasedEvent) {
    await this.dispatch(EVENTS.ESCROW_RELEASED, payload);
  }

  @OnEvent(EVENTS.ESCROW_REFUNDED, { async: true })
  async onEscrowRefunded(payload: EscrowRefundedEvent) {
    await this.dispatch(EVENTS.ESCROW_REFUNDED, payload);
  }

  @OnEvent(EVENTS.PAYMENT_APPROVED, { async: true })
  async onPaymentApproved(payload: PaymentApprovedEvent) {
    await this.dispatch(EVENTS.PAYMENT_APPROVED, payload);
  }

  @OnEvent(EVENTS.PAYMENT_REJECTED, { async: true })
  async onPaymentRejected(payload: PaymentRejectedEvent) {
    await this.dispatch(EVENTS.PAYMENT_REJECTED, payload);
  }

  @OnEvent(EVENTS.DISPUTE_OPENED, { async: true })
  async onDisputeOpened(payload: DisputeOpenedEvent) {
    await this.dispatch(EVENTS.DISPUTE_OPENED, payload);
  }

  @OnEvent(EVENTS.DISPUTE_RESOLVED, { async: true })
  async onDisputeResolved(payload: DisputeResolvedEvent) {
    await this.dispatch(EVENTS.DISPUTE_RESOLVED, payload);
  }

  @OnEvent(EVENTS.KYC_STATUS_CHANGED, { async: true })
  async onKycStatusChanged(payload: KycStatusChangedEvent) {
    await this.dispatch(EVENTS.KYC_STATUS_CHANGED, payload);
  }

  @OnEvent(EVENTS.REVIEW_APPROVED, { async: true })
  async onReviewApproved(payload: ReviewApprovedEvent) {
    await this.dispatch(EVENTS.REVIEW_APPROVED, payload);
  }

  private async dispatch(event: string, payload: unknown) {
    try {
      await this.webhooksService.dispatch(event, payload);
    } catch (err: any) {
      // Never let webhook delivery failures propagate into the event pipeline
      this.logger.error(`Webhook dispatch failed for event "${event}": ${err.message}`, err.stack);
    }
  }
}
