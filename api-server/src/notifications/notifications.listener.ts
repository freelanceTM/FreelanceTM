import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { PrismaService } from '../prisma/prisma.service';
import {
  EVENTS,
  OrderCreatedEvent,
  OrderStatusChangedEvent,
  EscrowReleasedEvent,
  EscrowRefundedEvent,
  DisputeOpenedEvent,
  DisputeResolvedEvent,
  KycStatusChangedEvent,
  ReviewApprovedEvent,
} from '../events/notification.events';

/**
 * S3-1: Notification Delivery Engine
 *
 * Listens for all platform events and creates Notification rows in the DB.
 * The notification center (GET /notifications) reads these rows.
 *
 * All handlers are fire-and-forget: they log errors but never throw, so a
 * notification failure cannot block the business operation that fired the event.
 *
 * Currently only creates in_app notifications.
 * Telegram / push delivery can be wired here in a future sprint by injecting
 * TelegramService and checking user.telegramChatId.
 */
@Injectable()
export class NotificationsListener {
  private readonly logger = new Logger(NotificationsListener.name);

  constructor(private prisma: PrismaService) {}

  // ─── Helpers ─────────────────────────────────────────────────────────────

  private async notify(
    userId: number,
    type: string,
    title: string,
    body: string,
    data?: Record<string, unknown>,
  ): Promise<void> {
    try {
      await this.prisma.notification.create({
        data: { userId, type, title, body, data: data ?? {}, channel: 'in_app' },
      });
    } catch (err) {
      this.logger.error(`Failed to create notification [${type}] for user ${userId}: ${err}`);
    }
  }

  private async notifyBoth(
    buyerId: number,
    sellerId: number,
    type: string,
    buyerTitle: string,
    buyerBody: string,
    sellerTitle: string,
    sellerBody: string,
    data?: Record<string, unknown>,
  ): Promise<void> {
    await Promise.allSettled([
      this.notify(buyerId, type, buyerTitle, buyerBody, data),
      this.notify(sellerId, type, sellerTitle, sellerBody, data),
    ]);
  }

  // ─── Event Handlers ──────────────────────────────────────────────────────

  /**
   * Seller receives notification when a buyer places a new order.
   */
  @OnEvent(EVENTS.ORDER_CREATED)
  async onOrderCreated(payload: OrderCreatedEvent): Promise<void> {
    await this.notify(
      payload.sellerId,
      'new_order',
      '📦 Новый заказ',
      `Новый заказ на "${payload.gigTitle}" — ${payload.totalPrice} манат`,
      { orderId: payload.orderId, buyerId: payload.buyerId },
    );
  }

  /**
   * Status-specific notifications delivered to the relevant party.
   */
  @OnEvent(EVENTS.ORDER_STATUS_CHANGED)
  async onOrderStatusChanged(payload: OrderStatusChangedEvent): Promise<void> {
    const link = { orderId: payload.orderId };

    switch (payload.newStatus) {
      case 'active':
        await this.notify(
          payload.buyerId,
          'order_accepted',
          '✅ Заказ принят',
          `Фрилансер принял ваш заказ "${payload.gigTitle}"`,
          link,
        );
        break;

      case 'delivered':
        await this.notify(
          payload.buyerId,
          'order_delivered',
          '📬 Работа сдана',
          `Фрилансер сдал работу по заказу "${payload.gigTitle}". Проверьте и примите или запросите доработку.`,
          link,
        );
        break;

      case 'revision_requested':
        await this.notify(
          payload.sellerId,
          'revision_requested',
          '🔄 Запрошена доработка',
          `Заказчик запросил доработку по заказу "${payload.gigTitle}"`,
          link,
        );
        break;

      case 'completed':
        await this.notify(
          payload.sellerId,
          'order_completed',
          '🎉 Заказ завершён',
          `Заказ "${payload.gigTitle}" завершён. Оплата переведена на ваш кошелёк.`,
          link,
        );
        break;

      case 'cancelled':
        await this.notifyBoth(
          payload.buyerId,
          payload.sellerId,
          'order_cancelled',
          '❌ Заказ отменён',
          `Заказ "${payload.gigTitle}" был отменён.`,
          '❌ Заказ отменён',
          `Заказ "${payload.gigTitle}" был отменён покупателем.`,
          link,
        );
        break;

      case 'disputed':
        await this.notifyBoth(
          payload.buyerId,
          payload.sellerId,
          'order_disputed',
          '⚖️ Открыт спор',
          `По заказу "${payload.gigTitle}" открыт спор. Ожидайте решения модератора.`,
          '⚖️ Открыт спор',
          `По заказу "${payload.gigTitle}" открыт спор. Ожидайте решения модератора.`,
          link,
        );
        break;
    }
  }

  /**
   * Seller notified when escrow is released to their wallet.
   */
  @OnEvent(EVENTS.ESCROW_RELEASED)
  async onEscrowReleased(payload: EscrowReleasedEvent): Promise<void> {
    const manat = (Number(payload.amountNano) / 1e9).toFixed(2);
    await this.notify(
      payload.sellerId,
      'payment_received',
      '💰 Оплата получена',
      `${manat} манат поступило на ваш кошелёк`,
      { orderId: payload.orderId },
    );
  }

  /**
   * Buyer notified when a refund is processed to their wallet.
   */
  @OnEvent(EVENTS.ESCROW_REFUNDED)
  async onEscrowRefunded(payload: EscrowRefundedEvent): Promise<void> {
    const manat = (Number(payload.amountNano) / 1e9).toFixed(2);
    await this.notify(
      payload.buyerId,
      'refund_processed',
      '💸 Возврат средств',
      `${manat} манат возвращено на ваш кошелёк`,
      { orderId: payload.orderId },
    );
  }

  /**
   * Both parties notified when a dispute is opened via POST /orders/:id/dispute.
   * (Complements the ORDER_STATUS_CHANGED 'disputed' handler above which covers
   * the legacy updateStatus path — this handler covers the structured filing path.)
   */
  @OnEvent(EVENTS.DISPUTE_OPENED)
  async onDisputeOpened(payload: DisputeOpenedEvent): Promise<void> {
    // Load the order to get both party IDs and the gig title
    const order = await this.prisma.order.findUnique({
      where: { id: payload.orderId },
      include: { gig: { select: { title: true } }, tender: { select: { title: true } } },
    });
    if (!order) return;

    const title = order.gig?.title ?? order.tender?.title ?? `Заказ #${order.id}`;
    const link = { orderId: payload.orderId, disputeId: payload.disputeId };

    const notifyId = payload.initiatorId === order.buyerId ? order.sellerId : order.buyerId;
    await this.notify(
      notifyId,
      'dispute_opened',
      '⚖️ Спор открыт',
      `Другая сторона открыла спор по заказу "${title}". Ожидайте решения модератора.`,
      link,
    );
  }

  /**
   * Both buyer and seller notified when admin resolves a dispute.
   */
  @OnEvent(EVENTS.DISPUTE_RESOLVED)
  async onDisputeResolved(payload: DisputeResolvedEvent): Promise<void> {
    const dispute = await this.prisma.dispute.findUnique({
      where: { id: payload.disputeId },
      include: { order: { include: { gig: { select: { title: true } } } } },
    });
    if (!dispute) return;

    const gigTitle = dispute.order?.gig?.title ?? `Заказ #${payload.orderId}`;
    const resolutionText: Record<string, string> = {
      buyer_wins: 'в пользу покупателя — средства возвращены',
      seller_wins: 'в пользу фрилансера — средства выплачены',
      split: 'разделены между сторонами',
      none: 'завершён без решения',
    };
    const verdict = resolutionText[payload.resolution] ?? payload.resolution;

    await this.notifyBoth(
      dispute.order.buyerId,
      dispute.order.sellerId,
      'dispute_resolved',
      '⚖️ Спор разрешён',
      `Спор по заказу "${gigTitle}" разрешён: ${verdict}.`,
      '⚖️ Спор разрешён',
      `Спор по заказу "${gigTitle}" разрешён: ${verdict}.`,
      { orderId: payload.orderId, disputeId: payload.disputeId, resolution: payload.resolution },
    );
  }

  /**
   * Seller notified when a review they received is approved by admin.
   */
  @OnEvent(EVENTS.REVIEW_APPROVED)
  async onReviewApproved(payload: ReviewApprovedEvent): Promise<void> {
    const review = await this.prisma.review.findUnique({
      where: { id: payload.reviewId },
      select: { targetId: true, rating: true, gig: { select: { title: true } } },
    });
    if (!review) return;

    const stars = '⭐'.repeat(review.rating);
    const gigLabel = review.gig?.title ? ` для "${review.gig.title}"` : '';

    await this.notify(
      review.targetId,
      'review_approved',
      `${stars} Новый отзыв`,
      `Отзыв${gigLabel} одобрен и теперь виден покупателям. Рейтинг обновлён.`,
      { reviewId: payload.reviewId },
    );
  }

  /**
   * User notified of KYC verification outcome.
   */
  @OnEvent(EVENTS.KYC_STATUS_CHANGED)
  async onKycStatusChanged(payload: KycStatusChangedEvent): Promise<void> {
    const isApproved = payload.status === 'approved';
    await this.notify(
      payload.userId,
      isApproved ? 'kyc_approved' : 'kyc_rejected',
      isApproved ? '✅ Верификация пройдена' : '❌ Верификация отклонена',
      isApproved
        ? 'Ваша личность подтверждена. На профиле появился значок верификации.'
        : 'К сожалению, верификация не пройдена. Обратитесь в поддержку для уточнения причин.',
      { userId: payload.userId },
    );
  }
}
