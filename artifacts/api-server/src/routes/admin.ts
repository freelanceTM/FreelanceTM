import { Router, type IRouter } from "express";
import { db, usersTable, topupRequestsTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { extractUser, requireAuth } from "../middleware/auth";

const router: IRouter = Router();

// ─── Admin guard ─────────────────────────────────────────────────────────────
async function requireAdmin(req: any, res: any, next: any): Promise<void> {
  if (!req.userId) { res.status(401).json({ error: "Authentication required" }); return; }
  const [user] = await db.select({ role: usersTable.role }).from(usersTable).where(eq(usersTable.id, req.userId));
  if (!user || user.role !== "admin") { res.status(403).json({ error: "Admin access required" }); return; }
  next();
}

// ─── GET /admin/topups — list all pending topup requests ─────────────────────
router.get("/admin/topups", extractUser, requireAuth, requireAdmin, async (req, res): Promise<void> => {
  const { status = "pending" } = req.query as { status?: string };

  const rows = await db
    .select({
      id: topupRequestsTable.id,
      amount: topupRequestsTable.amount,
      screenshotUrl: topupRequestsTable.screenshotUrl,
      ocrStatus: topupRequestsTable.ocrStatus,
      adminStatus: topupRequestsTable.adminStatus,
      createdAt: topupRequestsTable.createdAt,
      userId: topupRequestsTable.userId,
      username: usersTable.username,
      displayName: usersTable.displayName,
      email: usersTable.email,
      userBalance: usersTable.balance,
    })
    .from(topupRequestsTable)
    .innerJoin(usersTable, eq(topupRequestsTable.userId, usersTable.id))
    .where(
      status === "all"
        ? undefined
        : eq(topupRequestsTable.adminStatus, status as "pending" | "approved" | "rejected")
    )
    .orderBy(topupRequestsTable.createdAt);

  res.json({ items: rows });
});

// ─── PATCH /admin/topup/:id/approve ──────────────────────────────────────────
router.patch("/admin/topup/:id/approve", extractUser, requireAuth, requireAdmin, async (req, res): Promise<void> => {
  const topupId = parseInt(req.params.id, 10);
  if (isNaN(topupId)) { res.status(400).json({ error: "Invalid id" }); return; }

  const [topup] = await db.select().from(topupRequestsTable).where(eq(topupRequestsTable.id, topupId));
  if (!topup) { res.status(404).json({ error: "Topup request not found" }); return; }
  if (topup.adminStatus !== "pending") {
    res.status(400).json({ error: "Request already processed" }); return;
  }

  const [updated] = await db
    .update(topupRequestsTable)
    .set({ adminStatus: "approved" })
    .where(eq(topupRequestsTable.id, topupId))
    .returning();

  res.json(updated);
});

// ─── PATCH /admin/topup/:id/reject — clawback balance ────────────────────────
router.patch("/admin/topup/:id/reject", extractUser, requireAuth, requireAdmin, async (req, res): Promise<void> => {
  const topupId = parseInt(req.params.id, 10);
  if (isNaN(topupId)) { res.status(400).json({ error: "Invalid id" }); return; }

  const [topup] = await db.select().from(topupRequestsTable).where(eq(topupRequestsTable.id, topupId));
  if (!topup) { res.status(404).json({ error: "Topup request not found" }); return; }
  if (topup.adminStatus !== "pending") {
    res.status(400).json({ error: "Request already processed" }); return;
  }

  // Atomically clawback balance — only if OCR had credited it
  if (topup.ocrStatus === "verified") {
    const [user] = await db
      .select({ balance: usersTable.balance })
      .from(usersTable)
      .where(eq(usersTable.id, topup.userId));

    const newBalance = Math.max(0, (user?.balance ?? 0) - topup.amount);
    await db
      .update(usersTable)
      .set({ balance: newBalance })
      .where(eq(usersTable.id, topup.userId));
  }

  const [updated] = await db
    .update(topupRequestsTable)
    .set({ adminStatus: "rejected" })
    .where(eq(topupRequestsTable.id, topupId))
    .returning();

  res.json(updated);
});

export default router;
