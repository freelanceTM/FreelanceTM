import { Injectable, Logger } from '@nestjs/common';
import { TonService } from './ton.service';
import { Address, Cell, beginCell, toNano } from '@ton/core';

/**
 * Sends messages to the deployed FreelanceEscrow TACT contract.
 * Uses the platform wallet as sender (owner).
 */
@Injectable()
export class TonContractService {
  private readonly logger = new Logger(TonContractService.name);
  private escrowAddress: string | null = null;

  constructor(private ton: TonService) {
    this.escrowAddress = process.env.ESCROW_CONTRACT_ADDRESS || null;
  }

  isConfigured(): boolean {
    return this.ton.isConfigured() && !!this.escrowAddress;
  }

  private getEscrowAddress(): Address {
    if (!this.escrowAddress) throw new Error('Escrow contract not configured');
    return Address.parse(this.escrowAddress);
  }

  async createOrder(orderId: number, buyerAddress: string, sellerAddress: string, amountNano: bigint) {
    if (!this.isConfigured()) return null;

    const payload = beginCell()
      .storeUint(0x12345678, 32) // op-code for CreateOrder (must match contract)
      .storeUint(BigInt(orderId), 64)
      .storeAddress(Address.parse(buyerAddress))
      .storeAddress(Address.parse(sellerAddress))
      .storeCoins(amountNano)
      .endCell();

    return this.ton.sendTransaction(this.escrowAddress!, toNano('0.01'), payload);
  }

  async markDelivered(orderId: number) {
    if (!this.isConfigured()) return null;

    const payload = beginCell()
      .storeUint(0x87654321, 32) // op-code for MarkDelivered
      .storeUint(BigInt(orderId), 64)
      .endCell();

    return this.ton.sendTransaction(this.escrowAddress!, toNano('0.01'), payload);
  }

  async resolveDispute(orderId: number, resolution: number, sellerPercent: number) {
    if (!this.isConfigured()) return null;

    const payload = beginCell()
      .storeUint(0xabcdef01, 32) // op-code for ResolveDispute
      .storeUint(BigInt(orderId), 64)
      .storeUint(BigInt(resolution), 8)
      .storeUint(BigInt(sellerPercent), 16)
      .endCell();

    return this.ton.sendTransaction(this.escrowAddress!, toNano('0.01'), payload);
  }

  async cancelOrder(orderId: number) {
    if (!this.isConfigured()) return null;

    const payload = beginCell()
      .storeUint(0xfedcba09, 32) // op-code for CancelOrder
      .storeUint(BigInt(orderId), 64)
      .endCell();

    return this.ton.sendTransaction(this.escrowAddress!, toNano('0.01'), payload);
  }

  async autoComplete(orderId: number) {
    if (!this.isConfigured()) return null;

    const payload = beginCell()
      .storeUint(0x11223344, 32) // op-code for AutoComplete
      .storeUint(BigInt(orderId), 64)
      .endCell();

    return this.ton.sendTransaction(this.escrowAddress!, toNano('0.01'), payload);
  }
}
