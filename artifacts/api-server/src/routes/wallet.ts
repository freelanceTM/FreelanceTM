import { Router, type IRouter } from "express";
import { db, usersTable, topupRequestsTable, payoutRequestsTable } from "@workspace/db";
import { eq, desc, sql } from "drizzle-orm";
import { extractUser, requireAuth } from "../middleware/auth";
import crypto from "crypto";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const router: IRouter = Router();

// Uploads directory — persists next to the built bundle
const UPLOADS_DIR = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "public",
  "uploads",
);
fs.mkdirSync(UPLOADS_DIR, { recursive: true });

// ─── Mock OCR ────────────────────────────────────────────────────────────────
function mockOcr(_imageBuffer: Buffer): { status: "verified" | "failed"; confidence: number } {
  return { status: "verified", confidence: 1.0 };
}

// ─── POST /wallet/topup ───────────────────────────────────────────────────────
router.post("/wallet/topup", extractUser, requireAuth, async (req, res): Promise<void> => {
  const { amount, screenshot } = req.body as {
    amount?: number;
    screenshot?: { data: string; name: string };
  };

  if (!amount || isNaN(Number(amount)) || Number(amount) <= 0) {
    res.status(400).json({ error: "amount must be a positive number" });
    return;
  }

  const userId = req.userId!;
  const numAmount = Number(amount);

  let screenshotUrl: string | null = null;
  let imageBuffer: Buffer | null = null;

  if (screenshot?.data) {
    const matches = screenshot.data.match(/^data:(image\/\w+);base64,(.+)$/);
    if (matches) {
      imageBuffer = Buffer.from(matches[2], "base64");
      const ext = matches[1].split("/")[1] ?? "png";
      const filename = `${crypto.randomUUID()}.${ext}`;
      fs.writeFileSync(path.join(UPLOADS_DIR, filename), imageBuffer);
      screenshotUrl = `/uploads/${filename}`;
    }
  }

  const ocr = imageBuffer ? mockOcr(imageBuffer) : { status: "verified" as const, confidence: 0 };

  // SECURITY: credit pendingBalance only — balance touched only on admin approval
  if (ocr.status === "verified") {
    await db
      .update(usersTable)
      .set({ pendingBalance: sql`COALESCE(pending_balance, 0) + ${numAmount}` })
      .where(eq(usersTable.id, userId));
  }

  const [topup] = await db
    .insert(topupRequestsTable)
    .values({
      userId,
      amount: numAmount,
      screenshotUrl,
      ocrStatus: ocr.status,
      adminStatus: "pending",
    })
    .returning();

  res.status(201).json({
    id: topup.id,
    amount: topup.amount,
    ocrStatus: topup.ocrStatus,
    adminStatus: topup.adminStatus,
    screenshotUrl: topup.screenshotUrl,
    createdAt: topup.createdAt,
    credited: false,
  });
});

// ─── GET /wallet/topups ───────────────────────────────────────────────────────
router.get("/wallet/topups", extractUser, requireAuth, async (req, res): Promise<void> => {
  const userId = req.userId!;
  const topups = await db
    .select()
    .from(topupRequestsTable)
    .where(eq(topupRequestsTable.userId, userId))
    .orderBy(desc(topupRequestsTable.createdAt));

  res.json({ items: topups });
});

// ─── POST /wallet/payout ──────────────────────────────────────────────────────
// Accepts { amount, phoneNumber }. Atomically deducts from spendable balance
// and creates a pending payout_request for admin review.
// MVP: mobile phone transfers ONLY (no bank cards).
router.post("/wallet/payout", extractUser, requireAuth, async (req, res): Promise<void> => {
  const { amount, phoneNumber } = req.body as { amount?: number; phoneNumber?: string };

  if (!amount || isNaN(Number(amount)) || Number(amount) <= 0) {
    res.status(400).json({ error: "amount must be a positive number" });
    return;
  }
  if (!phoneNumber || typeof phoneNumber !== "string" || phoneNumber.trim().length < 8) {
    res.status(400).json({ error: "phoneNumber is required (mobile transfer)" });
    return;
  }

  const userId = req.userId!;
  const numAmount = Number(amount);
  const phone = phoneNumber.trim();

  // Atomic: check balance and deduct in one transaction
  const [payout] = await db.transaction(async (tx) => {
    const [user] = await tx
      .select({ balance: usersTable.balance })
      .from(usersTable)
      .where(eq(usersTable.id, userId));

    if (!user || (user.balance ?? 0) < numAmount) {
      throw new Error("INSUFFICIENT_BALANCE");
    }

    await tx
      .update(usersTable)
      .set({ balance: sql`COALESCE(balance, 0) - ${numAmount}` })
      .where(eq(usersTable.id, userId));

    return tx
      .insert(payoutRequestsTable)
      .values({ userId, amount: numAmount, phoneNumber: phone, status: "pending" })
      .returning();
  }).catch((err) => {
    if (err.message === "INSUFFICIENT_BALANCE") {
      res.status(400).json({ error: "Insufficient balance" });
    } else {
      res.status(500).json({ error: "Internal error" });
    }
    return null;
  });

  if (!payout) return;

  res.status(201).json(payout);
});

// ─── GET /wallet/payouts ──────────────────────────────────────────────────────
router.get("/wallet/payouts", extractUser, requireAuth, async (req, res): Promise<void> => {
  const userId = req.userId!;
  const payouts = await db
    .select()
    .from(payoutRequestsTable)
    .where(eq(payoutRequestsTable.userId, userId))
    .orderBy(desc(payoutRequestsTable.createdAt));

  res.json({ items: payouts });
});

export default router;
