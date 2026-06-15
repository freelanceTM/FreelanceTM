import { Injectable, InternalServerErrorException, BadRequestException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { encrypt } from '../common/utils/crypto';
import { mnemonicNew, mnemonicToPrivateKey, keyPairFromSecretKey } from '@ton/crypto';
import { WalletContractV4 } from '@ton/ton';

@Injectable()
export class WalletsService {
  private readonly logger = new Logger(WalletsService.name);

  constructor(
    private prisma: PrismaService,
    private config: ConfigService,
  ) {}

  async createWallet(userId: number) {
    const existing = await this.prisma.wallet.findUnique({ where: { userId } });
    if (existing) {
      return existing;
    }

    const masterKey = this.config.get<string>('masterEncryptionKey');
    if (!masterKey || masterKey.length < 16) {
      throw new InternalServerErrorException('Master encryption key is not configured');
    }

    try {
      const words = await mnemonicNew(24);
      const mnemonicString = words.join(' ');
      const keyPair = await mnemonicToPrivateKey(words);
      const wallet = WalletContractV4.create({ publicKey: keyPair.publicKey, workchain: 0 });
      const address = wallet.address.toString({ bounceable: false });

      const encryptedMnemonic    = await encrypt(mnemonicString, masterKey);
      const encryptedPrivateKey  = await encrypt(Buffer.from(keyPair.secretKey).toString('base64'), masterKey);

      return this.prisma.wallet.create({
        data: {
          userId,
          address,
          publicKey: Buffer.from(keyPair.publicKey).toString('base64'),
          encryptedMnemonic,
          encryptedPrivateKey,
          version: 'v4R2',
          balanceNano: BigInt(0),
        },
      });
    } catch (err) {
      this.logger.error('Wallet creation failed', err);
      throw new InternalServerErrorException('Failed to generate custodial wallet');
    }
  }

  async getWallet(userId: number) {
    return this.prisma.wallet.findUnique({ where: { userId } });
  }

  async getWalletByAddress(address: string) {
    return this.prisma.wallet.findUnique({ where: { address } });
  }

  /**
   * F-2 fix — audited balance ADJUSTMENT (replaces the unsafe absolute SET).
   *
   * The previous updateBalance() overwrote balanceNano with an absolute value,
   * bypassing the ledger and racing every concurrent escrow/withdrawal write
   * (lost update). This version:
   *   • applies a signed DELTA atomically (increment / CAS-guarded decrement),
   *   • writes a Transaction ledger row for every change (full audit trail),
   *   • never overdrafts (negative delta uses WHERE balance >= |delta|),
   * all inside a single $transaction.
   *
   * @param deltaNano signed: positive = credit, negative = debit
   */
  async adjustBalance(userId: number, deltaNano: bigint, adminId: number, reason?: string) {
    if (deltaNano === 0n) {
      throw new BadRequestException('Adjustment amount must be non-zero');
    }

    return this.prisma.$transaction(async (tx) => {
      if (deltaNano < 0n) {
        // CAS debit: only succeeds if balance can cover it (no overdraft).
        const debited = await tx.wallet.updateMany({
          where: { userId, balanceNano: { gte: -deltaNano } },
          data: { balanceNano: { decrement: -deltaNano } },
        });
        if (debited.count === 0) {
          throw new BadRequestException(
            'Insufficient balance for this negative adjustment (or wallet not found)',
          );
        }
      } else {
        const credited = await tx.wallet.updateMany({
          where: { userId },
          data: { balanceNano: { increment: deltaNano } },
        });
        if (credited.count === 0) {
          throw new BadRequestException('Wallet not found');
        }
      }

      // Immutable audit ledger entry for the manual adjustment.
      await tx.transaction.create({
        data: {
          userId,
          type: deltaNano > 0n ? 'deposit' : 'withdraw',
          status: 'completed',
          amountNano: deltaNano > 0n ? deltaNano : -deltaNano,
          currency: 'TON',
          metadata: { adminAdjustment: true, adminId, reason: reason ?? null },
        },
      });

      return tx.wallet.findUnique({ where: { userId } });
    });
  }

  async listAllWallets() {
    return this.prisma.wallet.findMany();
  }

  /**
   * SPEC #1 §5 — GET /wallet/transactions (adapted to existing stack).
   *
   * Reads the single ledger (existing `Transaction` model) for one user.
   * Read-only: does NOT mutate balance or create rows. amountNano is a BigInt
   * and is serialized to string by the controller (JSON cannot carry BigInt).
   */
  async listTransactions(userId: number) {
    return this.prisma.transaction.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
  }
}
