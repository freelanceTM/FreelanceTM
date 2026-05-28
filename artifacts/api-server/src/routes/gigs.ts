import { Router, type IRouter } from "express";
import { eq, and, gte, lte, like, sql, desc, asc, inArray } from "drizzle-orm";
import { db, gigsTable, usersTable, categoriesTable, ordersTable } from "@workspace/db";
import {
  ListGigsQueryParams,
  ListGigsResponse,
  CreateGigBody,
  GetGigParams,
  GetGigResponse,
  UpdateGigParams,
  UpdateGigBody,
  UpdateGigResponse,
  DeleteGigParams,
  ListFeaturedGigsResponse,
  GetPlatformStatsResponse,
} from "@workspace/api-zod";

const router: IRouter = Router();

function mapGig(
  gig: typeof gigsTable.$inferSelect,
  seller?: typeof usersTable.$inferSelect | null,
  category?: typeof categoriesTable.$inferSelect | null
) {
  return {
    ...gig,
    tags: gig.tags ?? [],
    categoryName: category?.name ?? null,
    sellerUsername: seller?.username ?? null,
    sellerDisplayName: seller?.displayName ?? null,
    sellerAvatarUrl: seller?.avatarUrl ?? null,
    sellerRating: seller?.rating ?? null,
    sellerLevel: seller?.level ?? null,
    sellerIsVerified: seller?.isVerified ?? null,
    sellerCompletedOrders: seller?.completedOrders ?? null,
    revisions: gig.revisions ?? 1,
    status: gig.status ?? "active",
    createdAt: gig.createdAt.toISOString(),
  };
}

router.get("/gigs", async (req, res): Promise<void> => {
  const params = ListGigsQueryParams.safeParse(req.query);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const { categoryId, search, minPrice, maxPrice, page = 1, limit = 20, sellerId, sortBy } = params.data;
  const conditions = [];

  // Only show active gigs unless the requester is viewing their own gigs
  const requesterId = req.headers["x-user-id"] ? parseInt(String(req.headers["x-user-id"]), 10) : null;
  const isOwnGigs = sellerId !== undefined && requesterId !== null && sellerId === requesterId;
  if (!isOwnGigs) conditions.push(eq(gigsTable.status, "active"));
  if (categoryId) conditions.push(eq(gigsTable.categoryId, categoryId));
  if (sellerId) conditions.push(eq(gigsTable.sellerId, sellerId));
  if (minPrice !== undefined) conditions.push(gte(gigsTable.price, minPrice));
  if (maxPrice !== undefined) conditions.push(lte(gigsTable.price, maxPrice));
  if (search) conditions.push(like(gigsTable.title, `%${search}%`));

  const offset = (page - 1) * limit;

  let orderExpr;
  switch (sortBy) {
    case "price_asc": orderExpr = asc(gigsTable.price); break;
    case "price_desc": orderExpr = desc(gigsTable.price); break;
    case "rating": orderExpr = desc(gigsTable.rating); break;
    case "orders": orderExpr = desc(gigsTable.orderCount); break;
    default: orderExpr = desc(gigsTable.createdAt);
  }

  const [gigsRaw, totalRaw] = await Promise.all([
    db.select().from(gigsTable)
      .where(conditions.length ? and(...conditions) : undefined)
      .orderBy(orderExpr)
      .limit(limit)
      .offset(offset),
    db.select({ count: sql<number>`count(*)` }).from(gigsTable)
      .where(conditions.length ? and(...conditions) : undefined),
  ]);

  const sellerIds = [...new Set(gigsRaw.map(g => g.sellerId))];
  const categoryIds = [...new Set(gigsRaw.map(g => g.categoryId))];

  const [sellers, categories] = await Promise.all([
    sellerIds.length > 0 ? db.select().from(usersTable).where(inArray(usersTable.id, sellerIds)) : Promise.resolve([]),
    categoryIds.length > 0 ? db.select().from(categoriesTable).where(inArray(categoriesTable.id, categoryIds)) : Promise.resolve([]),
  ]);

  const sellerMap = Object.fromEntries(sellers.map(s => [s.id, s]));
  const catMap = Object.fromEntries(categories.map(c => [c.id, c]));

  const gigs = gigsRaw.map(g => mapGig(g, sellerMap[g.sellerId], catMap[g.categoryId]));

  res.json(ListGigsResponse.parse({ gigs, total: Number(totalRaw[0]?.count ?? 0), page, limit }));
});

router.get("/gigs/featured", async (_req, res): Promise<void> => {
  const gigsRaw = await db.select().from(gigsTable)
    .where(and(eq(gigsTable.isFeatured, true), eq(gigsTable.status, "active")))
    .orderBy(desc(gigsTable.orderCount))
    .limit(8);

  const sellerIds = [...new Set(gigsRaw.map(g => g.sellerId))];
  const categoryIds = [...new Set(gigsRaw.map(g => g.categoryId))];

  const [sellers, categories] = await Promise.all([
    sellerIds.length > 0 ? db.select().from(usersTable).where(inArray(usersTable.id, sellerIds)) : Promise.resolve([]),
    categoryIds.length > 0 ? db.select().from(categoriesTable).where(inArray(categoriesTable.id, categoryIds)) : Promise.resolve([]),
  ]);

  const sellerMap = Object.fromEntries(sellers.map(s => [s.id, s]));
  const catMap = Object.fromEntries(categories.map(c => [c.id, c]));

  const gigs = gigsRaw.map(g => mapGig(g, sellerMap[g.sellerId], catMap[g.categoryId]));
  res.json(ListFeaturedGigsResponse.parse(gigs));
});

router.get("/gigs/stats", async (_req, res): Promise<void> => {
  const [freelancersCount, gigsCount, ordersCount, catsRaw] = await Promise.all([
    db.select({ count: sql<number>`count(*)` }).from(usersTable)
      .where(sql`${usersTable.role} IN ('freelancer', 'both')`),
    db.select({ count: sql<number>`count(*)` }).from(gigsTable)
      .where(eq(gigsTable.status, "active")),
    db.select({ count: sql<number>`count(*)` }).from(ordersTable),
    db.select().from(categoriesTable).orderBy(desc(categoriesTable.gigCount)).limit(5),
  ]);

  res.json(GetPlatformStatsResponse.parse({
    totalFreelancers: Number(freelancersCount[0]?.count ?? 0),
    totalGigs: Number(gigsCount[0]?.count ?? 0),
    totalOrders: Number(ordersCount[0]?.count ?? 0),
    totalCategories: catsRaw.length,
    topCategories: catsRaw,
  }));
});

router.get("/gigs/:gigId", async (req, res): Promise<void> => {
  const params = GetGigParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [gig] = await db.select().from(gigsTable).where(eq(gigsTable.id, params.data.gigId));
  if (!gig) {
    res.status(404).json({ error: "Gig not found" });
    return;
  }

  const [seller] = await db.select().from(usersTable).where(eq(usersTable.id, gig.sellerId));
  const [category] = await db.select().from(categoriesTable).where(eq(categoriesTable.id, gig.categoryId));

  res.json(GetGigResponse.parse(mapGig(gig, seller, category)));
});

router.post("/gigs", async (req, res): Promise<void> => {
  const userId = req.headers["x-user-id"];
  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const sellerId = parseInt(String(userId), 10);

  const parsed = CreateGigBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [gig] = await db.insert(gigsTable).values({
    ...parsed.data,
    sellerId,
    tags: parsed.data.tags ?? [],
    revisions: parsed.data.revisions ?? 1,
    status: (parsed.data.status as "draft" | "active" | "paused") ?? "active",
    reviewCount: 0,
    orderCount: 0,
    isFeatured: false,
  }).returning();

  if (gig.status === "active") {
    await db.update(categoriesTable)
      .set({ gigCount: sql`${categoriesTable.gigCount} + 1` })
      .where(eq(categoriesTable.id, gig.categoryId));
  }

  const [seller] = await db.select().from(usersTable).where(eq(usersTable.id, gig.sellerId));
  const [category] = await db.select().from(categoriesTable).where(eq(categoriesTable.id, gig.categoryId));

  res.status(201).json(GetGigResponse.parse(mapGig(gig, seller, category)));
});

router.patch("/gigs/:gigId", async (req, res): Promise<void> => {
  const userId = req.headers["x-user-id"];
  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const params = UpdateGigParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const parsed = UpdateGigBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [existing] = await db.select().from(gigsTable).where(eq(gigsTable.id, params.data.gigId));
  if (!existing) {
    res.status(404).json({ error: "Gig not found" });
    return;
  }
  if (existing.sellerId !== parseInt(String(userId), 10)) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  const [gig] = await db.update(gigsTable).set(parsed.data).where(eq(gigsTable.id, params.data.gigId)).returning();

  const [seller] = await db.select().from(usersTable).where(eq(usersTable.id, gig.sellerId));
  const [category] = await db.select().from(categoriesTable).where(eq(categoriesTable.id, gig.categoryId));

  res.json(UpdateGigResponse.parse(mapGig(gig, seller, category)));
});

router.delete("/gigs/:gigId", async (req, res): Promise<void> => {
  const userId = req.headers["x-user-id"];
  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const params = DeleteGigParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [existing] = await db.select().from(gigsTable).where(eq(gigsTable.id, params.data.gigId));
  if (!existing) {
    res.status(404).json({ error: "Gig not found" });
    return;
  }
  if (existing.sellerId !== parseInt(String(userId), 10)) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  await db.delete(gigsTable).where(eq(gigsTable.id, params.data.gigId));
  res.sendStatus(204);
});

export default router;
