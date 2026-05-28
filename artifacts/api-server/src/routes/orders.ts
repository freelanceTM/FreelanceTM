import { Router, type IRouter } from "express";
import { eq, sql, inArray } from "drizzle-orm";
import { db, ordersTable, gigsTable, usersTable } from "@workspace/db";
import {
  ListOrdersQueryParams,
  ListOrdersResponse,
  CreateOrderBody,
  GetOrderParams,
  GetOrderResponse,
  UpdateOrderStatusParams,
  UpdateOrderStatusBody,
  UpdateOrderStatusResponse,
} from "@workspace/api-zod";

const router: IRouter = Router();

function mapOrder(order: typeof ordersTable.$inferSelect, gig?: typeof gigsTable.$inferSelect | null, buyer?: typeof usersTable.$inferSelect | null, seller?: typeof usersTable.$inferSelect | null) {
  return {
    ...order,
    gigTitle: gig?.title ?? null,
    buyerUsername: buyer?.username ?? null,
    sellerUsername: seller?.username ?? null,
    createdAt: order.createdAt.toISOString(),
    updatedAt: order.updatedAt.toISOString(),
  };
}

router.get("/orders", async (req, res): Promise<void> => {
  const userId = req.headers["x-user-id"];
  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const id = parseInt(String(userId), 10);

  const params = ListOrdersQueryParams.safeParse(req.query);
  const role = params.success ? params.data.role : undefined;

  let condition;
  if (role === "buyer") condition = eq(ordersTable.buyerId, id);
  else if (role === "seller") condition = eq(ordersTable.sellerId, id);
  else condition = sql`${ordersTable.buyerId} = ${id} OR ${ordersTable.sellerId} = ${id}`;

  const orders = await db.select().from(ordersTable).where(condition);

  const gigIds = [...new Set(orders.map(o => o.gigId))];
  const buyerIds = [...new Set(orders.map(o => o.buyerId))];
  const sellerIds = [...new Set(orders.map(o => o.sellerId))];
  const userIds = [...new Set([...buyerIds, ...sellerIds])];

  const [gigs, users] = await Promise.all([
    gigIds.length > 0 ? db.select().from(gigsTable).where(inArray(gigsTable.id, gigIds)) : Promise.resolve([]),
    userIds.length > 0 ? db.select().from(usersTable).where(inArray(usersTable.id, userIds)) : Promise.resolve([]),
  ]);

  const gigMap = Object.fromEntries(gigs.map(g => [g.id, g]));
  const userMap = Object.fromEntries(users.map(u => [u.id, u]));

  const mapped = orders.map(o => mapOrder(o, gigMap[o.gigId], userMap[o.buyerId], userMap[o.sellerId]));
  res.json(ListOrdersResponse.parse(mapped));
});

router.post("/orders", async (req, res): Promise<void> => {
  const userId = req.headers["x-user-id"];
  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const buyerId = parseInt(String(userId), 10);

  const parsed = CreateOrderBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [gig] = await db.select().from(gigsTable).where(eq(gigsTable.id, parsed.data.gigId));
  if (!gig) {
    res.status(404).json({ error: "Gig not found" });
    return;
  }

  const [order] = await db.insert(ordersTable).values({
    gigId: gig.id,
    buyerId,
    sellerId: gig.sellerId,
    status: "pending",
    totalPrice: gig.price,
    requirements: parsed.data.requirements,
    deliveryDays: gig.deliveryDays,
  }).returning();

  await db.update(gigsTable).set({ orderCount: sql`${gigsTable.orderCount} + 1` }).where(eq(gigsTable.id, gig.id));

  const [buyer] = await db.select().from(usersTable).where(eq(usersTable.id, buyerId));
  const [seller] = await db.select().from(usersTable).where(eq(usersTable.id, gig.sellerId));

  res.status(201).json(GetOrderResponse.parse(mapOrder(order, gig, buyer, seller)));
});

router.get("/orders/:orderId", async (req, res): Promise<void> => {
  const userId = req.headers["x-user-id"];
  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const reqUserId = parseInt(String(userId), 10);

  const params = GetOrderParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [order] = await db.select().from(ordersTable).where(eq(ordersTable.id, params.data.orderId));
  if (!order) {
    res.status(404).json({ error: "Order not found" });
    return;
  }

  if (order.buyerId !== reqUserId && order.sellerId !== reqUserId) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  const [gig, buyer, seller] = await Promise.all([
    db.select().from(gigsTable).where(eq(gigsTable.id, order.gigId)).then(r => r[0]),
    db.select().from(usersTable).where(eq(usersTable.id, order.buyerId)).then(r => r[0]),
    db.select().from(usersTable).where(eq(usersTable.id, order.sellerId)).then(r => r[0]),
  ]);

  res.json(GetOrderResponse.parse(mapOrder(order, gig, buyer, seller)));
});

router.patch("/orders/:orderId/status", async (req, res): Promise<void> => {
  const userId = req.headers["x-user-id"];
  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const reqUserId = parseInt(String(userId), 10);

  const params = UpdateOrderStatusParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const parsed = UpdateOrderStatusBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [existing] = await db.select().from(ordersTable).where(eq(ordersTable.id, params.data.orderId));
  if (!existing) {
    res.status(404).json({ error: "Order not found" });
    return;
  }
  if (existing.buyerId !== reqUserId && existing.sellerId !== reqUserId) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  const [order] = await db.update(ordersTable)
    .set({ status: parsed.data.status as "active" | "delivered" | "completed" | "cancelled" | "disputed", updatedAt: new Date() })
    .where(eq(ordersTable.id, params.data.orderId))
    .returning();

  if (!order) {
    res.status(404).json({ error: "Order not found" });
    return;
  }

  if (parsed.data.status === "completed") {
    await db.update(usersTable)
      .set({ completedOrders: sql`${usersTable.completedOrders} + 1` })
      .where(eq(usersTable.id, order.sellerId));
  }

  const [gig, buyer, seller] = await Promise.all([
    db.select().from(gigsTable).where(eq(gigsTable.id, order.gigId)).then(r => r[0]),
    db.select().from(usersTable).where(eq(usersTable.id, order.buyerId)).then(r => r[0]),
    db.select().from(usersTable).where(eq(usersTable.id, order.sellerId)).then(r => r[0]),
  ]);

  res.json(UpdateOrderStatusResponse.parse(mapOrder(order, gig, buyer, seller)));
});

export default router;
