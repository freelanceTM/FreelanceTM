import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { EventEmitter2, OnEvent } from '@nestjs/event-emitter';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { Telegraf, Markup } from 'telegraf';
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
  WithdrawalApprovedEvent,
  WithdrawalRejectedEvent,
} from '../events/notification.events';

@Injectable()
export class TelegramService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(TelegramService.name);
  private bot: Telegraf;
  private isPolling = false;
  private adminChatId?: string;

  constructor(
    private config: ConfigService,
    private prisma: PrismaService,
    private eventEmitter: EventEmitter2,
  ) {}

  async onModuleInit() {
    const token = this.config.get<string>('TELEGRAM_BOT_TOKEN');
    if (!token) {
      this.logger.warn('TELEGRAM_BOT_TOKEN not set — bot will not start');
      return;
    }

    this.adminChatId = this.config.get<string>('TELEGRAM_ADMIN_CHAT_ID');
    this.bot = new Telegraf(token);
    this.registerHandlers();

    const nodeEnv = this.config.get<string>('NODE_ENV');
    if (nodeEnv === 'development') {
      await this.bot.launch();
      this.isPolling = true;
      this.logger.log('🤖 Telegram Bot started in POLLING mode (dev)');
    } else {
      // Production: webhook mode — server receives updates via POST /telegram/webhook
      const webhookUrl = this.config.get<string>('TELEGRAM_WEBHOOK_URL');
      if (webhookUrl) {
        await this.bot.telegram.setWebhook(webhookUrl);
        this.logger.log(`🤖 Telegram Bot webhook set: ${webhookUrl}`);
      } else {
        this.logger.warn('TELEGRAM_WEBHOOK_URL not set in production');
      }
    }
  }

  async onModuleDestroy() {
    if (this.isPolling && this.bot) {
      this.bot.stop();
      this.logger.log('Telegram Bot stopped');
    }
  }

  async handleUpdate(update: any) {
    if (!this.bot) return;
    // Telegraf processes webhook updates via its internal mechanism
    // For NestJS webhook controller, we pass update to bot.handleUpdate
    await this.bot.handleUpdate(update);
  }

  private registerHandlers() {
    // /start — link chat to user
    this.bot.start(async (ctx) => {
      const chatId = ctx.chat.id;
      const from = ctx.from;

      // Try to find user by telegramId and save chatId
      if (from?.id) {
        const user = await this.prisma.user.updateMany({
          where: { telegramId: BigInt(from.id) },
          data: { telegramChatId: BigInt(chatId) },
        });

        if (user.count > 0) {
          await ctx.reply(
            `✅ FreelanceTM уведомления подключены!\n` +
            `Теперь вы будете получать уведомления о заказах, сообщениях и платежах.`,
          );
        } else {
          await ctx.reply(
            `👋 Добро пожаловать в FreelanceTM!\n` +
            `Для получения уведомлений авторизуйтесь в Mini App.\n` +
            `Ваш Telegram ID: ${from.id}`,
            Markup.inlineKeyboard([
              Markup.button.webApp('🚀 Открыть FreelanceTM', this.config.get('CLIENT_URL') || 'https://t.me/your_bot/app'),
            ]),
          );
        }
      }
    });

    // /help
    this.bot.help(async (ctx) => {
      await ctx.reply(
        `📱 FreelanceTM Bot — уведомления\n\n` +
        `Команды:\n` +
        `/start — подключить уведомления\n` +
        `/help — помощь\n` +
        `/orders — мои заказы\n` +
        `/wallet — мой кошелёк\n\n` +
        `Открыть приложение: [FreelanceTM]`,
      );
    });

    // /orders — quick summary
    this.bot.command('orders', async (ctx) => {
      const from = ctx.from;
      if (!from?.id) return;
      const user = await this.prisma.user.findUnique({
        where: { telegramId: BigInt(from.id) },
        include: {
          ordersAsBuyer: { take: 3, orderBy: { createdAt: 'desc' } },
          ordersAsSeller: { take: 3, orderBy: { createdAt: 'desc' } },
        },
      });
      if (!user) {
        await ctx.reply('Сначала авторизуйтесь через Mini App /start');
        return;
      }

      let text = `📦 Ваши заказы:\n\n`;
      if (user.ordersAsBuyer.length) {
        text += `🛒 Как заказчик:\n`;
        user.ordersAsBuyer.forEach((o) => {
          text += `• Заказ #${o.id} — ${o.status}\n`;
        });
        text += `\n`;
      }
      if (user.ordersAsSeller.length) {
        text += `💼 Как фрилансер:\n`;
        user.ordersAsSeller.forEach((o) => {
          text += `• Заказ #${o.id} — ${o.status}\n`;
        });
      }
      await ctx.reply(text || 'У вас пока нет заказов.');
    });

    // /wallet — quick balance
    this.bot.command('wallet', async (ctx) => {
      const from = ctx.from;
      if (!from?.id) return;
      const user = await this.prisma.user.findUnique({
        where: { telegramId: BigInt(from.id) },
        include: { wallet: true },
      });
      if (!user || !user.wallet) {
        await ctx.reply('Кошелёк не найден. Авторизуйтесь через Mini App.');
        return;
      }
      const ton = (Number(user.wallet.balanceNano) / 1e9).toFixed(4);
      await ctx.reply(
        `💰 Ваш кошелёк FreelanceTM\n\n` +
        `Адрес: \`${user.wallet.address}\`\n` +
        `Баланс: ${ton} TON\n\n` +
        `Пополнить: переведите TON на адрес выше.`,
        { parse_mode: 'MarkdownV2' },
      );
    });

    // Generic fallback
    this.bot.on('text', async (ctx) => {
      if (ctx.message.text?.startsWith('/')) return; // ignore unknown commands
      await ctx.reply(
        `Используйте кнопки Mini App для полноценной работы с FreelanceTM.\n` +
        `Все основные функции доступны только в приложении.`,
        Markup.inlineKeyboard([
          Markup.button.webApp('🚀 Открыть FreelanceTM', this.config.get('CLIENT_URL') || 'https://t.me/your_bot/app'),
        ]),
      );
    });
  }

  // ─── NOTIFICATIONS ───────────────────────────────────────────────────────

  @OnEvent(EVENTS.ORDER_CREATED)
  async onOrderCreated(payload: OrderCreatedEvent) {
    await this.notify(payload.sellerId, {
      title: '🛒 Новый заказ!',
      body: `Заказ на «${payload.gigTitle}»\nСумма: ${payload.totalPrice} TMT\nОткройте приложение для деталей.`,
      data: { orderId: payload.orderId },
    });
  }

  @OnEvent(EVENTS.ORDER_STATUS_CHANGED)
  async onOrderStatusChanged(payload: OrderStatusChangedEvent) {
    const recipientId = payload.newStatus === 'delivered' ? payload.buyerId : payload.sellerId;
    const statusMap: Record<string, string> = {
      pending: '⏳ ожидает',
      active: '🔨 в работе',
      delivered: '📦 сдан на проверку',
      completed: '✅ завершён',
      cancelled: '❌ отменён',
      disputed: '⚠️ открыт спор',
    };
    await this.notify(recipientId, {
      title: `📦 Статус заказа #${payload.orderId}`,
      body: `Статус изменён: ${statusMap[payload.newStatus] || payload.newStatus}\n«${payload.gigTitle}»`,
      data: { orderId: payload.orderId },
    });
  }

  @OnEvent(EVENTS.MESSAGE_RECEIVED)
  async onMessageReceived(payload: MessageReceivedEvent) {
    await this.notify(payload.recipientId, {
      title: '💬 Новое сообщение',
      body: `${payload.senderName}: ${payload.content.slice(0, 80)}${payload.content.length > 80 ? '…' : ''}`,
      data: { orderId: payload.orderId, messageId: payload.messageId },
    });
  }

  @OnEvent(EVENTS.ESCROW_RELEASED)
  async onEscrowReleased(payload: EscrowReleasedEvent) {
    const ton = (Number(payload.amountNano) / 1e9).toFixed(4);
    await this.notify(payload.sellerId, {
      title: '💰 Выплата получена',
      body: `На ваш кошелёк поступило ${ton} TON\nЗаказ #${payload.orderId} завершён.`,
      data: { orderId: payload.orderId },
    });
  }

  @OnEvent(EVENTS.ESCROW_REFUNDED)
  async onEscrowRefunded(payload: EscrowRefundedEvent) {
    const ton = (Number(payload.amountNano) / 1e9).toFixed(4);
    await this.notify(payload.buyerId, {
      title: '↩️ Возврат средств',
      body: `Вам возвращено ${ton} TON по заказу #${payload.orderId}`,
      data: { orderId: payload.orderId },
    });
  }

  @OnEvent(EVENTS.PAYMENT_APPROVED)
  async onPaymentApproved(payload: PaymentApprovedEvent) {
    await this.notify(payload.userId, {
      title: '✅ Платёж подтверждён',
      body: `Пополнение на ${payload.amountManat} TMT одобрено администратором.`,
      data: { paymentId: payload.paymentId },
    });
    // Also notify admin
    if (this.adminChatId) {
      await this.sendRaw(this.adminChatId, `💰 Платёж #${payload.paymentId} (${payload.amountManat} TMT) одобрен.`);
    }
  }

  @OnEvent(EVENTS.PAYMENT_REJECTED)
  async onPaymentRejected(payload: PaymentRejectedEvent) {
    await this.notify(payload.userId, {
      title: '❌ Платёж отклонён',
      body: `Пополнение на ${payload.amountManat} TMT отклонено${payload.reason ? `: ${payload.reason}` : '.'}`,
      data: { paymentId: payload.paymentId },
    });
  }

  @OnEvent(EVENTS.DISPUTE_OPENED)
  async onDisputeOpened(payload: DisputeOpenedEvent) {
    await this.notify(payload.initiatorId, {
      title: '⚠️ Спор открыт',
      body: `Вы открыли спор по заказу #${payload.orderId}. Ожидайте решения арбитра.`,
      data: { orderId: payload.orderId, disputeId: payload.disputeId },
    });
    if (this.adminChatId) {
      await this.sendRaw(this.adminChatId, `🚨 Новый спор #${payload.disputeId} по заказу #${payload.orderId}`);
    }
  }

  @OnEvent(EVENTS.DISPUTE_RESOLVED)
  async onDisputeResolved(payload: DisputeResolvedEvent) {
    // Notify both parties via order lookup
    const order = await this.prisma.order.findUnique({ where: { id: payload.orderId }, select: { buyerId: true, sellerId: true } });
    if (!order) return;

    const resolutionText: Record<string, string> = {
      buyer_wins: 'возврат средств покупателю',
      seller_wins: 'выплата фрилансеру',
      split: 'компромиссное решение',
    };

    const text = `Спор #${payload.disputeId} разрешён: ${resolutionText[payload.resolution] || payload.resolution}`;

    await this.notify(order.buyerId, { title: '⚖️ Спор разрешён', body: text, data: { orderId: payload.orderId } });
    await this.notify(order.sellerId, { title: '⚖️ Спор разрешён', body: text, data: { orderId: payload.orderId } });
  }

  @OnEvent(EVENTS.KYC_STATUS_CHANGED)
  async onKycChanged(payload: KycStatusChangedEvent) {
    const title = payload.status === 'approved' ? '✅ Верификация пройдена' : '❌ Верификация отклонена';
    const body = payload.status === 'approved'
      ? 'Ваш аккаунт верифицирован. Теперь вы получаете значок ✓.'
      : 'Ваш запрос на верификацию отклонён. Обратитесь в поддержку.';
    await this.notify(payload.userId, { title, body });
  }

  @OnEvent(EVENTS.WITHDRAWAL_APPROVED)
  async onWithdrawalApproved(payload: WithdrawalApprovedEvent) {
    const ton = (Number(payload.amountNano) / 1e9).toFixed(4);
    await this.notify(payload.userId, {
      title: '✅ Вывод средств одобрен',
      body: `Ваш запрос на вывод ${ton} TON одобрен. Средства будут переведены на ваш адрес.`,
      data: { withdrawalId: payload.withdrawalId },
    });
  }

  @OnEvent(EVENTS.WITHDRAWAL_REJECTED)
  async onWithdrawalRejected(payload: WithdrawalRejectedEvent) {
    const ton = (Number(payload.amountNano) / 1e9).toFixed(4);
    const reasonText = payload.note ? `: ${payload.note}` : '.';
    await this.notify(payload.userId, {
      title: '❌ Заявка на вывод отклонена',
      body: `Запрос на вывод ${ton} TON отклонён${reasonText} Средства возвращены на ваш баланс.`,
      data: { withdrawalId: payload.withdrawalId },
    });
  }

  // ─── HELPERS ───────────────────────────────────────────────────────────

  private async notify(userId: number, { title, body, data }: { title: string; body: string; data?: Record<string, any> }) {
    try {
      const user = await this.prisma.user.findUnique({
        where: { id: userId },
        select: { telegramChatId: true, notificationsEnabled: true },
      });
      if (!user?.telegramChatId || !user.notificationsEnabled) return;

      const chatId = user.telegramChatId.toString();
      const text = `<b>${title}</b>\n\n${body}`;

      await this.sendRaw(chatId, text, {
        parse_mode: 'HTML',
        reply_markup: data?.orderId
          ? {
              inline_keyboard: [
                [
                  {
                    text: '🔍 Открыть в приложении',
                    web_app: { url: `${this.config.get('CLIENT_URL') || 'https://t.me/your_bot/app'}/orders/${data.orderId}` },
                  },
                ],
              ],
            }
          : undefined,
      });

      // Also persist in-app notification
      await this.prisma.notification.create({
        data: {
          userId,
          type: data?.orderId ? 'order_update' : 'system',
          title,
          body,
          data: data || {},
        },
      });
    } catch (err) {
      this.logger.error(`Failed to notify user ${userId}: ${err.message}`);
    }
  }

  private async sendRaw(chatId: string, text: string, extra?: any) {
    if (!this.bot) return;
    try {
      await this.bot.telegram.sendMessage(chatId, text, extra);
    } catch (err) {
      this.logger.error(`Telegram send failed to ${chatId}: ${err.message}`);
    }
  }
}
