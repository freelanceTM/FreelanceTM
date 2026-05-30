-- Migration: sprint2_revision_and_extras
-- Sprint S2-2 (Revision Flow) + S2-3/S2-4 (Packages & Extras Checkout)
--
-- Changes:
--
--   1. Add 'revision_requested' to the OrderStatus enum.
--      IMPORTANT: ALTER TYPE ... ADD VALUE cannot run inside an explicit
--      transaction on PostgreSQL < 12. On PostgreSQL 12+ (the project target)
--      it is safe inside a transaction. If you must run this on PG < 12,
--      execute the ALTER TYPE statement alone first, then apply the rest.
--
--   2. Add three new columns to "orders":
--        revisionsUsed    INT  NOT NULL DEFAULT 0  -- incremented on each revision request
--        revisionsAllowed INT  NOT NULL DEFAULT 1  -- copied from GigPackage.revisions or Gig.revisions at order creation
--        revisionNote     TEXT                     -- buyer's note attached to the latest revision request

ALTER TYPE "OrderStatus" ADD VALUE IF NOT EXISTS 'revision_requested';

ALTER TABLE "orders"
  ADD COLUMN IF NOT EXISTS "revisionsUsed"    INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "revisionsAllowed" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS "revisionNote"     TEXT;
