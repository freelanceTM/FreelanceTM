-- Migration: sprint3_fulltext_search
-- Sprint S3-3: Full-text GIN search on gigs
--
-- Changes:
--   1. Add "search_vector" tsvector column to "gigs" table.
--      Prisma maps this as Unsupported("tsvector") in schema.prisma.
--
--   2. Backfill the column for all existing rows using 'simple' text-search
--      configuration (language-agnostic tokenisation, safe for Russian/Turkmen/English).
--      Title gets weight A (highest), description gets weight B, tags weight C.
--
--   3. Create a GIN index on the column for fast @@ operator queries.
--
--   4. Create an INSERT/UPDATE trigger that keeps "search_vector" in sync
--      automatically whenever a gig's title, description, or tags change.
--      This means application code never needs to maintain the vector manually.
--
-- Usage (in application code):
--   WHERE "search_vector" @@ websearch_to_tsquery('simple', $1)
--   ORDER BY ts_rank("search_vector", websearch_to_tsquery('simple', $1)) DESC

-- Step 1: Add the column (nullable — backfilled in step 2)
ALTER TABLE "gigs" ADD COLUMN IF NOT EXISTS "search_vector" tsvector;

-- Step 2: Backfill all existing gigs
UPDATE "gigs"
SET "search_vector" =
  setweight(to_tsvector('simple', coalesce("title", '')), 'A') ||
  setweight(to_tsvector('simple', coalesce("description", '')), 'B') ||
  setweight(to_tsvector('simple', array_to_string("tags", ' ')), 'C');

-- Step 3: GIN index for fast full-text search
CREATE INDEX IF NOT EXISTS "gigs_search_vector_idx" ON "gigs" USING GIN ("search_vector");

-- Step 4: Trigger function to maintain the vector on every write
CREATE OR REPLACE FUNCTION update_gig_search_vector()
RETURNS trigger AS $$
BEGIN
  NEW.search_vector :=
    setweight(to_tsvector('simple', coalesce(NEW.title, '')), 'A') ||
    setweight(to_tsvector('simple', coalesce(NEW.description, '')), 'B') ||
    setweight(to_tsvector('simple', array_to_string(NEW.tags, ' ')), 'C');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS gig_search_vector_trigger ON "gigs";

CREATE TRIGGER gig_search_vector_trigger
  BEFORE INSERT OR UPDATE OF "title", "description", "tags" ON "gigs"
  FOR EACH ROW
  EXECUTE FUNCTION update_gig_search_vector();
