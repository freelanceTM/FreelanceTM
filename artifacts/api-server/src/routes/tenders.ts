import { Router, type IRouter } from "express";
  import { db, tendersTable, usersTable, categoriesTable } from "@workspace/db";
  import { eq, and, like, desc, count, sql } from "drizzle-orm";
  import { ListTendersQueryParams, GetTenderParams, CreateTenderBody } from "@workspace/api-zod";
  import { extractUser, requireAuth } from "../middleware/auth";
  import { z } from "zod";

  const router: IRouter = Router();

  function tenderWithDetails(
    tender: typeof tendersTable.$inferSelect,
    buyer: typeof usersTable.$inferSelect,
    category: typeof categoriesTable.$inferSelect | null,
  ) {
    return {
      id: tender.id,
      title: tender.title,
      description: tender.description,
      budget: tender.budget,
      categoryId: tender.categoryId,
      categoryName: category?.name ?? null,
      buyerId: tender.buyerId,
      buyerName: buyer.displayName ?? buyer.username,
      buyerAvatarUrl: buyer.avatarUrl ?? null,
      status: tender.status,
      proposalCount: tender.proposalCount,
      deadline: tender.deadline ?? null,
      skills: tender.skills,
      createdAt: tender.createdAt,
    };
  }

  router.get("/tenders", async (req, res): Promise<void> => {
    const params = ListTendersQueryParams.safeParse(req.query);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }

    const { categoryId, search, page = 1 } = params.data;
    const limit = 20;
    const offset = ((page ?? 1) - 1) * limit;

    const conditions = [];
    if (categoryId != null) conditions.push(eq(tendersTable.categoryId, categoryId));
    if (search) conditions.push(like(tendersTable.title, `%${search}%`));

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const rows = await db
      .select({ tender: tendersTable, buyer: usersTable, category: categoriesTable })
      .from(tendersTable)
      .innerJoin(usersTable, eq(usersTable.id, tendersTable.buyerId))
      .leftJoin(categoriesTable, eq(categoriesTable.id, tendersTable.categoryId))
      .where(whereClause)
      .orderBy(desc(tendersTable.createdAt))
      .limit(limit)
      .offset(offset);

    const [totalRow] = await db.select({ total: count() }).from(tendersTable).where(whereClause);

    res.json({
      items: rows.map((r) => tenderWithDetails(r.tender, r.buyer, r.category)),
      total: totalRow?.total ?? 0,
      page: page ?? 1,
    });
  });

  router.get("/tenders/:id", async (req, res): Promise<void> => {
    const rawId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const params = GetTenderParams.safeParse({ id: parseInt(rawId, 10) });
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }

    const [row] = await db
      .select({ tender: tendersTable, buyer: usersTable, category: categoriesTable })
      .from(tendersTable)
      .innerJoin(usersTable, eq(usersTable.id, tendersTable.buyerId))
      .leftJoin(categoriesTable, eq(categoriesTable.id, tendersTable.categoryId))
      .where(eq(tendersTable.id, params.data.id));

    if (!row) {
      res.status(404).json({ error: "Tender not found" });
      return;
    }

    res.json(tenderWithDetails(row.tender, row.buyer, row.category));
  });

  router.post("/tenders", extractUser, requireAuth, async (req, res): Promise<void> => {
    const parsed = CreateTenderBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }

    const buyerId = req.userId!;
    const [tender] = await db.insert(tendersTable).values({
      ...parsed.data,
      buyerId,
      skills: parsed.data.skills ?? [],
      deadline: parsed.data.deadline ? new Date(parsed.data.deadline) : null,
    }).returning();

    const [row] = await db
      .select({ tender: tendersTable, buyer: usersTable, category: categoriesTable })
      .from(tendersTable)
      .innerJoin(usersTable, eq(usersTable.id, tendersTable.buyerId))
      .leftJoin(categoriesTable, eq(categoriesTable.id, tendersTable.categoryId))
      .where(eq(tendersTable.id, tender.id));

    res.status(201).json(tenderWithDetails(row.tender, row.buyer, row.category));
  });

  const TenderBidBody = z.object({
    price: z.number().positive(),
    deliveryDays: z.number().int().positive().max(365),
    message: z.string().max(2000).optional(),
  });

  router.post("/tenders/:id/bid", extractUser, requireAuth, async (req, res): Promise<void> => {
    const rawId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const tenderId = parseInt(rawId, 10);
    if (isNaN(tenderId) || tenderId <= 0) {
      res.status(400).json({ error: "Invalid tender id" });
      return;
    }

    const parsed = TenderBidBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }

    const [tender] = await db
      .select()
      .from(tendersTable)
      .where(eq(tendersTable.id, tenderId));

    if (!tender) {
      res.status(404).json({ error: "Tender not found" });
      return;
    }

    if (tender.status !== "open") {
      res.status(409).json({ error: "This tender is no longer accepting proposals" });
      return;
    }

    // Increment proposal count
    await db
      .update(tendersTable)
      .set({ proposalCount: sql`${tendersTable.proposalCount} + 1` })
      .where(eq(tendersTable.id, tenderId));

    res.status(201).json({
      id: Date.now(),
      tenderId,
      freelancerId: req.userId!,
      price: parsed.data.price,
      deliveryDays: parsed.data.deliveryDays,
      message: parsed.data.message ?? null,
      status: "pending",
      createdAt: new Date().toISOString(),
    });
  });

  export default router;
  