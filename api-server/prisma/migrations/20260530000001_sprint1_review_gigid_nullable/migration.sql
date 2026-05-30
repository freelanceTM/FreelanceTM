-- Migration: sprint1_review_gigid_nullable
-- Sprint S1-2: Review Submission Engine
--
-- Changes:
--   1. Make reviews.gigId nullable so buyers can submit reviews on
--      tender-originated orders (which have no associated gig).
--
-- Note: existing rows are unaffected — they already have a non-null gigId.
-- The application now sets gigId = order.gigId (which may be null for tender orders).

ALTER TABLE "reviews" ALTER COLUMN "gigId" DROP NOT NULL;
