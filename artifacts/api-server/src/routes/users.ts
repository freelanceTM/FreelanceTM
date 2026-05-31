import { Router, type IRouter } from "express";
import { db, usersTable, walletTransactionsTable } from "@workspace/db";
import { eq, desc, sum } from "drizzle-orm";
import { UpdateProfileBody } from "@workspace/api-zod";

const router: IRouter = Router();

const DEMO_USER_ID = 1;

router.get("/users/me", async (_req, res): Promise<void> => {
  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, DEMO_USER_ID));

  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  res.json({
    id: user.id,
    username: user.username,
    email: user.email,
    role: user.role,
    displayName: user.displayName,
    bio: user.bio,
    avatarUrl: user.avatarUrl,
    location: user.location,
    skills: user.skills,
    rating: user.rating,
    reviewCount: user.reviewCount,
    completedOrders: user.completedOrders,
    memberSince: user.createdAt,
  });
});

router.patch("/users/me", async (req, res): Promise<void> => {
  const parsed = UpdateProfileBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [user] = await db
    .update(usersTable)
    .set({
      displayName: parsed.data.displayName,
      bio: parsed.data.bio,
      location: parsed.data.location,
      skills: parsed.data.skills,
      avatarUrl: parsed.data.avatarUrl,
    })
    .where(eq(usersTable.id, DEMO_USER_ID))
    .returning();

  res.json({
    id: user.id,
    username: user.username,
    email: user.email,
    role: user.role,
    displayName: user.displayName,
    bio: user.bio,
    avatarUrl: user.avatarUrl,
    location: user.location,
    skills: user.skills,
    rating: user.rating,
    reviewCount: user.reviewCount,
    completedOrders: user.completedOrders,
    memberSince: user.createdAt,
  });
});

router.get("/users/me/wallet", async (_req, res): Promise<void> => {
  const transactions = await db
    .select()
    .from(walletTransactionsTable)
    .where(eq(walletTransactionsTable.userId, DEMO_USER_ID))
    .orderBy(desc(walletTransactionsTable.createdAt))
    .limit(20);

  const balance = transactions.reduce((acc, tx) => {
    return tx.type === "credit" ? acc + tx.amount : acc - tx.amount;
  }, 0);

  res.json({
    balance: Math.round(balance * 100) / 100,
    currency: "USD",
    transactions: transactions.map((tx) => ({
      id: tx.id,
      amount: tx.amount,
      type: tx.type,
      description: tx.description,
      createdAt: tx.createdAt,
    })),
  });
});

export default router;
