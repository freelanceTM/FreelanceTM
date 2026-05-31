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
    // For tender orders, gigTitle surfaces the tender title so the Orders UI
    // works without any frontend changes.
    gigTitle: gig?.title ?? tender?.title ?? "Contract",
    gigImageUrl: gig?.imageUrl ?? null,
    isTenderOrder: order.gigId === null,
    buyerId: order.buyerId,
    buyerName: buyer.displayName ?? buyer.username,
    sellerId: order.sellerId,
    sellerName: seller.displayName ?? seller.username,
    price: order.price,
    status: order.status,
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

  const [updated] = await db
    .update(ordersTable)
    .set({
      status: status as typeof validStatuses[number],
      deliveryNote: note ?? null,
    })
    .where(eq(ordersTable.id, orderId))
    .returning();

  if (!updated) {
    res.status(404).json({ error: "Order not found" });
    return;
  }

  res.json(await enrichOrder(updated));
});

export default router;
