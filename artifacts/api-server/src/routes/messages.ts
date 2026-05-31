import { Router, type IRouter } from "express";
import { eq, inArray } from "drizzle-orm";
import { db, messagesTable, usersTable, ordersTable } from "@workspace/db";
import { extractUser, requireAuth } from "../middleware/auth";

const router: IRouter = Router();

// ─── LIST MESSAGES FOR AN ORDER ───────────────────────────────────────────────
router.get("/messages/order/:orderId", extractUser, requireAuth, async (req, res): Promise<void> => {
  const orderId = parseInt(req.params.orderId, 10);
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
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  const messages = await db
    .select()
    .from(messagesTable)
    .where(eq(messagesTable.orderId, orderId));

  const senderIds = [...new Set(messages.map((m) => m.senderId))];
  const senders =
    senderIds.length > 0
      ? await db.select().from(usersTable).where(inArray(usersTable.id, senderIds))
      : [];

  const senderMap = Object.fromEntries(senders.map((u) => [u.id, u]));

  const mapped = messages.map((m) => ({
    id: m.id,
    orderId: m.orderId,
    senderId: m.senderId,
    receiverId: m.receiverId ?? null,
    content: m.content,
    isRead: m.isRead,
    senderUsername: senderMap[m.senderId]?.username ?? null,
    senderAvatarUrl: senderMap[m.senderId]?.avatarUrl ?? null,
    createdAt: m.createdAt.toISOString(),
  }));

  res.json(mapped);
});

// ─── SEND A MESSAGE ───────────────────────────────────────────────────────────
router.post("/messages/order/:orderId", extractUser, requireAuth, async (req, res): Promise<void> => {
  const orderId = parseInt(req.params.orderId, 10);
  if (isNaN(orderId) || orderId <= 0) {
    res.status(400).json({ error: "Invalid order id" });
    return;
  }

  const { content } = req.body as { content?: string };
  if (!content?.trim()) {
    res.status(400).json({ error: "content is required" });
    return;
  }

  const senderId = req.userId!;

  const [order] = await db.select().from(ordersTable).where(eq(ordersTable.id, orderId));
  if (!order) {
    res.status(404).json({ error: "Order not found" });
    return;
  }
  if (order.buyerId !== senderId && order.sellerId !== senderId) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  const receiverId = senderId === order.buyerId ? order.sellerId : order.buyerId;

  const [message] = await db
    .insert(messagesTable)
    .values({
      orderId,
      senderId,
      receiverId,
      content: content.trim(),
      isRead: false,
    })
    .returning();

  const [sender] = await db.select().from(usersTable).where(eq(usersTable.id, senderId));

  res.status(201).json({
    id: message.id,
    orderId: message.orderId,
    senderId: message.senderId,
    receiverId: message.receiverId ?? null,
    content: message.content,
    isRead: message.isRead,
    senderUsername: sender?.username ?? null,
    senderAvatarUrl: sender?.avatarUrl ?? null,
    createdAt: message.createdAt.toISOString(),
  });
});

// ─── MARK MESSAGES AS READ ────────────────────────────────────────────────────
router.post("/messages/order/:orderId/read", extractUser, requireAuth, async (req, res): Promise<void> => {
  const orderId = parseInt(req.params.orderId, 10);
  if (isNaN(orderId) || orderId <= 0) {
    res.status(400).json({ error: "Invalid order id" });
    return;
  }

  const userId = req.userId!;

  const [order] = await db.select().from(ordersTable).where(eq(ordersTable.id, orderId));
  if (!order) {
    res.status(404).json({ error: "Order not found" });
    return;
  }
  if (order.buyerId !== userId && order.sellerId !== userId) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  // Mark all messages sent TO this user as read
  await db
    .update(messagesTable)
    .set({ isRead: true })
    .where(eq(messagesTable.receiverId, userId));

  res.json({ ok: true });
});

// ─── LEGACY COMPAT: old path /messages/:orderId ───────────────────────────────
router.get("/messages/:orderId", extractUser, requireAuth, async (req, res): Promise<void> => {
  const orderId = parseInt(req.params.orderId, 10);
  if (isNaN(orderId) || orderId <= 0) {
    res.status(400).json({ error: "Invalid order id" });
    return;
  }

  const [order] = await db.select().from(ordersTable).where(eq(ordersTable.id, orderId));
  if (!order) { res.status(404).json({ error: "Order not found" }); return; }
  if (order.buyerId !== req.userId && order.sellerId !== req.userId) {
    res.status(403).json({ error: "Forbidden" }); return;
  }

  const messages = await db.select().from(messagesTable).where(eq(messagesTable.orderId, orderId));
  const senderIds = [...new Set(messages.map((m) => m.senderId))];
  const senders = senderIds.length > 0
    ? await db.select().from(usersTable).where(inArray(usersTable.id, senderIds))
    : [];
  const senderMap = Object.fromEntries(senders.map((u) => [u.id, u]));

  res.json(messages.map((m) => ({
    id: m.id,
    orderId: m.orderId,
    senderId: m.senderId,
    receiverId: m.receiverId ?? null,
    content: m.content,
    isRead: m.isRead,
    senderUsername: senderMap[m.senderId]?.username ?? null,
    senderAvatarUrl: senderMap[m.senderId]?.avatarUrl ?? null,
    createdAt: m.createdAt.toISOString(),
  })));
});

router.post("/messages/:orderId", extractUser, requireAuth, async (req, res): Promise<void> => {
  const orderId = parseInt(req.params.orderId, 10);
  if (isNaN(orderId) || orderId <= 0) { res.status(400).json({ error: "Invalid order id" }); return; }

  const { content } = req.body as { content?: string };
  if (!content?.trim()) { res.status(400).json({ error: "content is required" }); return; }

  const senderId = req.userId!;
  const [order] = await db.select().from(ordersTable).where(eq(ordersTable.id, orderId));
  if (!order) { res.status(404).json({ error: "Order not found" }); return; }
  if (order.buyerId !== senderId && order.sellerId !== senderId) {
    res.status(403).json({ error: "Forbidden" }); return;
  }

  const receiverId = senderId === order.buyerId ? order.sellerId : order.buyerId;
  const [message] = await db.insert(messagesTable).values({
    orderId, senderId, receiverId, content: content.trim(), isRead: false,
  }).returning();

  const [sender] = await db.select().from(usersTable).where(eq(usersTable.id, senderId));
  res.status(201).json({
    id: message.id, orderId: message.orderId, senderId: message.senderId,
    receiverId: message.receiverId ?? null, content: message.content, isRead: message.isRead,
    senderUsername: sender?.username ?? null, senderAvatarUrl: sender?.avatarUrl ?? null,
    createdAt: message.createdAt.toISOString(),
  });
});

export default router;
