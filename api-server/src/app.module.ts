import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { ScheduleModule } from '@nestjs/schedule';
import appConfig from './config/app.config';
import { LoggerModule } from './common/logger/logger.module';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { GigsModule } from './gigs/gigs.module';
import { OrdersModule } from './orders/orders.module';
import { MessagesModule } from './messages/messages.module';
import { ConversationsModule } from './conversations/conversations.module';
import { WalletsModule } from './wallets/wallets.module';
import { EscrowModule } from './escrow/escrow.module';
import { AiModule } from './ai/ai.module';
import { AdminModule } from './admin/admin.module';
import { TelegramModule } from './telegram/telegram.module';
import { NotificationsModule } from './notifications/notifications.module';
import { PaymentsModule } from './payments/payments.module';
import { WithdrawalsModule } from './withdrawals/withdrawals.module';
import { TendersModule } from './tenders/tenders.module';
import { PortfolioModule } from './portfolio/portfolio.module';
import { PromocodesModule } from './promocodes/promocodes.module';
import { AnalyticsModule } from './analytics/analytics.module';
import { WebhooksModule } from './webhooks/webhooks.module';
import { StorageModule } from './storage/storage.module';
import { TonModule } from './ton/ton.module';
import { LegalModule } from './legal/legal.module';
import { ReviewsModule } from './reviews/reviews.module';
import { LevelsModule } from './levels/levels.module';
import { SubscriptionsModule } from './subscriptions/subscriptions.module';
import { ReferralsModule } from './referrals/referrals.module';
import { CategoriesModule } from './categories/categories.module';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [appConfig],
      envFilePath: ['.env', '.env.local'],
    }),
    LoggerModule,
    EventEmitterModule.forRoot({
      wildcard: false,
      delimiter: '.',
      newListener: false,
      removeListener: false,
      maxListeners: 10,
      verboseMemoryLeak: false,
      ignoreErrors: false,
    }),
    ScheduleModule.forRoot(),
    ThrottlerModule.forRoot([
      {
        name: 'short',
        ttl: 1000,
        limit: 10,
      },
      {
        name: 'medium',
        ttl: 10000,
        limit: 100,
      },
      {
        name: 'long',
        ttl: 60000,
        limit: 300,
      },
    ]),
    PrismaModule,
    AuthModule,
    UsersModule,
    GigsModule,
    OrdersModule,
    MessagesModule,
    ConversationsModule,
    WalletsModule,
    EscrowModule,
    AiModule,
    AdminModule,
    TelegramModule,
    NotificationsModule,
    PaymentsModule,
    WithdrawalsModule,
    TendersModule,
    PortfolioModule,
    PromocodesModule,
    AnalyticsModule,
    WebhooksModule,
    StorageModule,
    TonModule,
    LegalModule,
    ReviewsModule,
    LevelsModule,
    SubscriptionsModule,
    ReferralsModule,
    CategoriesModule,
  ],
  providers: [
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule {}
