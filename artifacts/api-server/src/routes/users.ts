import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, usersTable } from "@workspace/db";
import {
  GetUserParams,
  GetUserResponse,
  RegisterUserBody,
  RegisterUserResponse,
  UpdateMeBody,
  UpdateMeResponse,
  CompleteOnboardingBody,
} from "@workspace/api-zod";

const router: IRouter = Router();

function mapUser(user: typeof usersTable.$inferSelect) {
  return {
    ...user,
    skills: user.skills ?? [],
    portfolioUrls: user.portfolioUrls ?? [],
    languages: user.languages ?? ["ru"],
    createdAt: user.createdAt.toISOString(),
    lastActiveAt: user.lastActiveAt.toISOString(),
    isVerified: user.isVerified ?? false,
    onboardingCompleted: user.onboardingCompleted ?? false,
    level: user.level ?? "new",
    country: user.country ?? "TM",
  };
}

router.get("/users/me", async (req, res): Promise<void> => {
  const userId = req.headers["x-user-id"];
  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const id = parseInt(String(userId), 10);
  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, id));
  if (!user) {
    res.status(401).json({ error: "User not found" });
    return;
  }

  // Update last active
  await db.update(usersTable).set({ lastActiveAt: new Date() }).where(eq(usersTable.id, id));

  res.json(GetUserResponse.parse(mapUser(user)));
});

router.patch("/users/me", async (req, res): Promise<void> => {
  const userId = req.headers["x-user-id"];
  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const id = parseInt(String(userId), 10);

  const parsed = UpdateMeBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const updateData: Record<string, unknown> = {};
  if (parsed.data.displayName !== undefined) updateData.displayName = parsed.data.displayName;
  if (parsed.data.bio !== undefined) updateData.bio = parsed.data.bio;
  if (parsed.data.avatarUrl !== undefined) updateData.avatarUrl = parsed.data.avatarUrl;
  if (parsed.data.skills !== undefined) updateData.skills = parsed.data.skills;
  if (parsed.data.telegramUsername !== undefined) updateData.telegramUsername = parsed.data.telegramUsername;
  if (parsed.data.role !== undefined) updateData.role = parsed.data.role;
  if (parsed.data.portfolioUrls !== undefined) updateData.portfolioUrls = parsed.data.portfolioUrls;
  if (parsed.data.languages !== undefined) updateData.languages = parsed.data.languages;
  if (parsed.data.country !== undefined) updateData.country = parsed.data.country;

  const [user] = await db.update(usersTable).set(updateData).where(eq(usersTable.id, id)).returning();
  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }
  res.json(UpdateMeResponse.parse(mapUser(user)));
});

router.post("/users/me/onboarding", async (req, res): Promise<void> => {
  const userId = req.headers["x-user-id"];
  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const id = parseInt(String(userId), 10);

  const parsed = CompleteOnboardingBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const updateData: Record<string, unknown> = {
    onboardingCompleted: true,
    role: parsed.data.role as "freelancer" | "client" | "both",
  };
  if (parsed.data.displayName) updateData.displayName = parsed.data.displayName;
  if (parsed.data.bio) updateData.bio = parsed.data.bio;
  if (parsed.data.skills) updateData.skills = parsed.data.skills;
  if (parsed.data.telegramUsername) updateData.telegramUsername = parsed.data.telegramUsername;
  if (parsed.data.portfolioUrls) updateData.portfolioUrls = parsed.data.portfolioUrls;
  if (parsed.data.languages) updateData.languages = parsed.data.languages;

  const [user] = await db.update(usersTable).set(updateData).where(eq(usersTable.id, id)).returning();
  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }
  res.json(mapUser(user));
});

router.get("/users/:userId", async (req, res): Promise<void> => {
  const params = GetUserParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, params.data.userId));
  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }
  res.json(GetUserResponse.parse(mapUser(user)));
});

router.post("/users/register", async (req, res): Promise<void> => {
  const parsed = RegisterUserBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const existing = await db.select().from(usersTable).where(eq(usersTable.email, parsed.data.email));
  if (existing.length > 0) {
    const user = existing[0];
    // Update lastActiveAt on login
    await db.update(usersTable).set({ lastActiveAt: new Date() }).where(eq(usersTable.id, user.id));
    res.json(RegisterUserResponse.parse(mapUser(user)));
    return;
  }

  const [user] = await db.insert(usersTable).values({
    username: parsed.data.username,
    email: parsed.data.email,
    displayName: parsed.data.displayName ?? parsed.data.username,
    role: (parsed.data.role as "freelancer" | "client" | "both") ?? "client",
    skills: [],
    portfolioUrls: [],
    languages: ["ru"],
    completedOrders: 0,
    isVerified: false,
    onboardingCompleted: false,
    level: "new",
    country: "TM",
  }).returning();

  res.json(RegisterUserResponse.parse(mapUser(user)));
});

export default router;
