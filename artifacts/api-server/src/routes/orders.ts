import { Router, type IRouter } from "express";
import { db, ordersTable, usersTable, gigsTable, tendersTable, tenderBidsTable } from "@workspace/db";
import { eq, and, or } from "drizzle-orm";
import { extractUser, requireAuth } from "../middleware/auth";

const router: IRouter = Router();

function orderWithDetails(
  order: typeof ordersTable.$inferSelect,
  buyer: typeof usersTable.$inferSelect,
  seller: typeof usersTable.$inferSelect,
  gig: typeof gigsTable.$inferSelect | null,
  tender: typeof tendersTable.$inferSelect | null,
) {
  return {
    id: order.id,
    gigId: order.gigId ?? null,
    tenderId: order.tenderId ?? null,
    tenderBidId: order.tenderBidId ?? null,
    gigTitle: gig?.title ?? tender?.title ?? "Contract",
    gigImageUrl: gig?.imageUrl ?? null,
    isTenderOrder: order.gigId === null,
    buyerId: order.buyerId,
    buyerName: buyer.displayName ?? buyer.username,
    sellerId: order.sellerId,
    sellerName: seller.displayName ?? seller.username,
    price: order.price,
    status: order.status,
    isDisputed: order.isDisputed,
    deliveryDays: order.deliveryDays,
    dueDate: order.dueDate ?? null,
    deliveryNote: order.deliveryNote ?? null,
    createdAt: order.createdAt,
  };
}

async function enrichOrder(order: typeof ordersTable.$inferSelect) {
  const [buyer] = await db.select().from(usersTable).where(eq(usersTable.id, order.buyerId));
  const [seller] = await db.select().from(usersTable).where(eq(usersTable.id, order.sellerId));
  const gig = order.gigId
    ? (await db.select().from(gigsTable).where(eq(gigsTable.id, order.gigId)))[0] ?? null
    : null;
  const tender = order.tenderId
    ? (await db.select().from(tendersTable).where(eq(tendersTable.id, order.tenderId)))[0] ?? null
    : null;
  return orderWithDetails(order, buyer, seller, gig, tender);
}

// ─── LIST ─────────────────────────────────────────────────────────────────────

router.get("/orders", extractUser, requireAuth, async (req, res): Promise<void> => {
  const status = req.query.status ? String(req.query.status) : undefined;
  const userId = req.userId!;

  const conditions = [
    or(eq(ordersTable.buyerId, userId), eq(ordersTable.sellerId, userId))!,
  ];
  if (status && ["active","delivered","completed","revision","cancelled"].includes(status)) {
    conditions.push(eq(ordersTable.status, status as "active" | "delivered" | "completed" | "revision" | "cancelled"));
  }

  const orders = await db
    .select()
    .from(ordersTable)
    .where(and(...conditions))
    .orderBy(ordersTable.createdAt);

  const result = await Promise.all(orders.map(enrichOrder));
  res.json({ items: result });
});

// ─── GET SINGLE ───────────────────────────────────────────────────────────────

router.get("/orders/:id", extractUser, requireAuth, async (req, res): Promise<void> => {
  const orderId = parseInt(req.params.id, 10);
  if (isNaN(orderId) || orderId <= 0) {
    res.status(400).json({ error: "Invalid order id" });
    return;
  }

  const [order] = await db.select().from(ordersTable).where(eq(ordersTable.id, orderId));
  if (!order) {
    res.status(404).json({ error: "Order not found" });
    return;
  }
  if (order.buyerId !== req.userId && order.sellerId !== req.userId) {
    res.status(403).json({ error: "Access denied" });
    return;
  }

  res.json(await enrichOrder(order));
});

// ─── UPDATE STATUS ────────────────────────────────────────────────────────────

router.patch("/orders/:id/status", extractUser, requireAuth, async (req, res): Promise<void> => {
  const orderId = parseInt(req.params.id, 10);
  if (isNaN(orderId) || orderId <= 0) {
    res.status(400).json({ error: "Invalid order id" });
    return;
  }

  const { status, note } = req.body as { status?: string; note?: string };
  const validStatuses = ["active", "delivered", "completed", "revision", "cancelled"] as const;
  if (!status || !validStatuses.includes(status as typeof validStatuses[number])) {
    res.status(400).json({ error: "Invalid status" });
    return;
  }

  const userId = req.userId!;
  const [order] = await db.select().from(ordersTable).where(eq(ordersTable.id, orderId));
  if (!order) {
    res.status(404).json({ error: "Order not found" });
    return;
  }
  if (order.buyerId !== userId && order.sellerId !== userId) {
    res.status(403).json({ error: "Access denied" });
    return;
  }

  const isBuyer = order.buyerId === userId;
  const isSeller = order.sellerId === userId;

  if (status === "delivered" && !isSeller) {
    res.status(403).json({ error: "Only the seller can mark an order as delivered" });
    return;
  }
  if (status === "completed" && !isBuyer) {
    res.status(403).json({ error: "Only the buyer can complete an order" });
    return;
  }
  if (status === "revision" && !isBuyer) {
    res.status(403).json({ error: "Only the buyer can request a revision" });
    return;
  }

  const setData: Partial<typeof ordersTable.$inferInsert> = {
    status: status as typeof validStatuses[number],
  };
  if (status === "delivered" || status === "revision") {
    setData.deliveryNote = note ?? null;
  }

  const [updated] = await db
    .update(ordersTable)
    .set(setData)
    .where(eq(ordersTable.id, orderId))
    .returning();

  if (!updated) {
    res.status(404).json({ error: "Order not found" });
    return;
  }

  res.json(await enrichOrder(updated));
});

// ─── OPEN DISPUTE ─────────────────────────────────────────────────────────────
// Either party (buyer or seller) can flag an active/delivered order as disputed.
// Does NOT change order.status — admin resolves via PATCH /api/admin/orders/:id/resolve.

router.patch("/orders/:id/dispute", extractUser, requireAuth, async (req, res): Promise<void> => {
  const orderId = parseInt(req.params.id, 10);
  if (isNaN(orderId) || orderId <= 0) {
    res.status(400).json({ error: "Invalid order id" });
    return;
  }

  const userId = req.userId!;
  const [order] = await db.select().from(ordersTable).where(eq(ordersTable.id, orderId));
  if (!order) { res.status(404).json({ error: "Order not found" }); return; }
  if (order.buyerId !== userId && order.sellerId !== userId) {
    res.status(403).json({ error: "Access denied" }); return;
  }
  if (!["active", "delivered", "revision"].includes(order.status)) {
    res.status(400).json({ error: "Can only dispute active or delivered orders" }); return;
  }
  if (order.isDisputed) {
    res.status(400).json({ error: "Order is already under dispute" }); return;
  }

  const [updated] = await db
    .update(ordersTable)
    .set({ isDisputed: true })
    .where(eq(ordersTable.id, orderId))
    .returning();

  res.json(await enrichOrder(updated));
});

// ─── CREATE ORDER ─────────────────────────────────────────────────────────────

router.post('/orders', extractUser, requireAuth, async (req, res): Promise<void> => {
  const { gigId, requirements } = req.body as { gigId?: number; requirements?: string };

  if (!gigId || isNaN(Number(gigId))) {
    res.status(400).json({ error: 'gigId is required' });
    return;
  }

  const buyerId = req.userId!;

  const [gig] = await db.select().from(gigsTable).where(eq(gigsTable.id, Number(gigId)));
  if (!gig) {
    res.status(404).json({ error: 'Gig not found' });
    return;
  }

  if (buyerId === gig.sellerId) {
    res.status(400).json({ error: 'Cannot order your own gig' });
    return;
  }

  const dueDate = new Date();
  dueDate.setDate(dueDate.getDate() + gig.deliveryDays);

  const [order] = await db
    .insert(ordersTable)
    .values({
      gigId: gig.id,
      buyerId,
      sellerId: gig.sellerId,
      price: gig.price,
      status: 'active',
      isDisputed: false,
      deliveryDays: gig.deliveryDays,
      dueDate,
      deliveryNote: requirements ?? null,
    })
    .returning();

  res.status(201).json(await enrichOrder(order));
});

export default router;
