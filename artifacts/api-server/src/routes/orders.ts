import { Router, type IRouter } from "express";
import { db, ordersTable, usersTable, gigsTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { ListOrdersQueryParams, GetOrderParams, UpdateOrderStatusParams, UpdateOrderStatusBody } from "@workspace/api-zod";

const router: IRouter = Router();

function orderWithDetails(
  order: typeof ordersTable.$inferSelect,
  buyer: typeof usersTable.$inferSelect,
  seller: typeof usersTable.$inferSelect,
  gig: typeof gigsTable.$inferSelect,
) {
  return {
    id: order.id,
    gigId: order.gigId,
    gigTitle: gig.title,
    gigImageUrl: gig.imageUrl ?? null,
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

router.get("/orders", async (req, res): Promise<void> => {
  const params = ListOrdersQueryParams.safeParse(req.query);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const buyerAlias = usersTable;
  const conditions = [];
  if (params.data.status) {
    conditions.push(eq(ordersTable.status, params.data.status as "active" | "delivered" | "completed" | "revision" | "cancelled"));
  }

  const rows = await db
    .select({
      order: ordersTable,
      gig: gigsTable,
    })
    .from(ordersTable)
    .innerJoin(gigsTable, eq(gigsTable.id, ordersTable.gigId))
    .where(conditions.length > 0 ? and(...conditions) : undefined);

  const result = await Promise.all(
    rows.map(async (r) => {
      const [buyer] = await db.select().from(usersTable).where(eq(usersTable.id, r.order.buyerId));
      const [seller] = await db.select().from(usersTable).where(eq(usersTable.id, r.order.sellerId));
      return orderWithDetails(r.order, buyer, seller, r.gig);
    })
  );

  res.json(result);
});

router.get("/orders/:id", async (req, res): Promise<void> => {
  const rawId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const params = GetOrderParams.safeParse({ id: parseInt(rawId, 10) });
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [row] = await db
    .select({ order: ordersTable, gig: gigsTable })
    .from(ordersTable)
    .innerJoin(gigsTable, eq(gigsTable.id, ordersTable.gigId))
    .where(eq(ordersTable.id, params.data.id));

  if (!row) {
    res.status(404).json({ error: "Order not found" });
    return;
  }

  const [buyer] = await db.select().from(usersTable).where(eq(usersTable.id, row.order.buyerId));
  const [seller] = await db.select().from(usersTable).where(eq(usersTable.id, row.order.sellerId));

  res.json(orderWithDetails(row.order, buyer, seller, row.gig));
});

router.patch("/orders/:id/status", async (req, res): Promise<void> => {
  const rawId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const pathParams = UpdateOrderStatusParams.safeParse({ id: parseInt(rawId, 10) });
  if (!pathParams.success) {
    res.status(400).json({ error: pathParams.error.message });
    return;
  }

  const parsed = UpdateOrderStatusBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [updated] = await db
    .update(ordersTable)
    .set({
      status: parsed.data.status as "active" | "delivered" | "completed" | "revision" | "cancelled",
      deliveryNote: parsed.data.note ?? null,
    })
    .where(eq(ordersTable.id, pathParams.data.id))
    .returning();

  if (!updated) {
    res.status(404).json({ error: "Order not found" });
    return;
  }

  const [gig] = await db.select().from(gigsTable).where(eq(gigsTable.id, updated.gigId));
  const [buyer] = await db.select().from(usersTable).where(eq(usersTable.id, updated.buyerId));
  const [seller] = await db.select().from(usersTable).where(eq(usersTable.id, updated.sellerId));

  res.json(orderWithDetails(updated, buyer, seller, gig));
});

export default router;
