import { Router, type IRouter } from "express";
import { db, usersTable, walletTransactionsTable } from "@workspace/db";
import { eq, desc } from "drizzle-orm";
import { UpdateProfileBody } from "@workspace/api-zod";
import { extractUser, requireAuth } from "../middleware/auth";

const router: IRouter = Router();

function makeToken(userId: number): string {
  return Buffer.from(`${userId}:${Date.now()}`).toString("base64");
}

function userResponse(user: typeof usersTable.$inferSelect) {
  return {
    id: user.id,
    username: user.username,
    email: user.email,
    role: user.role,
    onboardingCompleted: user.onboardingCompleted,
    displayName: user.displayName,
    bio: user.bio,
    avatarUrl: user.avatarUrl,
    location: user.location,
    skills: user.skills,
    rating: user.rating,
    reviewCount: user.reviewCount,
    completedOrders: user.completedOrders,
    memberSince: user.createdAt,
  };
}

function mapRole(role?: string): "buyer" | "freelancer" | "both" | "admin" {
  if (role === "client") return "buyer";
  if (role === "freelancer") return "freelancer";
  if (role === "both") return "both";
  return "buyer";
}

// ─── REGISTER (passwordless) ─────────────────────────────────────────────────
// Called by useRegisterUser() hook → POST /api/users/register
router.post("/users/register", async (req, res): Promise<void> => {
  const { username, email, displayName, role } = req.body as {
    username?: string;
    email?: string;
    displayName?: string;
    role?: string;
  };

  if (!username || !email) {
    res.status(400).json({ error: "username and email are required" });
    return;
  }

  // If user already exists by email, return them (idempotent login)
  const [existing] = await db.select().from(usersTable).where(eq(usersTable.email, email));
  if (existing) {
    const token = makeToken(existing.id);
    res.json({ ...userResponse(existing), token });
    return;
  }

  const [user] = await db
    .insert(usersTable)
    .values({
      username,
      email,
      passwordHash: "no_password",
      displayName: displayName ?? null,
      role: mapRole(role),
      skills: [],
      onboardingCompleted: false,
    })
    .returning();

  const token = makeToken(user.id);
  res.status(201).json({ ...userResponse(user), token });
});

// ─── GET ME ───────────────────────────────────────────────────────────────────
router.get("/users/me", extractUser, requireAuth, async (req, res): Promise<void> => {
  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, req.userId!));
  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }
  res.json(userResponse(user));
});

// ─── UPDATE ME ────────────────────────────────────────────────────────────────
router.patch("/users/me", extractUser, requireAuth, async (req, res): Promise<void> => {
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
    .where(eq(usersTable.id, req.userId!))
    .returning();

  res.json(userResponse(user));
});

// ─── COMPLETE ONBOARDING ──────────────────────────────────────────────────────
// Called by useCompleteOnboarding() hook → POST /api/users/me/onboarding
router.post("/users/me/onboarding", extractUser, requireAuth, async (req, res): Promise<void> => {
  const { role, displayName, bio, skills } = req.body as {
    role?: string;
    displayName?: string;
    bio?: string;
    skills?: string[];
    telegramUsername?: string;
    portfolioUrls?: string[];
    languages?: string[];
  };

  const updates: Partial<typeof usersTable.$inferInsert> = {
    onboardingCompleted: true,
    role: mapRole(role),
  };
  if (displayName) updates.displayName = displayName;
  if (bio) updates.bio = bio;
  if (Array.isArray(skills)) updates.skills = skills;

  const [user] = await db
    .update(usersTable)
    .set(updates)
    .where(eq(usersTable.id, req.userId!))
    .returning();

  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  res.json(userResponse(user));
});

// ─── WALLET ───────────────────────────────────────────────────────────────────
router.get("/users/me/wallet", extractUser, requireAuth, async (req, res): Promise<void> => {
  const transactions = await db
    .select()
    .from(walletTransactionsTable)
    .where(eq(walletTransactionsTable.userId, req.userId!))
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

// ─── PUBLIC PROFILE ───────────────────────────────────────────────────────────
router.get("/users/:id", async (req, res): Promise<void> => {
  const userId = parseInt(req.params.id, 10);
  if (isNaN(userId) || userId <= 0) {
    res.status(400).json({ error: "Invalid user id" });
    return;
  }

  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId));
  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  res.json(userResponse(user));
});

export default router;
