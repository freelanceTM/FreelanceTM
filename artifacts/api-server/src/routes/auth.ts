import { Router, type IRouter } from "express";
import { eq, and, gt } from "drizzle-orm";
import { db, usersTable } from "@workspace/db";
import { emailVerificationCodesTable } from "@workspace/db";
import { RegisterUserBody } from "@workspace/api-zod";
import { z } from "zod";
import crypto from "crypto";
import { sendOtpEmail } from "../lib/email";

const LoginBody = z.object({ email: z.string(), password: z.string() });
const VerifyOtpBody = z.object({ email: z.string().email(), code: z.string().length(6) });
const ResendOtpBody = z.object({ email: z.string().email() });

const router: IRouter = Router();

function hashPassword(password: string): string {
  return crypto.createHash("sha256").update(password + "ftm_salt").digest("hex");
}

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
  };
}

function mapRole(role?: string): "buyer" | "freelancer" | "both" | "admin" {
  if (role === "client") return "buyer";
  if (role === "freelancer") return "freelancer";
  if (role === "both") return "both";
  return "buyer";
}

router.post("/auth/register", async (req, res): Promise<void> => {
  const parsed = RegisterUserBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { username, email, password, role } = parsed.data;

  const existing = await db.select().from(usersTable).where(eq(usersTable.email, email));
  if (existing.length > 0) {
    res.status(400).json({ error: "Email already in use" });
    return;
  }

  const [user] = await db
    .insert(usersTable)
    .values({
      username,
      email,
      passwordHash: hashPassword(password),
      role: mapRole(role as string),
      skills: [],
      onboardingCompleted: false,
      emailVerified: false,
    })
    .returning();

  res.status(201).json({
    token: makeToken(user.id),
    user: userResponse(user),
  });
});

router.post("/auth/login", async (req, res): Promise<void> => {
  const parsed = LoginBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { email, password } = parsed.data;
  const [user] = await db.select().from(usersTable).where(eq(usersTable.email, email));

  if (!user || user.passwordHash !== hashPassword(password)) {
    res.status(401).json({ error: "Invalid credentials" });
    return;
  }

  res.json({
    token: makeToken(user.id),
    user: userResponse(user),
  });
});

// ─── VERIFY OTP ──────────────────────────────────────────────────────────────
router.post("/auth/verify-otp", async (req, res): Promise<void> => {
  const parsed = VerifyOtpBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Введите корректный email и 6-значный код" });
    return;
  }

  const { email, code } = parsed.data;
  const now = new Date();

  const [record] = await db
    .select()
    .from(emailVerificationCodesTable)
    .where(eq(emailVerificationCodesTable.email, email))
    .orderBy(emailVerificationCodesTable.createdAt)
    .limit(1);

  if (!record) {
    res.status(400).json({ error: "Код не найден. Запросите новый код." });
    return;
  }

  if (record.expiresAt < now) {
    res.status(400).json({ error: "Код устарел. Запросите новый код." });
    return;
  }

  if (record.code !== code) {
    res.status(400).json({ error: "Неверный код подтверждения." });
    return;
  }

  const [user] = await db
    .update(usersTable)
    .set({ emailVerified: true })
    .where(eq(usersTable.email, email))
    .returning();

  if (!user) {
    res.status(404).json({ error: "Пользователь не найден" });
    return;
  }

  await db
    .delete(emailVerificationCodesTable)
    .where(eq(emailVerificationCodesTable.email, email));

  const token = makeToken(user.id);
  res.json({ token, user: userResponse(user) });
});

// ─── RESEND OTP ──────────────────────────────────────────────────────────────
router.post("/auth/resend-otp", async (req, res): Promise<void> => {
  const parsed = ResendOtpBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Введите корректный email" });
    return;
  }

  const { email } = parsed.data;

  const [user] = await db.select().from(usersTable).where(eq(usersTable.email, email));
  if (!user) {
    res.status(404).json({ error: "Пользователь с таким email не найден" });
    return;
  }

  const code = generateOtp();
  const expiresAt = new Date(Date.now() + 5 * 60 * 1000);

  await db.delete(emailVerificationCodesTable).where(
    eq(emailVerificationCodesTable.email, email)
  );
  await db.insert(emailVerificationCodesTable).values({ email, code, expiresAt });

  await sendOtpEmail(email, code);

  res.json({ ok: true, message: "Код отправлен повторно" });
});

router.post("/auth/refresh", async (req, res): Promise<void> => {
  const auth = req.headers.authorization;
  const token = auth?.startsWith("Bearer ") ? auth.slice(7) : null;
  if (!token) {
    res.status(401).json({ error: "No token provided" });
    return;
  }
  res.json({ token });
});

router.post("/auth/logout", async (_req, res): Promise<void> => {
  res.json({ ok: true });
});

export default router;
