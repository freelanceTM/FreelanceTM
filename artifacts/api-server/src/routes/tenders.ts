import { Router, type IRouter } from "express";
import { db, tendersTable, tenderBidsTable, ordersTable, usersTable, categoriesTable } from "@workspace/db";
import { eq, and, like, desc, count, sql } from "drizzle-orm";
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

function bidWithFreelancer(
  bid: typeof tenderBidsTable.$inferSelect,
  freelancer: typeof usersTable.$inferSelect,
) {
  return {
    id: bid.id,
    tenderId: bid.tenderId,
    freelancerId: bid.freelancerId,
    freelancerName: freelancer.displayName ?? freelancer.username,
    freelancerAvatarUrl: freelancer.avatarUrl ?? null,
    freelancerLevel: (freelancer as Record<string, unknown>).level as string | null ?? null,
    freelancerRating: (freelancer as Record<string, unknown>).rating as number | null ?? null,
    price: bid.price,
    deliveryDays: bid.deliveryDays,
    message: bid.message ?? null,
    isSelected: bid.isSelected,
    createdAt: bid.createdAt,
  };
}

// ─── LIST ──────────────────────────────────────────────────────────────────

router.get("/tenders", async (req, res): Promise<void> => {
  const page = parseInt(String(req.query.page ?? "1"), 10) || 1;
  const search = req.query.search ? String(req.query.search) : undefined;
  const categoryId = req.query.categoryId ? parseInt(String(req.query.categoryId), 10) : undefined;
  const status = req.query.status ? String(req.query.status) : undefined;
  const limit = 20;
  const offset = (page - 1) * limit;

  const conditions: ReturnType<typeof eq>[] = [];
  if (categoryId && !isNaN(categoryId)) conditions.push(eq(tendersTable.categoryId, categoryId));
  if (search) conditions.push(like(tendersTable.title, `%${search}%`));
  if (status && ["open","in_progress","closed"].includes(status)) {
    conditions.push(eq(tendersTable.status, status as "open" | "in_progress" | "closed"));
  }

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
    page,
  });
});

// ─── MY TENDERS (buyer) ────────────────────────────────────────────────────

router.get("/tenders/my-tenders", extractUser, requireAuth, async (req, res): Promise<void> => {
  const buyerId = req.userId!;
  const rows = await db
    .select({ tender: tendersTable, buyer: usersTable, category: categoriesTable })
    .from(tendersTable)
    .innerJoin(usersTable, eq(usersTable.id, tendersTable.buyerId))
    .leftJoin(categoriesTable, eq(categoriesTable.id, tendersTable.categoryId))
    .where(eq(tendersTable.buyerId, buyerId))
    .orderBy(desc(tendersTable.createdAt));

  res.json({ items: rows.map((r) => tenderWithDetails(r.tender, r.buyer, r.category)) });
});

// ─── MY BIDS (freelancer) ──────────────────────────────────────────────────

router.get("/tenders/my-bids", extractUser, requireAuth, async (req, res): Promise<void> => {
  const freelancerId = req.userId!;

  const rows = await db
    .select({ bid: tenderBidsTable, tender: tendersTable, buyer: usersTable, category: categoriesTable })
    .from(tenderBidsTable)
    .innerJoin(tendersTable, eq(tendersTable.id, tenderBidsTable.tenderId))
    .innerJoin(usersTable, eq(usersTable.id, tendersTable.buyerId))
    .leftJoin(categoriesTable, eq(categoriesTable.id, tendersTable.categoryId))
    .where(eq(tenderBidsTable.freelancerId, freelancerId))
    .orderBy(desc(tenderBidsTable.createdAt));

  res.json({
    items: rows.map((r) => ({
      id: r.bid.id,
      tenderId: r.bid.tenderId,
      tenderTitle: r.tender.title,
      tenderBudget: r.tender.budget,
      tenderStatus: r.tender.status,
      categoryName: r.category?.name ?? null,
      buyerName: r.buyer.displayName ?? r.buyer.username,
      price: r.bid.price,
      deliveryDays: r.bid.deliveryDays,
      message: r.bid.message ?? null,
      isSelected: r.bid.isSelected,
      createdAt: r.bid.createdAt,
    })),
  });
});

// ─── GET SINGLE TENDER ────────────────────────────────────────────────────

router.get("/tenders/:id", async (req, res): Promise<void> => {
  const tenderId = parseInt(req.params.id, 10);
  if (isNaN(tenderId) || tenderId <= 0) {
    res.status(400).json({ error: "Invalid tender id" });
    return;
  }

  const [row] = await db
    .select({ tender: tendersTable, buyer: usersTable, category: categoriesTable })
    .from(tendersTable)
    .innerJoin(usersTable, eq(usersTable.id, tendersTable.buyerId))
    .leftJoin(categoriesTable, eq(categoriesTable.id, tendersTable.categoryId))
    .where(eq(tendersTable.id, tenderId));

  if (!row) {
    res.status(404).json({ error: "Tender not found" });
    return;
  }

  res.json(tenderWithDetails(row.tender, row.buyer, row.category));
});

// ─── CREATE TENDER ────────────────────────────────────────────────────────

const CreateTenderBody = z.object({
  title: z.string().min(5).max(200),
  description: z.string().min(20),
  budget: z.number().positive(),
  categoryId: z.number().int().positive(),
  deadline: z.string().optional(),
  skills: z.array(z.string()).optional(),
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

// ─── SUBMIT BID ───────────────────────────────────────────────────────────

const TenderBidBody = z.object({
  price: z.number().positive(),
  deliveryDays: z.number().int().positive().max(365),
  message: z.string().max(2000).optional(),
});

router.post("/tenders/:id/bid", extractUser, requireAuth, async (req, res): Promise<void> => {
  const tenderId = parseInt(req.params.id, 10);
  if (isNaN(tenderId) || tenderId <= 0) {
    res.status(400).json({ error: "Invalid tender id" });
    return;
  }

  const parsed = TenderBidBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [tender] = await db.select().from(tendersTable).where(eq(tendersTable.id, tenderId));
  if (!tender) {
    res.status(404).json({ error: "Tender not found" });
    return;
  }
  if (tender.status !== "open") {
    res.status(409).json({ error: "This tender is no longer accepting proposals" });
    return;
  }
  if (tender.buyerId === req.userId) {
    res.status(403).json({ error: "Cannot bid on your own tender" });
    return;
  }

  const [existing] = await db
    .select()
    .from(tenderBidsTable)
    .where(and(eq(tenderBidsTable.tenderId, tenderId), eq(tenderBidsTable.freelancerId, req.userId!)));

  let bid: typeof tenderBidsTable.$inferSelect;
  if (existing) {
    const [updated] = await db
      .update(tenderBidsTable)
      .set({ price: parsed.data.price, deliveryDays: parsed.data.deliveryDays, message: parsed.data.message ?? null })
      .where(eq(tenderBidsTable.id, existing.id))
      .returning();
    bid = updated;
  } else {
    const [inserted] = await db
      .insert(tenderBidsTable)
      .values({
        tenderId,
        freelancerId: req.userId!,
        price: parsed.data.price,
        deliveryDays: parsed.data.deliveryDays,
        message: parsed.data.message ?? null,
      })
      .returning();
    bid = inserted;
    await db
      .update(tendersTable)
      .set({ proposalCount: sql`${tendersTable.proposalCount} + 1` })
      .where(eq(tendersTable.id, tenderId));
  }

  res.status(201).json({
    id: bid.id,
    tenderId: bid.tenderId,
    freelancerId: bid.freelancerId,
    price: bid.price,
    deliveryDays: bid.deliveryDays,
    message: bid.message ?? null,
    isSelected: bid.isSelected,
    createdAt: bid.createdAt,
  });
});

// ─── GET BIDS FOR A TENDER (buyer only) ───────────────────────────────────

router.get("/tenders/:id/bids", extractUser, requireAuth, async (req, res): Promise<void> => {
  const tenderId = parseInt(req.params.id, 10);
  if (isNaN(tenderId) || tenderId <= 0) {
    res.status(400).json({ error: "Invalid tender id" });
    return;
  }

  const [tender] = await db.select().from(tendersTable).where(eq(tendersTable.id, tenderId));
  if (!tender) {
    res.status(404).json({ error: "Tender not found" });
    return;
  }
  if (tender.buyerId !== req.userId) {
    res.status(403).json({ error: "Only the tender author can view bids" });
    return;
  }

  const rows = await db
    .select({ bid: tenderBidsTable, freelancer: usersTable })
    .from(tenderBidsTable)
    .innerJoin(usersTable, eq(usersTable.id, tenderBidsTable.freelancerId))
    .where(eq(tenderBidsTable.tenderId, tenderId))
    .orderBy(tenderBidsTable.createdAt);

  res.json({ items: rows.map((r) => bidWithFreelancer(r.bid, r.freelancer)) });
});

// ─── SELECT / ACCEPT BID → creates real Order ─────────────────────────────

router.patch("/tenders/:id/select-bid/:bidId", extractUser, requireAuth, async (req, res): Promise<void> => {
  const tenderId = parseInt(req.params.id, 10);
  const bidId = parseInt(req.params.bidId, 10);
  if (isNaN(tenderId) || tenderId <= 0 || isNaN(bidId) || bidId <= 0) {
    res.status(400).json({ error: "Invalid ids" });
    return;
  }

  const [tender] = await db.select().from(tendersTable).where(eq(tendersTable.id, tenderId));
  if (!tender) {
    res.status(404).json({ error: "Tender not found" });
    return;
  }
  if (tender.buyerId !== req.userId) {
    res.status(403).json({ error: "Only the tender author can accept bids" });
    return;
  }
  if (tender.status !== "open") {
    res.status(409).json({ error: `Cannot accept a bid on a tender with status '${tender.status}'` });
    return;
  }

  const [bid] = await db.select().from(tenderBidsTable).where(
    and(eq(tenderBidsTable.id, bidId), eq(tenderBidsTable.tenderId, tenderId))
  );
  if (!bid) {
    res.status(404).json({ error: "Bid not found" });
    return;
  }

  // Clear any previously selected bids
  await db
    .update(tenderBidsTable)
    .set({ isSelected: false })
    .where(eq(tenderBidsTable.tenderId, tenderId));

  // Mark this bid as selected
  const [selectedBid] = await db
    .update(tenderBidsTable)
    .set({ isSelected: true })
    .where(eq(tenderBidsTable.id, bidId))
    .returning();

  // Advance tender to in_progress
  const [updatedTender] = await db
    .update(tendersTable)
    .set({ status: "in_progress" })
    .where(eq(tendersTable.id, tenderId))
    .returning();

  // ── CREATE REAL ORDER RECORD ──────────────────────────────────────────────
  // gigId is null → this is a tender-based order, not a gig order.
  // deliveryDays drives the dueDate so the order state machine works
  // (delivery, revision, completion) exactly as it does for gig orders.
  const dueDate = new Date(Date.now() + bid.deliveryDays * 24 * 60 * 60 * 1000);
  const [order] = await db
    .insert(ordersTable)
    .values({
      gigId: null,
      tenderId,
      tenderBidId: bid.id,
      buyerId: tender.buyerId,
      sellerId: bid.freelancerId,
      price: bid.price,
      deliveryDays: bid.deliveryDays,
      dueDate,
    })
    .returning();

  // Fetch freelancer info for response
  const [freelancer] = await db.select().from(usersTable).where(eq(usersTable.id, bid.freelancerId));

  res.json({
    tender: {
      id: updatedTender.id,
      title: updatedTender.title,
      status: updatedTender.status,
    },
    bid: bidWithFreelancer(selectedBid, freelancer),
    order: {
      id: order.id,
      status: order.status,
      price: order.price,
      deliveryDays: order.deliveryDays,
      dueDate: order.dueDate,
      createdAt: order.createdAt,
    },
  });
});

export default router;
