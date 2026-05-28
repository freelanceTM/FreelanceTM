import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TonClient, WalletContractV4, internal, fromNano, toNano } from '@ton/ton';
import { mnemonicToWalletKey } from '@ton/crypto';
import { Address } from '@ton/core';

@Injectable()
export class TonService implements OnModuleInit {
  private readonly logger = new Logger(TonService.name);
  client: TonClient;
  wallet: WalletContractV4 | null = null;
  keyPair: { publicKey: Buffer; secretKey: Buffer } | null = null;
  platformAddress: string | null = null;

  constructor(private config: ConfigService) {}

  async onModuleInit() {
    const endpoint = this.config.get<string>('tonEndpoint');
    const apiKey = this.config.get<string>('tonApiKey');
    const mnemonic = this.config.get<string>('platformMnemonic');

    if (!endpoint) {
      this.logger.warn('TON_ENDPOINT not configured — blockchain features disabled');
      return;
    }

    this.client = new TonClient({ endpoint, apiKey });

    if (mnemonic) {
      try {
        this.keyPair = await mnemonicToWalletKey(mnemonic.split(' '));
        this.wallet = WalletContractV4.create({ publicKey: this.keyPair.publicKey, workchain: 0 });
        this.platformAddress = this.wallet.address.toString({ bounceable: false });
        this.logger.log(`Platform wallet: ${this.platformAddress}`);

        const balance = await this.client.getBalance(this.wallet.address);
        this.logger.log(`Platform balance: ${fromNano(balance)} TON`);
      } catch (err) {
        this.logger.error('Failed to initialize platform wallet', err);
      }
    }
  }

  isConfigured(): boolean {
    return !!this.client && !!this.wallet && !!this.keyPair;
  }

  getPlatformAddress(): string | null {
    return this.platformAddress;
  }

  async sendTransaction(to: string, amountNano: bigint, body?: string | Buffer) {
    if (!this.isConfigured()) {
      throw new Error('TON not configured');
    }

    const walletContract = this.client.open(this.wallet!);
    const seqno = await walletContract.getSeqno();

    const toAddress = Address.parse(to);
    const transfer = walletContract.createTransfer({
      seqno,
      secretKey: this.keyPair!.secretKey,
      messages: [
        internal({
          to: toAddress,
          value: amountNano,
          body: typeof body === 'string' ? body : body,
          bounce: false,
        }),
      ],
    });

    await walletContract.send(transfer);
    return { seqno, from: this.platformAddress!, to };
  }

  async getBalance(address: string): Promise<bigint> {
    const addr = Address.parse(address);
    return this.client.getBalance(addr);
  }
}
