import {
  Injectable,
  UnauthorizedException,
  BadRequestException,
  ConflictException,
  InternalServerErrorException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { WalletsService } from '../wallets/wallets.service';
import { validateTelegramInitData } from '../common/utils/telegram';
import * as bcrypt from 'bcrypt';

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
    private config: ConfigService,
    private walletsService: WalletsService,
  ) {}

  async telegramLogin(initData: string, requestedRole?: string): Promise<{
    user: any;
    tokens: TokenPair;
  }> {
    const botToken = this.config.get<string>('telegramBotToken');
    if (!botToken) {
      throw new InternalServerErrorException('Telegram bot token is not configured');
    }

    const tgUser = validateTelegramInitData(initData, botToken);
    if (!tgUser) {
      throw new UnauthorizedException('Invalid Telegram init data');
    }

    let user = await this.prisma.user.findUnique({
      where: { telegramId: BigInt(tgUser.id) },
      include: { wallet: true },
    });

    if (!user) {
      // Create new user with custodial wallet
      const username = tgUser.username || `user_${tgUser.id}`;
      const existingUsername = await this.prisma.user.findUnique({
        where: { username },
      });

      const finalUsername = existingUsername ? `${username}_${Date.now()}` : username;

      user = await this.prisma.user.create({
        data: {
          telegramId: BigInt(tgUser.id),
          username: finalUsername,
          displayName: [tgUser.first_name, tgUser.last_name].filter(Boolean).join(' ') || finalUsername,
          avatarUrl: tgUser.photo_url || null,
          role: (requestedRole as any) || 'client',
          country: 'TM',
        },
        include: { wallet: true },
      });

      // Generate custodial TON wallet
      const wallet = await this.walletsService.createWallet(user.id);
      user.wallet = wallet;
    } else {
      // Update last active
      await this.prisma.user.update({
        where: { id: user.id },
        data: { lastActiveAt: new Date() },
      });
    }

    const tokens = await this.generateTokenPair(user.id, user.role, user.telegramId?.toString());
    await this.saveRefreshSession(user.id, tokens.refreshToken);

    return {
      user: this.sanitizeUser(user),
      tokens,
    };
  }

  async refreshTokens(refreshToken: string): Promise<TokenPair> {
    const hash = await bcrypt.hash(refreshToken, 10); // We actually should store hash; but to verify, use bcrypt.compare
    // For simplicity and performance in MVP: find all active sessions, compare
    const sessions = await this.prisma.userSession.findMany({
      where: { expiresAt: { gt: new Date() } },
    });

    let validSession = null;
    for (const session of sessions) {
      const match = await bcrypt.compare(refreshToken, session.tokenHash);
      if (match) {
        validSession = session;
        break;
      }
    }

    if (!validSession) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    const user = await this.prisma.user.findUnique({
      where: { id: validSession.userId },
    });
    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    // Rotate: delete old, create new
    await this.prisma.userSession.delete({ where: { id: validSession.id } });
    const tokens = await this.generateTokenPair(user.id, user.role, user.telegramId?.toString());
    await this.saveRefreshSession(user.id, tokens.refreshToken);

    return tokens;
  }

  async logout(refreshToken: string, userId?: number): Promise<void> {
    if (!refreshToken) return;
    const sessions = await this.prisma.userSession.findMany({
      where: userId ? { userId } : { expiresAt: { gt: new Date() } },
    });
    for (const session of sessions) {
      const match = await bcrypt.compare(refreshToken, session.tokenHash);
      if (match) {
        await this.prisma.userSession.delete({ where: { id: session.id } });
      }
    }
  }

  async logoutAll(userId: number): Promise<void> {
    await this.prisma.userSession.deleteMany({ where: { userId } });
  }

  private async generateTokenPair(userId: number, role: string, telegramId?: string): Promise<TokenPair> {
    const payload = { sub: userId, role, telegramId };
    const accessExpiration = this.config.get<string>('jwtAccessExpiration', '15m');
    const refreshExpiration = this.config.get<string>('jwtRefreshExpiration', '7d');

    const accessToken = this.jwtService.sign(payload, { expiresIn: accessExpiration });
    const refreshToken = this.jwtService.sign(payload, { expiresIn: refreshExpiration });

    // Parse expiration seconds roughly for client
    const expiresIn = this.parseDurationToSeconds(accessExpiration) || 900;

    return { accessToken, refreshToken, expiresIn };
  }

  private async saveRefreshSession(userId: number, refreshToken: string): Promise<void> {
    const hash = await bcrypt.hash(refreshToken, 10);
    const refreshExpiration = this.config.get<string>('jwtRefreshExpiration', '7d');
    const expiresSeconds = this.parseDurationToSeconds(refreshExpiration) || 604800;
    const expiresAt = new Date(Date.now() + expiresSeconds * 1000);

    await this.prisma.userSession.create({
      data: {
        userId,
        tokenHash: hash,
        expiresAt,
      },
    });
  }

  private parseDurationToSeconds(duration: string): number | null {
    const match = duration.match(/^(\d+)([smhdw])$/);
    if (!match) return null;
    const value = parseInt(match[1], 10);
    switch (match[2]) {
      case 's': return value;
      case 'm': return value * 60;
      case 'h': return value * 3600;
      case 'd': return value * 86400;
      case 'w': return value * 604800;
      default: return null;
    }
  }

  private sanitizeUser(user: any) {
    const { wallet, ...rest } = user;
    return {
      ...rest,
      telegramId: rest.telegramId?.toString(),
      wallet: wallet
        ? {
            address: wallet.address,
            publicKey: wallet.publicKey,
            balanceNano: wallet.balanceNano?.toString(),
            version: wallet.version,
          }
        : null,
    };
  }
}
