-- Live CRM schema parity for map-first rollout
-- Safe to run multiple times.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'TerritoryStoreReadModel'
  ) THEN
    ALTER TABLE "TerritoryStoreReadModel"
      ADD COLUMN IF NOT EXISTS "locationPrecision" TEXT NOT NULL DEFAULT 'address',
      ADD COLUMN IF NOT EXISTS "isApproximate" BOOLEAN NOT NULL DEFAULT false;
  END IF;
END
$$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'Account'
  ) THEN
    ALTER TABLE "Account"
      ADD COLUMN IF NOT EXISTS "notionPageId" TEXT;

    CREATE UNIQUE INDEX IF NOT EXISTS "Account_orgId_notionPageId_key"
      ON "Account"("orgId", "notionPageId");
    CREATE INDEX IF NOT EXISTS "Account_orgId_notionPageId_idx"
      ON "Account"("orgId", "notionPageId");
  END IF;
END
$$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'CheckIn'
  ) THEN
    CREATE INDEX IF NOT EXISTS "CheckIn_storeId_happenedAt_idx"
      ON "CheckIn"("storeId", "happenedAt");
  END IF;
END
$$;
