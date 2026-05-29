import {
  Injectable,
  Logger,
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
  private readonly logger = new Logger(AuthService.name);

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

  /**
   * Rotates a refresh token, issuing a new token pair.
   *
   * DoS protection (C-5):
   *   The previous implementation fetched ALL active sessions from the database
   *   (full table scan) and ran bcrypt.compare() against every row — O(N) where
   *   N is total active sessions across all users.  An attacker with any valid
   *   refresh token could trivially saturate the event loop by sending concurrent
   *   requests, each triggering N expensive bcrypt operations.
   *
   *   Fix — two-step indexed lookup:
   *   1. jwtService.verify() validates the JWT signature and extracts `sub`
   *      (userId) from the payload immediately, without touching the database.
   *      Forged, tampered, or expired tokens are rejected here with zero DB cost.
   *   2. findMany({ where: { userId, expiresAt: { gt: now } } }) uses the
   *      existing @@index([userId]) on UserSession, returning only THIS user's
   *      active sessions — typically 1–3 rows regardless of platform scale.
   *   3. bcrypt.compare() runs against that tiny set → O(1) in practice.
   *
   *   No schema changes required — @@index([userId]) already exists.
   */
  async refreshTokens(refreshToken: string): Promise<TokenPair> {
    // ── 1. Verify JWT signature & extract userId (zero DB cost) ─────────────
    //       Rejects forged, tampered, or expired tokens before any DB query.
    let payload: { sub: number; role: string; telegramId?: string };
    try {
      payload = this.jwtService.verify(refreshToken);
    } catch (err) {
      this.logger.warn(`refreshTokens: JWT verification failed — ${err.message}`);
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    const userId = payload.sub;

    // ── 2. Indexed lookup — scoped to this user only ─────────────────────────
    //       Uses @@index([userId]) on UserSession; returns 1–3 rows in practice.
    const sessions = await this.prisma.userSession.findMany({
      where: { userId, expiresAt: { gt: new Date() } },
    });

    if (sessions.length === 0) {
      throw new UnauthorizedException('Session not found or has expired');
    }

    // ── 3. Single-user bcrypt comparison (O(1) in practice) ──────────────────
    let validSession: (typeof sessions)[0] | null = null;
    for (const session of sessions) {
      if (await bcrypt.compare(refreshToken, session.tokenHash)) {
        validSession = session;
        break;
      }
    }

    if (!validSession) {
      this.logger.warn(`refreshTokens: token hash mismatch for user ${userId}`);
      throw new UnauthorizedException('Invalid refresh token');
    }

    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new UnauthorizedException('User not found');

    // ── 4. Rotate: delete old session, issue new token pair ──────────────────
    await this.prisma.userSession.delete({ where: { id: validSession.id } });
    const tokens = await this.generateTokenPair(user.id, user.role, user.telegramId?.toString());
    await this.saveRefreshSession(user.id, tokens.refreshToken);

    return tokens;
  }

  /**
   * Logs out the current session identified by the refresh token.
   *
   * Also fixed (C-5 related):
   *   Previously fell back to a full active-session scan when `userId` was not
   *   supplied.  Now extracts `userId` from the JWT payload as a fallback so
   *   the query is always scoped to a single user via the indexed column.
   */
  async logout(refreshToken: string, userId?: number): Promise<void> {
    if (!refreshToken) return;

    // Derive userId from the token if the caller did not supply it
    let resolvedUserId = userId;
    if (!resolvedUserId) {
      try {
        const payload = this.jwtService.verify<{ sub: number }>(refreshToken);
        resolvedUserId = payload.sub;
      } catch {
        // Token is invalid/expired — nothing to revoke
        return;
      }
    }

    // Indexed lookup: only this user's sessions
    const sessions = await this.prisma.userSession.findMany({
      where: { userId: resolvedUserId },
    });

    for (const session of sessions) {
      if (await bcrypt.compare(refreshToken, session.tokenHash)) {
        await this.prisma.userSession.delete({ where: { id: session.id } });
        break; // token uniquely identifies one session
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
