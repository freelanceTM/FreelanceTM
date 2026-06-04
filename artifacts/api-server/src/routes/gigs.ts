import { Router, type IRouter } from "express";
import { db, gigsTable, usersTable, categoriesTable } from "@workspace/db";
import { eq, and, gte, lte, like, desc, count, sql } from "drizzle-orm";
import { ListGigsQueryParams, GetGigParams, CreateGigBody } from "@workspace/api-zod";

const router: IRouter = Router();

function gigWithDetails(gig: typeof gigsTable.$inferSelect, user: typeof usersTable.$inferSelect, category: typeof categoriesTable.$inferSelect | null) {
  return {
    id: gig.id,
    title: gig.title,
    description: gig.description,
    price: gig.price,
    deliveryDays: gig.deliveryDays,
    categoryId: gig.categoryId,
    categoryName: category?.name ?? null,
    sellerId: gig.sellerId,
    sellerName: user.displayName ?? user.username,
    sellerAvatarUrl: user.avatarUrl ?? null,
    imageUrl: gig.imageUrl ?? null,
    rating: gig.rating,
    reviewCount: gig.reviewCount,
    isFeatured: gig.isFeatured,
    tags: gig.tags,
    createdAt: gig.createdAt,
  };
}

router.get("/gigs", async (req, res): Promise<void> => {
  const params = ListGigsQueryParams.safeParse(req.query);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const { categoryId, minPrice, maxPrice, search, page = 1, limit = 20 } = params.data;
  const offset = ((page ?? 1) - 1) * (limit ?? 20);

  const conditions = [];
  if (categoryId != null) conditions.push(eq(gigsTable.categoryId, categoryId));
  if (minPrice != null) conditions.push(gte(gigsTable.price, minPrice));
  if (maxPrice != null) conditions.push(lte(gigsTable.price, maxPrice));
  if (search) conditions.push(like(gigsTable.title, `%${search}%`));

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

  const rows = await db
    .select({
      gig: gigsTable,
      user: usersTable,
      category: categoriesTable,
    })
    .from(gigsTable)
    .innerJoin(usersTable, eq(usersTable.id, gigsTable.sellerId))
    .leftJoin(categoriesTable, eq(categoriesTable.id, gigsTable.categoryId))
    .where(whereClause)
    .orderBy(desc(gigsTable.createdAt))
    .limit(limit ?? 20)
    .offset(offset);

  const [totalRow] = await db
    .select({ total: count() })
    .from(gigsTable)
    .where(whereClause);

  res.json({
    gigs: rows.map((r) => gigWithDetails(r.gig, r.user, r.category)),
    total: totalRow?.total ?? 0,
    page: page ?? 1,
    limit: limit ?? 20,
  });
});

router.get("/gigs/featured", async (_req, res): Promise<void> => {
  const rows = await db
    .select({
      gig: gigsTable,
      user: usersTable,
      category: categoriesTable,
    })
    .from(gigsTable)
    .innerJoin(usersTable, eq(usersTable.id, gigsTable.sellerId))
    .leftJoin(categoriesTable, eq(categoriesTable.id, gigsTable.categoryId))
    .where(eq(gigsTable.isFeatured, true))
    .orderBy(desc(gigsTable.rating))
    .limit(12);

  res.json(rows.map((r) => gigWithDetails(r.gig, r.user, r.category)));
});

router.get("/gigs/:id", async (req, res): Promise<void> => {
  const rawId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const params = GetGigParams.safeParse({ id: parseInt(rawId, 10) });
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [row] = await db
    .select({ gig: gigsTable, user: usersTable, category: categoriesTable })
    .from(gigsTable)
    .innerJoin(usersTable, eq(usersTable.id, gigsTable.sellerId))
    .leftJoin(categoriesTable, eq(categoriesTable.id, gigsTable.categoryId))
    .where(eq(gigsTable.id, params.data.id));

  if (!row) {
    res.status(404).json({ error: "Gig not found" });
    return;
  }

  res.json(gigWithDetails(row.gig, row.user, row.category));
});

router.post("/gigs", async (req, res): Promise<void> => {
  const parsed = CreateGigBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const sellerId = 1;
  const [gig] = await db.insert(gigsTable).values({
    ...parsed.data,
    sellerId,
    tags: parsed.data.tags ?? [],
  }).returning();

  const [row] = await db
    .select({ gig: gigsTable, user: usersTable, category: categoriesTable })
    .from(gigsTable)
    .innerJoin(usersTable, eq(usersTable.id, gigsTable.sellerId))
    .leftJoin(categoriesTable, eq(categoriesTable.id, gigsTable.categoryId))
    .where(eq(gigsTable.id, gig.id));

  res.status(201).json(gigWithDetails(row.gig, row.user, row.category));
});

router.get("/marketplace/stats", async (_req, res): Promise<void> => {
  const [gigCount] = await db.select({ total: count() }).from(gigsTable);
  const [categoryCount] = await db.select({ total: count() }).from(categoriesTable);
  const [freelancerCount] = await db.select({ total: count() }).from(usersTable).where(eq(usersTable.role, "freelancer"));

  res.json({
    totalGigs: gigCount?.total ?? 0,
    totalFreelancers: freelancerCount?.total ?? 0,
    totalOrders: 0,
    totalCategories: categoryCount?.total ?? 0,
  });
});

export default router;
