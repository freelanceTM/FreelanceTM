import { Injectable, Logger, NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma } from '@prisma/client';
import { TonContractService } from '../ton/ton-contract.service';
import { TonEventType } from '@prisma/client';
import {
  EVENTS,
  EscrowReleasedEvent,
  EscrowRefundedEvent,
} from '../events/notification.events';

@Injectable()
export class EscrowService {
  private readonly logger = new Logger(EscrowService.name);

  constructor(
    private prisma: PrismaService,
    private eventEmitter: EventEmitter2,
    private tonContract: TonContractService,
  ) {}

  async createEscrow(orderId: number, adminId?: number) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: { buyer: { include: { wallet: true } }, seller: { include: { wallet: true } }, gig: true },
    });

    if (!order) throw new NotFoundException('Order not found');
    if (order.escrowAddress) throw new BadRequestException('Escrow already created');

    // Convert price to nanoton (1 TMT ~ 1 TON placeholder, or real exchange rate)
    const amountNano = BigInt(Math.round(Number(order.totalPrice) * 1e9));

    // Try to create on-chain escrow
    let escrowAddress: string | null = null;
    if (
      this.tonContract.isConfigured() &&
      order.buyer.wallet?.address &&
      order.seller.wallet?.address
    ) {
      try {
        const tx = await this.tonContract.createOrder(
          order.id,
          order.buyer.wallet.address,
          order.seller.wallet.address,
          amountNano,
        );
        escrowAddress = process.env.ESCROW_CONTRACT_ADDRESS || null;
        this.logger.log(`On-chain escrow created for order ${orderId}, tx: ${tx?.seqno}`);
      } catch (err) {
        this.logger.warn(`Failed to create on-chain escrow, falling back: ${err.message}`);
      }
    }

    // Fallback or simulation
    if (!escrowAddress) {
      escrowAddress = `EQ_SIM_${orderId}_${Date.now()}`;
    }

    const updated = await this.prisma.order.update({
      where: { id: orderId },
      data: {
        escrowAddress,
        status: 'active',
      },
      include: { buyer: true, seller: true, gig: true },
    });

    // Record platform escrow transaction (freeze)
    await this.prisma.transaction.create({
      data: {
        userId: order.buyerId,
        type: 'escrow_create',
        status: 'completed',
        amountNano,
        currency: 'TON',
        metadata: { orderId, escrowAddress },
      },
    });

    // Store TON event for indexer
    await this.prisma.tonEvent.create({
      data: {
        contractAddress: escrowAddress,
        eventType: TonEventType.escrow_created,
        payload: { orderId, amountNano: amountNano.toString() },
      },
    });

    this.logger.log(`Escrow ${escrowAddress} for order ${orderId}`);
    return this.mapOrder(updated);
  }

  async releaseEscrow(orderId: number, userId: number) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: { buyer: { include: { wallet: true } }, seller: { include: { wallet: true } } },
    });
    if (!order) throw new NotFoundException('Order not found');
    if (order.buyerId !== userId) throw new ForbiddenException('Only buyer can release');
    if (order.status !== 'delivered') throw new BadRequestException('Order must be delivered first');

    const amountNano = BigInt(Math.round(Number(order.totalPrice) * 1e9));

    // Try on-chain release
    if (this.tonContract.isConfigured() && order.escrowAddress && !order.escrowAddress.startsWith('EQ_SIM')) {
      try {
        await this.tonContract.resolveDispute(orderId, 1, 10000); // resolution=1 = release seller
        this.logger.log(`On-chain release for order ${orderId}`);
      } catch (err) {
        this.logger.warn(`On-chain release failed: ${err.message}`);
      }
    }

    await this.prisma.transaction.create({
      data: {
        userId: order.sellerId,
        type: 'escrow_release',
        status: 'completed',
        amountNano,
        currency: 'TON',
        metadata: { orderId, escrowAddress: order.escrowAddress },
      },
    });

    const updated = await this.prisma.order.update({
      where: { id: orderId },
      data: { status: 'completed', completedAt: new Date() },
      include: { buyer: true, seller: true, gig: true },
    });

    // Increment seller stats
    await this.prisma.user.update({
      where: { id: order.sellerId },
      data: { completedOrders: { increment: 1 } },
    });

    await this.prisma.tonEvent.create({
      data: {
        contractAddress: order.escrowAddress,
        eventType: TonEventType.escrow_confirmed,
        payload: { orderId },
      },
    });

    // Emit notification
    this.eventEmitter.emit(EVENTS.ESCROW_RELEASED, {
      orderId,
      sellerId: order.sellerId,
      amountNano: amountNano.toString(),
    } as EscrowReleasedEvent);

    return this.mapOrder(updated);
  }

  async refundEscrow(orderId: number, adminId: number) {
    const order = await this.prisma.order.findUnique({ where: { id: orderId } });
    if (!order) throw new NotFoundException('Order not found');

    const amountNano = BigInt(Math.round(Number(order.totalPrice) * 1e9));

    // Try on-chain refund
    if (this.tonContract.isConfigured() && order.escrowAddress && !order.escrowAddress.startsWith('EQ_SIM')) {
      try {
        await this.tonContract.resolveDispute(orderId, 0, 0); // resolution=0 = refund buyer
      } catch (err) {
        this.logger.warn(`On-chain refund failed: ${err.message}`);
      }
    }

    await this.prisma.transaction.create({
      data: {
        userId: order.buyerId,
        type: 'escrow_refund',
        status: 'completed',
        amountNano,
        currency: 'TON',
        metadata: { orderId, escrowAddress: order.escrowAddress, byAdmin: adminId },
      },
    });

    const updated = await this.prisma.order.update({
      where: { id: orderId },
      data: { status: 'cancelled' },
      include: { buyer: true, seller: true, gig: true },
    });

    await this.prisma.tonEvent.create({
      data: {
        contractAddress: order.escrowAddress,
        eventType: TonEventType.escrow_refunded,
        payload: { orderId },
      },
    });

    this.eventEmitter.emit(EVENTS.ESCROW_REFUNDED, {
      orderId,
      buyerId: order.buyerId,
      amountNano: amountNano.toString(),
    } as EscrowRefundedEvent);

    return this.mapOrder(updated);
  }

  async markDelivered(orderId: number) {
    const order = await this.prisma.order.findUnique({ where: { id: orderId } });
    if (!order) throw new NotFoundException('Order not found');

    // Try on-chain mark delivered
    if (this.tonContract.isConfigured() && order.escrowAddress && !order.escrowAddress.startsWith('EQ_SIM')) {
      try {
        await this.tonContract.markDelivered(orderId);
      } catch (err) {
        this.logger.warn(`On-chain markDelivered failed: ${err.message}`);
      }
    }

    return this.prisma.order.update({
      where: { id: orderId },
      data: { status: 'delivered', updatedAt: new Date() },
    });
  }

  async openDispute(orderId: number, userId: number) {
    const order = await this.prisma.order.findUnique({ where: { id: orderId } });
    if (!order) throw new NotFoundException('Order not found');
    if (order.status !== 'delivered' && order.status !== 'active') {
      throw new BadRequestException('Cannot dispute now');
    }

    if (this.tonContract.isConfigured() && order.escrowAddress && !order.escrowAddress.startsWith('EQ_SIM')) {
      try {
        // Backend cannot directly open dispute from non-owner; dispute is opened by party
        // In on-chain model the buyer/seller sends message from their wallet
        // For MVP we skip on-chain dispute opening and just record locally
      } catch {
        // ignore
      }
    }

    await this.prisma.tonEvent.create({
      data: {
        contractAddress: order.escrowAddress,
        eventType: TonEventType.escrow_disputed,
        payload: { orderId, byUser: userId },
      },
    });

    return this.prisma.order.update({
      where: { id: orderId },
      data: { status: 'disputed', updatedAt: new Date() },
    });
  }

  private mapOrder(order: any) {
    return {
      ...order,
      totalPrice: order.totalPrice?.toString?.() || order.totalPrice,
      createdAt: order.createdAt?.toISOString?.() || order.createdAt,
      updatedAt: order.updatedAt?.toISOString?.() || order.updatedAt,
      completedAt: order.completedAt?.toISOString?.() || order.completedAt,
    };
  }
}
