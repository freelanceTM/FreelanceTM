import { Router, type IRouter } from "express";
import { db, usersTable, walletTransactionsTable } from "@workspace/db";
import { emailVerificationCodesTable } from "@workspace/db";
import { eq, desc, gt } from "drizzle-orm";
import { UpdateMeBody as UpdateProfileBody } from "@workspace/api-zod";
import { extractUser, requireAuth } from "../middleware/auth";
import { createLinkToken, BOT_NAME } from "../lib/telegram";
import { sendOtpEmail } from "../lib/email";

const router: IRouter = Router();

function makeToken(userId: number): string {
  return Buffer.from(`${userId}:${Date.now()}`).toString("base64");
}

function generateOtp(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

function userResponse(user: typeof usersTable.$inferSelect) {
  return {
    id: user.id,
    username: user.username,
    email: user.email,
    role: user.role,
    onboardingCompleted: user.onboardingCompleted,
    emailVerified: user.emailVerified,
    displayName: user.displayName,
    bio: user.bio,
    avatarUrl: user.avatarUrl,
    location: user.location,
    skills: user.skills,
    rating: user.rating,
    reviewCount: user.reviewCount,
    completedOrders: user.completedOrders,
    memberSince: user.createdAt,
    telegramLinked: !!user.telegramChatId,
  };
}

function mapRole(role?: string): "buyer" | "freelancer" | "both" | "admin" {
  if (role === "client") return "buyer";
  if (role === "freelancer") return "freelancer";
  if (role === "both") return "both";
  return "buyer";
}

// ─── REGISTER (passwordless) ─────────────────────────────────────────────────
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
      emailVerified: false,
    })
    .returning();

  const code = generateOtp();
  const expiresAt = new Date(Date.now() + 5 * 60 * 1000);

  await db.delete(emailVerificationCodesTable).where(
    eq(emailVerificationCodesTable.email, email)
  );
  await db.insert(emailVerificationCodesTable).values({ email, code, expiresAt });

  await sendOtpEmail(email, code);

  res.status(201).json({ requireVerification: true, email: user.email });
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
      skills: parsed.data.skills ?? [],
      avatarUrl: parsed.data.avatarUrl,
    })
    .where(eq(usersTable.id, req.userId!))
    .returning();

  res.json(userResponse(user));
});

// ─── COMPLETE ONBOARDING ──────────────────────────────────────────────────────
router.post("/users/me/onboarding", extractUser, requireAuth, async (req, res): Promise<void> => {
  const { role, displayName, bio, skills, telegramUsername, portfolioUrls, languages } = req.body as {
    role?: string;
    displayName?: string;
    bio?: string;
    skills?: string[];
    telegramUsername?: string;
    portfolioUrls?: string[];
    languages?: string[];
  };

  const [user] = await db
    .update(usersTable)
    .set({
      role: mapRole(role),
      displayName: displayName ?? null,
      bio: bio ?? null,
      skills: skills ?? [],
      onboardingCompleted: true,
    })
    .where(eq(usersTable.id, req.userId!))
    .returning();

  res.json(userResponse(user));
});

// ─── GET USER PROFILE ────────────────────────────────────────────────────────
router.get("/users/:id", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) {
    res.status(400).json({ error: "Invalid user ID" });
    return;
  }

  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, id));
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

// ─── TELEGRAM LINK TOKEN ──────────────────────────────────────────────────────
router.get("/users/me/telegram-link", extractUser, requireAuth, async (req, res): Promise<void> => {
  const userId = req.userId!;

  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId));
  if (user?.telegramChatId) {
    res.json({ linked: true, url: null });
    return;
  }

  const token = createLinkToken(userId);
  const url = `https://t.me/${BOT_NAME}?start=${token}`;
  res.json({ linked: false, url });
});

// ─── DISCONNECT TELEGRAM ──────────────────────────────────────────────────────
router.delete("/users/me/telegram", extractUser, requireAuth, async (req, res): Promise<void> => {
  await db
    .update(usersTable)
    .set({ telegramChatId: null })
    .where(eq(usersTable.id, req.userId!));
  res.json({ ok: true });
});

export default router;
