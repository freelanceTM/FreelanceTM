import { Router, type IRouter } from "express";
import { db, usersTable, topupRequestsTable, payoutRequestsTable, ordersTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import { extractUser, requireAuth } from "../middleware/auth";

const router: IRouter = Router();

// ─── Admin guard ─────────────────────────────────────────────────────────────
async function requireAdmin(req: any, res: any, next: any): Promise<void> {
  if (!req.userId) { res.status(401).json({ error: "Authentication required" }); return; }
  const [user] = await db.select({ role: usersTable.role }).from(usersTable).where(eq(usersTable.id, req.userId));
  if (!user || user.role !== "admin") { res.status(403).json({ error: "Admin access required" }); return; }
  next();
}

// ═══════════════════════════════════════════════════════════════════════════════
// TOP-UP REQUESTS
// ═══════════════════════════════════════════════════════════════════════════════

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
      userPendingBalance: usersTable.pendingBalance,
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

// PATCH /admin/topup/:id/approve — move funds pendingBalance → balance
router.patch("/admin/topup/:id/approve", extractUser, requireAuth, requireAdmin, async (req, res): Promise<void> => {
  const topupId = parseInt(req.params.id, 10);
  if (isNaN(topupId)) { res.status(400).json({ error: "Invalid id" }); return; }

  const [topup] = await db.select().from(topupRequestsTable).where(eq(topupRequestsTable.id, topupId));
  if (!topup) { res.status(404).json({ error: "Topup request not found" }); return; }
  if (topup.adminStatus !== "pending") { res.status(400).json({ error: "Request already processed" }); return; }

  const [updated] = await db.transaction(async (tx) => {
    await tx
      .update(usersTable)
      .set({
        balance: sql`COALESCE(balance, 0) + ${topup.amount}`,
        pendingBalance: sql`GREATEST(COALESCE(pending_balance, 0) - ${topup.amount}, 0)`,
      })
      .where(eq(usersTable.id, topup.userId));

    return tx
      .update(topupRequestsTable)
      .set({ adminStatus: "approved" })
      .where(eq(topupRequestsTable.id, topupId))
      .returning();
  });

  res.json(updated);
});

// PATCH /admin/topup/:id/reject — destroy held pendingBalance
router.patch("/admin/topup/:id/reject", extractUser, requireAuth, requireAdmin, async (req, res): Promise<void> => {
  const topupId = parseInt(req.params.id, 10);
  if (isNaN(topupId)) { res.status(400).json({ error: "Invalid id" }); return; }

  const [topup] = await db.select().from(topupRequestsTable).where(eq(topupRequestsTable.id, topupId));
  if (!topup) { res.status(404).json({ error: "Topup request not found" }); return; }
  if (topup.adminStatus !== "pending") { res.status(400).json({ error: "Request already processed" }); return; }

  const [updated] = await db.transaction(async (tx) => {
    await tx
      .update(usersTable)
      .set({ pendingBalance: sql`GREATEST(COALESCE(pending_balance, 0) - ${topup.amount}, 0)` })
      .where(eq(usersTable.id, topup.userId));

    return tx
      .update(topupRequestsTable)
      .set({ adminStatus: "rejected" })
      .where(eq(topupRequestsTable.id, topupId))
      .returning();
  });

  res.json(updated);
});

// ═══════════════════════════════════════════════════════════════════════════════
// PAYOUT REQUESTS
// ═══════════════════════════════════════════════════════════════════════════════

// GET /admin/payouts — list payout requests
router.get("/admin/payouts", extractUser, requireAuth, requireAdmin, async (req, res): Promise<void> => {
  const { status = "pending" } = req.query as { status?: string };

  const rows = await db
    .select({
      id: payoutRequestsTable.id,
      amount: payoutRequestsTable.amount,
      phoneNumber: payoutRequestsTable.phoneNumber,
      status: payoutRequestsTable.status,
      createdAt: payoutRequestsTable.createdAt,
      userId: payoutRequestsTable.userId,
      username: usersTable.username,
      displayName: usersTable.displayName,
      email: usersTable.email,
      userBalance: usersTable.balance,
    })
    .from(payoutRequestsTable)
    .innerJoin(usersTable, eq(payoutRequestsTable.userId, usersTable.id))
    .where(
      status === "all"
        ? undefined
        : eq(payoutRequestsTable.status, status as "pending" | "approved" | "rejected")
    )
    .orderBy(payoutRequestsTable.createdAt);

  res.json({ items: rows });
});

// PATCH /admin/payout/:id/approve — money already deducted at request time; just mark approved
router.patch("/admin/payout/:id/approve", extractUser, requireAuth, requireAdmin, async (req, res): Promise<void> => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const [payout] = await db.select().from(payoutRequestsTable).where(eq(payoutRequestsTable.id, id));
  if (!payout) { res.status(404).json({ error: "Payout request not found" }); return; }
  if (payout.status !== "pending") { res.status(400).json({ error: "Request already processed" }); return; }

  const [updated] = await db
    .update(payoutRequestsTable)
    .set({ status: "approved" })
    .where(eq(payoutRequestsTable.id, id))
    .returning();

  res.json(updated);
});

// PATCH /admin/payout/:id/reject — mark rejected and atomically refund balance
router.patch("/admin/payout/:id/reject", extractUser, requireAuth, requireAdmin, async (req, res): Promise<void> => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const [payout] = await db.select().from(payoutRequestsTable).where(eq(payoutRequestsTable.id, id));
  if (!payout) { res.status(404).json({ error: "Payout request not found" }); return; }
  if (payout.status !== "pending") { res.status(400).json({ error: "Request already processed" }); return; }

  const [updated] = await db.transaction(async (tx) => {
    // Refund the deducted amount back to the user's spendable balance
    await tx
      .update(usersTable)
      .set({ balance: sql`COALESCE(balance, 0) + ${payout.amount}` })
      .where(eq(usersTable.id, payout.userId));

    return tx
      .update(payoutRequestsTable)
      .set({ status: "rejected" })
      .where(eq(payoutRequestsTable.id, id))
      .returning();
  });

  res.json(updated);
});

// ═══════════════════════════════════════════════════════════════════════════════
// ARBITRATION — DISPUTED ORDERS
// ═══════════════════════════════════════════════════════════════════════════════

// GET /admin/orders/disputed — list all disputed orders with user info
router.get("/admin/orders/disputed", extractUser, requireAuth, requireAdmin, async (req, res): Promise<void> => {
  const buyerAlias = usersTable;

  // Raw join — Drizzle doesn't alias tables without extra gymnastics; use SQL directly
  const rows = await db.execute(sql`
    SELECT
      o.id,
      o.price,
      o.status,
      o.is_disputed AS "isDisputed",
      o.created_at AS "createdAt",
      o.delivery_note AS "deliveryNote",
      o.buyer_id AS "buyerId",
      o.seller_id AS "sellerId",
      b.username AS "buyerUsername",
      b.display_name AS "buyerDisplayName",
      s.username AS "sellerUsername",
      s.display_name AS "sellerDisplayName",
      COALESCE(g.title, t.title, 'Contract') AS "gigTitle"
    FROM orders o
    JOIN users b ON b.id = o.buyer_id
    JOIN users s ON s.id = o.seller_id
    LEFT JOIN gigs g ON g.id = o.gig_id
    LEFT JOIN tenders t ON t.id = o.tender_id
    WHERE o.is_disputed = true AND o.status NOT IN ('completed', 'cancelled')
    ORDER BY o.created_at ASC
  `);

  res.json({ items: rows.rows });
});

// PATCH /admin/orders/:id/resolve — resolve dispute: refund_buyer or pay_seller
router.patch("/admin/orders/:id/resolve", extractUser, requireAuth, requireAdmin, async (req, res): Promise<void> => {
  const orderId = parseInt(req.params.id, 10);
  if (isNaN(orderId)) { res.status(400).json({ error: "Invalid order id" }); return; }

  const { resolution } = req.body as { resolution?: "refund_buyer" | "pay_seller" };
  if (resolution !== "refund_buyer" && resolution !== "pay_seller") {
    res.status(400).json({ error: "resolution must be 'refund_buyer' or 'pay_seller'" }); return;
  }

  const [order] = await db.select().from(ordersTable).where(eq(ordersTable.id, orderId));
  if (!order) { res.status(404).json({ error: "Order not found" }); return; }
  if (!order.isDisputed) { res.status(400).json({ error: "Order is not disputed" }); return; }

  const [updated] = await db.transaction(async (tx) => {
    if (resolution === "refund_buyer") {
      // Return escrow funds to the buyer
      await tx
        .update(usersTable)
        .set({ balance: sql`COALESCE(balance, 0) + ${order.price}` })
        .where(eq(usersTable.id, order.buyerId));
    } else {
      // Release escrow funds to the seller
      await tx
        .update(usersTable)
        .set({ balance: sql`COALESCE(balance, 0) + ${order.price}` })
        .where(eq(usersTable.id, order.sellerId));
    }

    return tx
      .update(ordersTable)
      .set({
        isDisputed: false,
        status: resolution === "refund_buyer" ? "cancelled" : "completed",
      })
      .where(eq(ordersTable.id, orderId))
      .returning();
  });

  res.json(updated);
});

export default router;
