import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma } from '@prisma/client';
import { TIER_GIG_LIMITS, TIER_LABELS } from '../subscriptions/subscription-limits';

@Injectable()
export class GigsService {
  constructor(private prisma: PrismaService) {}

  /**
   * S3-1: Subscription tier enforcement.
   *
   * Before creating a gig, counts the seller's currently active gigs
   * (status = 'active' | 'pending_review' | 'paused' — all count toward
   * the slot, so sellers cannot work around the limit by pausing gigs).
   * Throws HTTP 403 if the limit for their tier would be exceeded.
   *
   * Limits (TIER_GIG_LIMITS):
   *   free     → 3
   *   pro      → 20
   *   business → 9999 (effectively unlimited)
   */
  async create(
    userId: number,
    data: Prisma.GigCreateInput & { categoryId: number; extras?: any[]; packages?: any[] },
  ) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user || (user.role !== 'freelancer' && user.role !== 'both')) {
      throw new ForbiddenException('Only freelancers can create gigs');
    }

    // S3-1: Check subscription tier limit
    const tierLimit = TIER_GIG_LIMITS[user.subscriptionTier] ?? TIER_GIG_LIMITS['free'];
    const activeGigCount = await this.prisma.gig.count({
      where: {
        sellerId: userId,
        status: { in: ['active', 'pending_review', 'paused'] },
      },
    });
    if (activeGigCount >= tierLimit) {
      throw new ForbiddenException(
        `Your ${TIER_LABELS[user.subscriptionTier] ?? user.subscriptionTier} plan allows ` +
        `a maximum of ${tierLimit} gig(s). ` +
        `You currently have ${activeGigCount}. ` +
        `Upgrade your subscription or delete an existing gig to create a new one.`,
      );
    }

    const gig = await this.prisma.gig.create({
      data: {
        title: data.title,
        description: data.description,
        price: new Prisma.Decimal(data.price as any),
        deliveryDays: data.deliveryDays || 3,
        revisions: data.revisions || 1,
        status: (data.status as any) || 'pending_review',
        tags: (data.tags as string[]) || [],
        images: (data.images as string[]) || [],
        seller: { connect: { id: userId } },
        category: { connect: { id: data.categoryId } },
        extras: data.extras
          ? {
              create: data.extras.map(e => ({
                title: e.title,
                description: e.description,
                price: new Prisma.Decimal(e.price),
                deliveryDays: e.deliveryDays || 0,
              })),
            }
          : undefined,
        packages: data.packages
          ? {
              create: data.packages.map(p => ({
                name: p.name,
                description: p.description,
                price: new Prisma.Decimal(p.price),
                deliveryDays: p.deliveryDays || 3,
                revisions: p.revisions || 1,
                includes: p.includes || [],
              })),
            }
          : undefined,
      },
      include: { seller: true, category: true, extras: true, packages: true },
    });

    return this.mapGig(gig);
  }

  /**
   * S3-3: Intelligent search ranking.
   *
   * When `search` is provided → full-text GIN search ranked by ts_rank (Sprint 3 prior).
   * When `sortBy === 'rank'` (default) → weighted SQL rank:
   *
   *   score = isPromoted × 1000 + level_weight + rating × 100
   *
   *   isPromoted weights:
   *     promoted with promotedRank set → 1000 − promotedRank (lower rank = higher position)
   *     promoted without rank          → 1000
   *     not promoted                   → 0
   *
   *   level_weight:
   *     pro → 400 | top → 300 | rising → 200 | new → 100
   *
   *   rating × 100 adds 0–500 points for a 0–5-star gig.
   *
   * All other sortBy values use Prisma ORM orderBy (price_asc, price_desc, rating, orders, newest).
   */
  async findAll(params: {
    page?: number;
    limit?: number;
    categoryId?: number;
    sellerId?: number;
    search?: string;
    minPrice?: number;
    maxPrice?: number;
    sortBy?: string;
    requesterId?: number;
  }) {
    const {
      page = 1,
      limit = 20,
      categoryId,
      sellerId,
      search,
      minPrice,
      maxPrice,
      sortBy = 'rank',   // S3-3: rank is the new default
      requesterId,
    } = params;

    const isOwn = sellerId !== undefined && sellerId === requesterId;

    // Full-text search path overrides sort — ts_rank is the natural ranking
    if (search && search.trim().length > 0) {
      return this.findAllFullText({ search: search.trim(), page, limit, categoryId, sellerId });
    }

    // S3-3: Weighted rank sort (default for public catalog)
    if (sortBy === 'rank' && !isOwn) {
      return this.findAllRanked({ page, limit, categoryId, minPrice, maxPrice });
    }

    // ─── ORM-based sorts (price, rating, orders, newest, or isOwn view) ────

    const where: Prisma.GigWhereInput = {};
    if (!isOwn) where.status = 'active';
    if (categoryId) where.categoryId = categoryId;
    if (sellerId) where.sellerId = sellerId;
    if (minPrice !== undefined) where.price = { gte: new Prisma.Decimal(minPrice) };
    if (maxPrice !== undefined) {
      where.price = { ...((where.price as object) || {}), lte: new Prisma.Decimal(maxPrice) };
    }

    let orderBy: Prisma.GigOrderByWithRelationInput = { createdAt: 'desc' };
    if (sortBy === 'price_asc') orderBy = { price: 'asc' };
    if (sortBy === 'price_desc') orderBy = { price: 'desc' };
    if (sortBy === 'rating') orderBy = { rating: 'desc' };
    if (sortBy === 'orders') orderBy = { orderCount: 'desc' };

    const [gigs, total] = await Promise.all([
      this.prisma.gig.findMany({
        where,
        orderBy,
        skip: (page - 1) * limit,
        take: limit,
        include: {
          seller: true,
          category: true,
          extras: { where: { isActive: true } },
          packages: { where: { isActive: true } },
        },
      }),
      this.prisma.gig.count({ where }),
    ]);
    return { data: gigs.map(this.mapGig), meta: { total, page, limit } };
  }

  /**
   * S3-3: Weighted rank query.
   *
   * score = promotionScore + levelScore + ratingScore
   *
   *   promotionScore:
   *     isPromoted = true AND promotedRank IS NOT NULL → (1000 - promotedRank)
   *     isPromoted = true AND promotedRank IS NULL     → 1000
   *     isPromoted = false                             → 0
   *
   *   levelScore (via JOIN on seller):
   *     'pro' → 400, 'top' → 300, 'rising' → 200, 'new' → 100
   *
   *   ratingScore: FLOOR(gig.rating × 100)  — up to +500 for a 5-star gig
   *
   * Ties broken by createdAt DESC (newer gig wins among equal scores).
   */
  private async findAllRanked(params: {
    page: number;
    limit: number;
    categoryId?: number;
    minPrice?: number;
    maxPrice?: number;
  }) {
    const { page, limit, categoryId, minPrice, maxPrice } = params;
    const offset = (page - 1) * limit;

    const catFilter = categoryId
      ? Prisma.sql`AND g."categoryId" = ${categoryId}`
      : Prisma.empty;

    const minPriceFilter =
      minPrice !== undefined
        ? Prisma.sql`AND g.price >= ${new Prisma.Decimal(minPrice)}`
        : Prisma.empty;

    const maxPriceFilter =
      maxPrice !== undefined
        ? Prisma.sql`AND g.price <= ${new Prisma.Decimal(maxPrice)}`
        : Prisma.empty;

    const [rows, countRows] = await Promise.all([
      this.prisma.$queryRaw<Array<{ id: number }>>(
        Prisma.sql`
          SELECT g.id
          FROM "gigs" g
          JOIN "users" u ON u.id = g."sellerId"
          WHERE g.status = 'active'
            ${catFilter}
            ${minPriceFilter}
            ${maxPriceFilter}
          ORDER BY (
            -- Promotion score: promoted gigs float to the top
            CASE
              WHEN g."isPromoted" = TRUE AND g."promotedRank" IS NOT NULL
                THEN (1000 - g."promotedRank")
              WHEN g."isPromoted" = TRUE
                THEN 1000
              ELSE 0
            END
            +
            -- Level score: more experienced sellers rank higher
            CASE u.level
              WHEN 'pro'     THEN 400
              WHEN 'top'     THEN 300
              WHEN 'rising'  THEN 200
              ELSE           100
            END
            +
            -- Rating score: up to +500 for a 5-star gig
            FLOOR(g.rating * 100)::INTEGER
          ) DESC,
          g."createdAt" DESC
          LIMIT ${limit} OFFSET ${offset}
        `,
      ),
      this.prisma.$queryRaw<Array<{ count: bigint }>>(
        Prisma.sql`
          SELECT COUNT(*)::bigint AS count
          FROM "gigs" g
          JOIN "users" u ON u.id = g."sellerId"
          WHERE g.status = 'active'
            ${catFilter}
            ${minPriceFilter}
            ${maxPriceFilter}
        `,
      ),
    ]);

    const ids = rows.map(r => r.id);
    const total = Number(countRows[0]?.count ?? 0);

    if (ids.length === 0) return { data: [], meta: { total: 0, page, limit } };

    const gigs = await this.prisma.gig.findMany({
      where: { id: { in: ids } },
      include: {
        seller: true,
        category: true,
        extras: { where: { isActive: true } },
        packages: { where: { isActive: true } },
      },
    });

    // Re-sort by rank order (findMany does not preserve IN-clause ordering)
    const gigMap = new Map(gigs.map(g => [g.id, g]));
    const ranked = ids.map(id => gigMap.get(id)).filter((g): g is NonNullable<typeof g> => !!g);

    return { data: ranked.map(this.mapGig), meta: { total, page, limit } };
  }

  /**
   * Full-text search using PostgreSQL tsvector + GIN index (Sprint 3 prior).
   * Gigs are returned ranked by ts_rank relevance, not creation date.
   */
  private async findAllFullText(params: {
    search: string;
    page: number;
    limit: number;
    categoryId?: number;
    sellerId?: number;
  }) {
    const { search, page, limit, categoryId, sellerId } = params;
    const offset = (page - 1) * limit;

    const catFilter    = categoryId ? Prisma.sql`AND "categoryId" = ${categoryId}` : Prisma.empty;
    const sellerFilter = sellerId   ? Prisma.sql`AND "sellerId" = ${sellerId}`     : Prisma.empty;

    const [rows, countRows] = await Promise.all([
      this.prisma.$queryRaw<Array<{ id: number }>>(
        Prisma.sql`
          SELECT id FROM "gigs"
          WHERE status = 'active'
            AND "search_vector" @@ websearch_to_tsquery('simple', ${search})
            ${catFilter} ${sellerFilter}
          ORDER BY ts_rank("search_vector", websearch_to_tsquery('simple', ${search})) DESC
          LIMIT ${limit} OFFSET ${offset}
        `,
      ),
      this.prisma.$queryRaw<Array<{ count: bigint }>>(
        Prisma.sql`
          SELECT COUNT(*)::bigint AS count FROM "gigs"
          WHERE status = 'active'
            AND "search_vector" @@ websearch_to_tsquery('simple', ${search})
            ${catFilter} ${sellerFilter}
        `,
      ),
    ]);

    const ids   = rows.map(r => r.id);
    const total = Number(countRows[0]?.count ?? 0);

    if (ids.length === 0) return { data: [], meta: { total: 0, page, limit } };

    const gigs = await this.prisma.gig.findMany({
      where: { id: { in: ids } },
      include: {
        seller: true,
        category: true,
        extras: { where: { isActive: true } },
        packages: { where: { isActive: true } },
      },
    });

    const gigMap = new Map(gigs.map(g => [g.id, g]));
    const ranked = ids.map(id => gigMap.get(id)).filter((g): g is NonNullable<typeof g> => !!g);

    return { data: ranked.map(this.mapGig), meta: { total, page, limit } };
  }

  async findFeatured() {
    const gigs = await this.prisma.gig.findMany({
      where: { isFeatured: true, status: 'active' },
      orderBy: { orderCount: 'desc' },
      take: 8,
      include: { seller: true, category: true },
    });
    return gigs.map(this.mapGig);
  }

  async findStats() {
    const [freelancers, gigs, orders, categories] = await Promise.all([
      this.prisma.user.count({ where: { role: { in: ['freelancer', 'both'] } } }),
      this.prisma.gig.count({ where: { status: 'active' } }),
      this.prisma.order.count(),
      this.prisma.category.findMany({ orderBy: { gigCount: 'desc' }, take: 5 }),
    ]);
    return { totalFreelancers: freelancers, totalGigs: gigs, totalOrders: orders, topCategories: categories };
  }

  /**
   * S3-4: View tracking — increments gig.views on every GET /gigs/:id (fire-and-forget).
   */
  async findOne(id: number) {
    const gig = await this.prisma.gig.findUnique({
      where: { id },
      include: {
        seller: true,
        category: true,
        extras: { where: { isActive: true } },
        packages: { where: { isActive: true } },
      },
    });
    if (!gig) throw new NotFoundException('Gig not found');

    this.prisma.gig.update({ where: { id }, data: { views: { increment: 1 } } }).catch(() => {});

    return this.mapGig(gig);
  }

  /**
   * S3-2: Pause an active gig.
   *
   * Transitions: active → paused.
   * Paused gigs are hidden from all public catalog queries and search results
   * (findAll and findAllRanked both filter WHERE status = 'active').
   * Orders already in progress on a paused gig are not affected.
   *
   * Only the gig's seller may pause their own gig.
   */
  async pause(userId: number, id: number) {
    const gig = await this.prisma.gig.findUnique({ where: { id } });
    if (!gig) throw new NotFoundException('Gig not found');
    if (gig.sellerId !== userId) throw new ForbiddenException('You can only pause your own gigs');
    if (gig.status !== 'active') {
      throw new BadRequestException(
        `Cannot pause a gig with status '${gig.status}'. Only active gigs can be paused.`,
      );
    }

    const updated = await this.prisma.gig.update({
      where: { id },
      data: { status: 'paused' },
      include: { seller: true, category: true, extras: { where: { isActive: true } }, packages: { where: { isActive: true } } },
    });

    // Pausing removes the gig from the public catalog — decrement category gigCount
    await this.prisma.category.update({
      where: { id: gig.categoryId },
      data: { gigCount: { decrement: 1 } },
    }).catch(() => {});

    return this.mapGig(updated);
  }

  /**
   * S3-2: Resume a paused gig.
   *
   * Transitions: paused → active.
   * Re-validates the seller's subscription tier limit before reactivating —
   * the seller may have been downgraded since the gig was paused, reducing
   * their active-gig allowance.
   *
   * Only the gig's seller may resume their own gig.
   */
  async resume(userId: number, id: number) {
    const gig = await this.prisma.gig.findUnique({ where: { id } });
    if (!gig) throw new NotFoundException('Gig not found');
    if (gig.sellerId !== userId) throw new ForbiddenException('You can only resume your own gigs');
    if (gig.status !== 'paused') {
      throw new BadRequestException(
        `Cannot resume a gig with status '${gig.status}'. Only paused gigs can be resumed.`,
      );
    }

    // S3-1: Re-validate tier limit (tier may have changed while the gig was paused)
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { subscriptionTier: true },
    });
    const tierLimit = TIER_GIG_LIMITS[user?.subscriptionTier ?? 'free'];
    const activeCount = await this.prisma.gig.count({
      where: {
        sellerId: userId,
        status: { in: ['active', 'pending_review'] },
      },
    });
    if (activeCount >= tierLimit) {
      throw new ForbiddenException(
        `Your ${TIER_LABELS[user?.subscriptionTier ?? 'free']} plan allows ` +
        `a maximum of ${tierLimit} active gig(s). ` +
        `Pause or delete another gig before resuming this one, or upgrade your subscription.`,
      );
    }

    const updated = await this.prisma.gig.update({
      where: { id },
      data: { status: 'active' },
      include: { seller: true, category: true, extras: { where: { isActive: true } }, packages: { where: { isActive: true } } },
    });

    // Restore the category counter
    await this.prisma.category.update({
      where: { id: gig.categoryId },
      data: { gigCount: { increment: 1 } },
    }).catch(() => {});

    return this.mapGig(updated);
  }

  async update(userId: number, id: number, data: Prisma.GigUpdateInput) {
    const gig = await this.prisma.gig.findUnique({ where: { id } });
    if (!gig) throw new NotFoundException('Gig not found');
    if (gig.sellerId !== userId) throw new ForbiddenException('You can only update your own gigs');

    const updated = await this.prisma.gig.update({
      where: { id },
      data,
      include: { seller: true, category: true, extras: { where: { isActive: true } }, packages: { where: { isActive: true } } },
    });
    return this.mapGig(updated);
  }

  /**
   * SPEC #3 §2.5 — Soft delete.
   *
   * Transitions the gig to 'paused' instead of removing the DB row, so order
   * history and FKs are preserved. Paused gigs are excluded from all public
   * listing queries (findAll / findAllRanked / findAllFullText all filter
   * status = 'active'). Ownership is enforced — only the seller may delete.
   *
   * Note (schema frozen): GigStatus has no 'inactive' value; 'paused' is the
   * existing hidden-from-catalog state and is reused here. No schema change.
   */
  async remove(userId: number, id: number) {
    const gig = await this.prisma.gig.findUnique({ where: { id } });
    if (!gig) throw new NotFoundException('Gig not found');
    if (gig.sellerId !== userId) throw new ForbiddenException('You can only delete your own gigs');

    // Already soft-deleted / hidden — no-op (idempotent).
    if (gig.status === 'paused') return;

    await this.prisma.gig.update({
      where: { id },
      data: { status: 'paused' },
    });

    // If it was live in the catalog, drop the category counter (mirrors pause()).
    if (gig.status === 'active') {
      await this.prisma.category.update({
        where: { id: gig.categoryId },
        data: { gigCount: { decrement: 1 } },
      }).catch(() => {});
    }
  }

  private mapGig(gig: any) {
    return {
      ...gig,
      price: gig.price.toString(),
      sellerUsername: gig.seller?.username,
      sellerDisplayName: gig.seller?.displayName,
      sellerAvatarUrl: gig.seller?.avatarUrl,
      sellerRating: gig.seller?.rating,
      sellerLevel: gig.seller?.level,
      sellerIsVerified: gig.seller?.isVerified,
      sellerCompletedOrders: gig.seller?.completedOrders,
      categoryName: gig.category?.name,
      createdAt: gig.createdAt.toISOString(),
      updatedAt: gig.updatedAt.toISOString(),
      extras: (gig.extras || []).map((e: any) => ({ ...e, price: e.price?.toString?.() || e.price })),
      packages: (gig.packages || []).map((p: any) => ({ ...p, price: p.price?.toString?.() || p.price })),
    };
  }
}
