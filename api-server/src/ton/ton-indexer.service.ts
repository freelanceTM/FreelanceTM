import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { TonService } from './ton.service';
import { PrismaService } from '../prisma/prisma.service';
import { TonEventType } from '@prisma/client';

/**
 * Periodically fetches events from the escrow contract and
 * updates order statuses in PostgreSQL.
 * MVP: queries via TonClient; production: use TonCenter indexer API.
 */
@Injectable()
export class TonIndexerService {
  private readonly logger = new Logger(TonIndexerService.name);

  constructor(
    private ton: TonService,
    private prisma: PrismaService,
  ) {}

  @Cron(CronExpression.EVERY_5_MINUTES)
  async indexEvents() {
    if (!this.ton.isConfigured()) return;
    if (!process.env.ESCROW_CONTRACT_ADDRESS) return;

    this.logger.log('Indexing TON events...');

    try {
      // Fetch unprocessed events from our own table (backend-emitted)
      // In production: use TonCenter getTransactions or webhook
      const pending = await this.prisma.tonEvent.findMany({
        where: { processed: false },
        orderBy: { createdAt: 'asc' },
        take: 100,
      });

      for (const event of pending) {
        try {
          await this.handleEvent(event);
          await this.prisma.tonEvent.update({
            where: { id: event.id },
            data: { processed: true, processedAt: new Date() },
          });
        } catch (err) {
          this.logger.error(`Failed to process ton_event ${event.id}`, err);
          await this.prisma.tonEvent.update({
            where: { id: event.id },
            data: { retryCount: { increment: 1 } },
          });
        }
      }

      // Auto-complete delivered orders past timeout
      await this.autoCompleteOrders();
    } catch (err) {
      this.logger.error('Indexing failed', err);
    }
  }

  private async handleEvent(event: any) {
    const payload = event.payload as any;
    switch (event.eventType) {
      case TonEventType.escrow_created:
        // Order paid and frozen
        if (payload?.orderId) {
          await this.prisma.order.updateMany({
            where: { id: Number(payload.orderId) },
            data: { status: 'active' },
          });
        }
        break;
      case TonEventType.escrow_confirmed:
        // Completed
        if (payload?.orderId) {
          await this.prisma.order.updateMany({
            where: { id: Number(payload.orderId) },
            data: { status: 'completed', completedAt: new Date() },
          });
        }
        break;
      case TonEventType.escrow_disputed:
        if (payload?.orderId) {
          await this.prisma.order.updateMany({
            where: { id: Number(payload.orderId) },
            data: { status: 'disputed' },
          });
        }
        break;
      case TonEventType.escrow_released:
        // same as confirmed
        break;
      case TonEventType.escrow_refunded:
        if (payload?.orderId) {
          await this.prisma.order.updateMany({
            where: { id: Number(payload.orderId) },
            data: { status: 'cancelled' },
          });
        }
        break;
    }
  }

  private async autoCompleteOrders() {
    const timeoutDays = 3;
    const cutoff = new Date(Date.now() - timeoutDays * 24 * 60 * 60 * 1000);

    const expired = await this.prisma.order.findMany({
      where: {
        status: 'delivered',
        updatedAt: { lt: cutoff },
      },
      select: { id: true },
    });

    for (const order of expired) {
      this.logger.log(`Auto-completing order ${order.id}`);
      await this.prisma.order.update({
        where: { id: order.id },
        data: { status: 'completed', completedAt: new Date() },
      });

      // Trigger on-chain autoComplete (best effort)
      try {
        const { TonContractService } = await import('./ton-contract.service');
        // Service would need to be instantiated or called via event
        // For now we just mark locally; platform can batch-submit later
      } catch {
        // blockchain not configured
      }
    }
  }
}
