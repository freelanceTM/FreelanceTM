-- Migration: add_tender_order_bridge
-- Sprint S1-3: Tender → Order Bridge
--
-- Changes:
--   1. Make orders.gigId nullable — tender-originated orders have no gig.
--   2. Add orders.tenderId (nullable FK → tenders.id) for traceability.
--   3. Seed default platform fee config row (S1-1) if not already present.

-- 1. Make gigId nullable
ALTER TABLE "orders" ALTER COLUMN "gigId" DROP NOT NULL;

-- 2. Add tenderId column
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "tenderId" INTEGER;

-- 3. Add FK constraint from orders.tenderId → tenders.id (SET NULL on delete)
ALTER TABLE "orders"
  ADD CONSTRAINT "orders_tenderId_fkey"
  FOREIGN KEY ("tenderId") REFERENCES "tenders"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- 4. Add index on tenderId for fast tender-order lookups
CREATE INDEX IF NOT EXISTS "orders_tenderId_idx" ON "orders"("tenderId");

-- 5. Seed S1-1 platform fee config (safe to run multiple times — INSERT ... ON CONFLICT DO NOTHING)
INSERT INTO "config" ("key", "value", "description", "updatedAt")
VALUES
  (
    'platformFeePercent',
    '20',
    'Platform commission percentage deducted from seller proceeds on escrow release (0-100)',
    NOW()
  ),
  (
    'platformWalletAddress',
    '',
    'TON wallet address that receives platform commission fees (leave empty to log only)',
    NOW()
  )
ON CONFLICT ("key") DO NOTHING;
