import { Router, type IRouter } from "express";
import { eq, inArray } from "drizzle-orm";
import { db, messagesTable, usersTable, ordersTable } from "@workspace/db";
import {
  ListMessagesParams,
  ListMessagesResponse,
  SendMessageParams,
  SendMessageBody,
} from "@workspace/api-zod";

const router: IRouter = Router();

router.get("/messages/:orderId", async (req, res): Promise<void> => {
  const userId = req.headers["x-user-id"];
  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const reqUserId = parseInt(String(userId), 10);

  const params = ListMessagesParams.safeParse(req.params);
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

  const messages = await db.select().from(messagesTable).where(eq(messagesTable.orderId, params.data.orderId));

  const senderIds = [...new Set(messages.map(m => m.senderId))];
  const senders = senderIds.length > 0
    ? await db.select().from(usersTable).where(inArray(usersTable.id, senderIds))
    : [];

  const senderMap = Object.fromEntries(senders.map(u => [u.id, u]));

  const mapped = messages.map(m => ({
    ...m,
    senderUsername: senderMap[m.senderId]?.username ?? null,
    senderAvatarUrl: senderMap[m.senderId]?.avatarUrl ?? null,
    createdAt: m.createdAt.toISOString(),
  }));

  res.json(ListMessagesResponse.parse(mapped));
});

router.post("/messages/:orderId", async (req, res): Promise<void> => {
  const userId = req.headers["x-user-id"];
  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const senderId = parseInt(String(userId), 10);

  const params = SendMessageParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const parsed = SendMessageBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [message] = await db.insert(messagesTable).values({
    orderId: params.data.orderId,
    senderId,
    content: parsed.data.content,
  }).returning();

  const [sender] = await db.select().from(usersTable).where(eq(usersTable.id, senderId));

  const mapped = {
    ...message,
    senderUsername: sender?.username ?? null,
    senderAvatarUrl: sender?.avatarUrl ?? null,
    createdAt: message.createdAt.toISOString(),
  };

  res.status(201).json(mapped);
});

export default router;
