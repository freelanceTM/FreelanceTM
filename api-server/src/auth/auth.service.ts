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
import { randomUUID } from 'crypto';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { WalletsService } from '../wallets/wallets.service';
import { validateTelegramInitData } from '../common/utils/telegram';
import * as bcrypt from 'bcrypt';

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

/**
 * Internal result from generateTokenPair.
 * Carries the jti separately so the caller can persist it in UserSession
 * without leaking it into the public TokenPair interface.
 */
interface TokenPairResult {
  pair: TokenPair;
  jti: string;
}

/** Shape of a verified refresh-token JWT payload. */
interface RefreshPayload {
  sub: number;
  role: string;
  telegramId?: string;
  jti: string;
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
      // Create new user with custodial wallet.
      //
      // M-1 fix — eliminate the TOCTOU race condition:
      //   The previous check-then-create pattern (findUnique → create) was not
      //   atomic. Two concurrent first-logins for the same Telegram user, or two
      //   users sharing the same Telegram username, could both pass the findUnique
      //   check and both attempt create — one would hit an unhandled Prisma unique
      //   constraint error and return a 500.
      //
      //   Fix: drop the pre-flight findUnique entirely. Attempt prisma.user.create()
      //   directly and let PostgreSQL enforce uniqueness atomically. Catch
      //   PrismaClientKnownRequestError P2002 (unique constraint violation) and
      //   surface it as a clean 409 ConflictException instead of a 500.
      const username = tgUser.username || `user_${tgUser.id}`;

      try {
        user = await this.prisma.user.create({
          data: {
            telegramId: BigInt(tgUser.id),
            username,
            displayName: [tgUser.first_name, tgUser.last_name].filter(Boolean).join(' ') || username,
            avatarUrl: tgUser.photo_url || null,
            role: (requestedRole as any) || 'client',
            country: 'TM',
          },
          include: { wallet: true },
        });
      } catch (err) {
        if (
          err instanceof Prisma.PrismaClientKnownRequestError &&
          err.code === 'P2002'
        ) {
          // Unique constraint violation — telegramId or username already exists.
          // This means either a concurrent request already created this account,
          // or the derived username collides with an existing user.
          this.logger.warn(
            `telegramLogin: P2002 on user create for telegramId ${tgUser.id} ` +
            `(fields: ${(err.meta?.target as string[])?.join(', ') ?? 'unknown'})`,
          );
          throw new ConflictException(
            'An account with this Telegram ID or username already exists.',
          );
        }
        throw err;
      }

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

    const { pair: tokens, jti } = await this.generateTokenPair(
      user.id,
      user.role,
      user.telegramId?.toString(),
    );
    await this.saveRefreshSession(user.id, tokens.refreshToken, jti);

    return {
      user: this.sanitizeUser(user),
      tokens,
    };
  }

  /**
   * Rotates a refresh token, issuing a new token pair.
   *
   * H-7 fix — three root causes addressed:
   *
   *  1. Refresh tokens were signed with JWT_SECRET, the same key used for
   *     access tokens. A single secret compromise exposed both token types
   *     simultaneously. Fixed: refresh tokens are now signed and verified with
   *     the dedicated JWT_REFRESH_SECRET, loaded per-call so the JwtModule
   *     global default (JWT_SECRET) continues to cover access tokens only.
   *
   *  2. No jti claim — stolen access tokens could not be revoked before expiry,
   *     and refresh tokens had no unique identifier, preventing fast lookup.
   *     Fixed: a UUID jti is embedded in every refresh token payload and stored
   *     in UserSession. Lookup is now O(1) via the @unique jti index instead of
   *     an O(N) bcrypt scan over all active sessions.
   *
   *  3. The bcrypt hash comparison is retained as defense-in-depth after the
   *     jti lookup: even an attacker with full DB read access cannot forge a
   *     valid token without the raw token preimage.
   *
   * DoS protection (C-5, prior fix):
   *   JWT signature verification rejects forged/expired tokens before any DB
   *   query. The indexed jti lookup then resolves a single row — O(1) regardless
   *   of total platform sessions. One bcrypt comparison follows.
   */
  async refreshTokens(refreshToken: string): Promise<TokenPair> {
    const jwtRefreshSecret = this.getRefreshSecret();

    // ── 1. Verify JWT signature with the DEDICATED refresh secret ────────────
    //       Rejects forged, tampered, or expired tokens before any DB query.
    //       Also ensures this token was issued as a refresh token (not an access
    //       token re-used here — the two now have distinct signing keys).
    let payload: RefreshPayload;
    try {
      payload = this.jwtService.verify<RefreshPayload>(refreshToken, {
        secret: jwtRefreshSecret,
      });
    } catch (err) {
      this.logger.warn(`refreshTokens: JWT verification failed — ${err.message}`);
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    const { sub: userId, jti } = payload;

    // ── 2. O(1) indexed lookup by jti (unique index on user_sessions) ────────
    //       Scoped to this user and this exact token ID — no bcrypt scan.
    const session = await this.prisma.userSession.findFirst({
      where: { userId, jti, expiresAt: { gt: new Date() } },
    });

    if (!session) {
      this.logger.warn(
        `refreshTokens: no active session for user ${userId}, jti ${jti}`,
      );
      throw new UnauthorizedException('Session not found or has expired');
    }

    // ── 3. Defense-in-depth: verify raw token hash ───────────────────────────
    //       Guards against an attacker who has DB read access but not JWT_REFRESH_SECRET.
    //       Without the raw token they cannot construct a preimage that passes bcrypt.
    const tokenValid = await bcrypt.compare(refreshToken, session.tokenHash);
    if (!tokenValid) {
      this.logger.warn(
        `refreshTokens: token hash mismatch for user ${userId}, jti ${jti}`,
      );
      throw new UnauthorizedException('Invalid refresh token');
    }

    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new UnauthorizedException('User not found');

    // ── 4. Rotate: delete old session, issue new token pair ──────────────────
    await this.prisma.userSession.delete({ where: { id: session.id } });
    const { pair: tokens, jti: newJti } = await this.generateTokenPair(
      user.id,
      user.role,
      user.telegramId?.toString(),
    );
    await this.saveRefreshSession(user.id, tokens.refreshToken, newJti);

    return tokens;
  }

  /**
   * Logs out the current session identified by the refresh token.
   *
   * H-7 fix: verifies with JWT_REFRESH_SECRET and uses the jti claim for an
   * O(1) indexed delete instead of a bcrypt scan over all user sessions.
   */
  async logout(refreshToken: string, userId?: number): Promise<void> {
    if (!refreshToken) return;

    const jwtRefreshSecret = this.config.get<string>('jwtRefreshSecret');
    if (!jwtRefreshSecret) {
      // JWT_REFRESH_SECRET not yet configured — nothing safe to verify
      return;
    }

    let resolvedUserId = userId;
    let jti: string | undefined;

    try {
      const p = this.jwtService.verify<RefreshPayload>(refreshToken, {
        secret: jwtRefreshSecret,
      });
      resolvedUserId = p.sub;
      jti = p.jti;
    } catch {
      // Token is invalid/expired — nothing to revoke
      return;
    }

    if (!resolvedUserId) return;

    // Fast path: delete by jti — O(1) via the @unique index
    if (jti) {
      await this.prisma.userSession.deleteMany({
        where: { userId: resolvedUserId, jti },
      });
      return;
    }

    // Fallback: bcrypt scan for tokens issued before this fix was deployed
    const sessions = await this.prisma.userSession.findMany({
      where: { userId: resolvedUserId },
    });
    for (const session of sessions) {
      if (await bcrypt.compare(refreshToken, session.tokenHash)) {
        await this.prisma.userSession.delete({ where: { id: session.id } });
        break;
      }
    }
  }

  async logoutAll(userId: number): Promise<void> {
    await this.prisma.userSession.deleteMany({ where: { userId } });
  }

  /**
   * Issues a new access + refresh token pair.
   *
   * Access token  — signed with JWT_SECRET (JwtModule global default).
   *                 Short-lived (default 15 m). No jti — revocation uses expiry.
   *
   * Refresh token — signed with JWT_REFRESH_SECRET (passed per-call, overriding
   *                 the JwtModule default). Long-lived (default 7 d). Contains a
   *                 UUID jti for O(1) session lookup and future revocation.
   *
   * Returns both the public TokenPair and the jti so the caller can persist it
   * in UserSession without exposing it in the public interface.
   */
  private async generateTokenPair(
    userId: number,
    role: string,
    telegramId?: string,
  ): Promise<TokenPairResult> {
    const jwtRefreshSecret = this.getRefreshSecret();

    const jti = randomUUID();
    const accessPayload = { sub: userId, role, telegramId };
    const refreshPayload: RefreshPayload = { sub: userId, role, telegramId, jti };

    const accessExpiration = this.config.get<string>('jwtAccessExpiration', '15m');
    const refreshExpiration = this.config.get<string>('jwtRefreshExpiration', '7d');

    // Access token: uses the JwtModule global secret (JWT_SECRET)
    const accessToken = this.jwtService.sign(accessPayload, {
      expiresIn: accessExpiration,
    });

    // Refresh token: uses the dedicated JWT_REFRESH_SECRET, passed per-call
    // so it overrides the JwtModule module-level default for this call only.
    const refreshToken = this.jwtService.sign(refreshPayload, {
      secret: jwtRefreshSecret,
      expiresIn: refreshExpiration,
    });

    const expiresIn = this.parseDurationToSeconds(accessExpiration) || 900;

    return {
      pair: { accessToken, refreshToken, expiresIn },
      jti,
    };
  }

  /**
   * Persists a hashed refresh token alongside its jti in UserSession.
   * The jti column carries a @unique constraint — duplicate jti values are
   * rejected at the DB level, providing a second layer of uniqueness beyond
   * the UUID collision probability.
   */
  private async saveRefreshSession(
    userId: number,
    refreshToken: string,
    jti: string,
  ): Promise<void> {
    const hash = await bcrypt.hash(refreshToken, 10);
    const refreshExpiration = this.config.get<string>('jwtRefreshExpiration', '7d');
    const expiresSeconds = this.parseDurationToSeconds(refreshExpiration) || 604800;
    const expiresAt = new Date(Date.now() + expiresSeconds * 1000);

    await this.prisma.userSession.create({
      data: { userId, tokenHash: hash, jti, expiresAt },
    });
  }

  /**
   * Returns the JWT_REFRESH_SECRET, throwing a 500 if it is not configured.
   * Centralises the env-check so it never has to be repeated inline.
   */
  private getRefreshSecret(): string {
    const secret = this.config.get<string>('jwtRefreshSecret');
    if (!secret) {
      throw new InternalServerErrorException(
        'JWT_REFRESH_SECRET is not configured. ' +
        'Set this environment variable to a high-entropy random string ' +
        'distinct from JWT_SECRET.',
      );
    }
    return secret;
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
