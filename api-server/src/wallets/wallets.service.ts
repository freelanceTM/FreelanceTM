import { Injectable, InternalServerErrorException, Logger } from '@nestjs/common';
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

  async updateBalance(userId: number, balanceNano: bigint) {
    return this.prisma.wallet.update({
      where: { userId },
      data: { balanceNano },
    });
  }

  async listAllWallets() {
    return this.prisma.wallet.findMany();
  }
}
