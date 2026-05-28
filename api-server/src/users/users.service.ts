import { Injectable, NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma } from '@prisma/client';

@Injectable()
export class UsersService {
  constructor(private prisma: PrismaService) {}

  async getMe(userId: number) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { wallet: true },
    });
    if (!user) throw new NotFoundException('User not found');
    return this.mapUser(user);
  }

  async updateMe(userId: number, data: Prisma.UserUpdateInput) {
    // Prevent role change via updateMe
    delete (data as any).role;
    delete (data as any).id;
    delete (data as any).telegramId;

    const user = await this.prisma.user.update({
      where: { id: userId },
      data,
      include: { wallet: true },
    });
    return this.mapUser(user);
  }

  async completeOnboarding(
    userId: number,
    payload: { role: string; displayName?: string; bio?: string; skills?: string[]; telegramUsername?: string; portfolioUrls?: string[]; languages?: string[] },
  ) {
    const validRoles = ['client', 'freelancer', 'both'];
    if (!validRoles.includes(payload.role)) {
      throw new BadRequestException('Invalid role');
    }

    const user = await this.prisma.user.update({
      where: { id: userId },
      data: {
        onboardingCompleted: true,
        role: payload.role as any,
        displayName: payload.displayName,
        bio: payload.bio,
        skills: payload.skills || [],
        telegramUsername: payload.telegramUsername,
        portfolioUrls: payload.portfolioUrls || [],
        languages: payload.languages || ['ru'],
      },
      include: { wallet: true },
    });
    return this.mapUser(user);
  }

  async getUserById(userId: number, requesterId?: number) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { wallet: { select: { address: true } } },
    });
    if (!user) throw new NotFoundException('User not found');

    const isOwn = requesterId === userId;
    return {
      id: user.id,
      username: user.username,
      displayName: user.displayName,
      avatarUrl: user.avatarUrl,
      bio: user.bio,
      role: user.role,
      level: user.level,
      rating: user.rating,
      completedOrders: user.completedOrders,
      isVerified: user.isVerified,
      country: user.country,
      languages: user.languages,
      skills: user.skills,
      portfolioUrls: user.portfolioUrls,
      walletAddress: user.wallet?.address,
      createdAt: user.createdAt.toISOString(),
      ...(isOwn ? { telegramId: user.telegramId?.toString() } : {}),
    };
  }

  async findByEmail(email: string) {
    const user = await this.prisma.user.findUnique({
      where: { email },
      include: { wallet: true },
    });
    return user ? this.mapUser(user) : null;
  }

  async legacyCreate(data: { username: string; email: string; role: any; displayName: string }) {
    const user = await this.prisma.user.create({
      data: {
        username: data.username,
        email: data.email,
        displayName: data.displayName,
        role: data.role || 'client',
        skills: [],
        portfolioUrls: [],
        languages: ['ru'],
        country: 'TM',
        completedOrders: 0,
        isVerified: false,
        onboardingCompleted: false,
        level: 'new',
      },
      include: { wallet: true },
    });
    return this.mapUser(user);
  }

  async listUsers(params: {
    page?: number;
    limit?: number;
    search?: string;
    role?: string;
  }) {
    const { page = 1, limit = 20, search, role } = params;
    const where: Prisma.UserWhereInput = {};
    if (role) where.role = role as any;
    if (search) {
      where.OR = [
        { username: { contains: search, mode: 'insensitive' } },
        { displayName: { contains: search, mode: 'insensitive' } },
      ];
    }

    const [users, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: { wallet: { select: { address: true } } },
      }),
      this.prisma.user.count({ where }),
    ]);

    return {
      data: users.map(this.mapUser),
      meta: { total, page, limit },
    };
  }

  async updateLastActive(userId: number) {
    await this.prisma.user.update({
      where: { id: userId },
      data: { lastActiveAt: new Date() },
    });
  }

  private mapUser(user: any) {
    const { wallet, ...rest } = user;
    return {
      ...rest,
      telegramId: rest.telegramId?.toString(),
      walletAddress: wallet?.address,
      createdAt: rest.createdAt?.toISOString?.() || rest.createdAt,
      updatedAt: rest.updatedAt?.toISOString?.() || rest.updatedAt,
      lastActiveAt: rest.lastActiveAt?.toISOString?.() || rest.lastActiveAt,
    };
  }
}
