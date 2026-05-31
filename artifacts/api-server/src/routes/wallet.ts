import { Router, type IRouter } from "express";
import { db, usersTable, topupRequestsTable } from "@workspace/db";
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
// MVP: always returns "verified". Replace with real Tesseract / Google Vision later.
function mockOcr(_imageBuffer: Buffer): { status: "verified" | "failed"; confidence: number } {
  return { status: "verified", confidence: 1.0 };
}

// ─── POST /wallet/topup ───────────────────────────────────────────────────────
// Body (JSON): { amount: number, screenshot?: { data: string (dataURL), name: string } }
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

  // ── Save screenshot if provided ───────────────────────────────────────────
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

  // ── Mock OCR ───────────────────────────────────────────────────────────────
  const ocr = imageBuffer ? mockOcr(imageBuffer) : { status: "verified" as const, confidence: 0 };

  // ── SECURITY FIX: credit pendingBalance only — NOT the spendable balance ──
  // The main `balance` is only touched by an admin approve action.
  // This prevents malicious users from spending funds before admin review.
  if (ocr.status === "verified") {
    await db
      .update(usersTable)
      .set({ pendingBalance: sql`COALESCE(pending_balance, 0) + ${numAmount}` })
      .where(eq(usersTable.id, userId));
  }

  // ── Save topup request for admin review ───────────────────────────────────
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

// ─── GET /wallet/topups — user's own topup history ──────────────────────────
router.get("/wallet/topups", extractUser, requireAuth, async (req, res): Promise<void> => {
  const userId = req.userId!;
  const topups = await db
    .select()
    .from(topupRequestsTable)
    .where(eq(topupRequestsTable.userId, userId))
    .orderBy(desc(topupRequestsTable.createdAt));

  res.json({ items: topups });
});

export default router;
