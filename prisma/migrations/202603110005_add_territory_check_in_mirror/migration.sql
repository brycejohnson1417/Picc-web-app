-- Mirror Notion comment-based territory check-ins locally so history survives API limitations.
-- Safe to run multiple times.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'TerritoryCheckInMirror'
  ) THEN
    CREATE TABLE "TerritoryCheckInMirror" (
      "id" TEXT NOT NULL,
      "orgId" TEXT NOT NULL,
      "storeId" TEXT NOT NULL,
      "notionPageId" TEXT NOT NULL,
      "notionCommentId" TEXT NOT NULL,
      "notionDiscussionId" TEXT,
      "noteText" TEXT,
      "mode" TEXT NOT NULL DEFAULT 'unknown',
      "happenedAt" TIMESTAMP(3) NOT NULL,
      "lastEditedTime" TIMESTAMP(3),
      "createdByLabel" TEXT,
      "createdByEmail" TEXT,
      "source" TEXT NOT NULL DEFAULT 'notion-comment',
      "lastSyncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "TerritoryCheckInMirror_pkey" PRIMARY KEY ("id")
    );
  END IF;
END
$$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'TerritoryCheckInMirror'
  ) THEN
    ALTER TABLE "TerritoryCheckInMirror"
      ADD COLUMN IF NOT EXISTS "orgId" TEXT,
      ADD COLUMN IF NOT EXISTS "storeId" TEXT,
      ADD COLUMN IF NOT EXISTS "notionPageId" TEXT,
      ADD COLUMN IF NOT EXISTS "notionCommentId" TEXT,
      ADD COLUMN IF NOT EXISTS "notionDiscussionId" TEXT,
      ADD COLUMN IF NOT EXISTS "noteText" TEXT,
      ADD COLUMN IF NOT EXISTS "mode" TEXT NOT NULL DEFAULT 'unknown',
      ADD COLUMN IF NOT EXISTS "happenedAt" TIMESTAMP(3),
      ADD COLUMN IF NOT EXISTS "lastEditedTime" TIMESTAMP(3),
      ADD COLUMN IF NOT EXISTS "createdByLabel" TEXT,
      ADD COLUMN IF NOT EXISTS "createdByEmail" TEXT,
      ADD COLUMN IF NOT EXISTS "source" TEXT NOT NULL DEFAULT 'notion-comment',
      ADD COLUMN IF NOT EXISTS "lastSyncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

    UPDATE "TerritoryCheckInMirror"
    SET
      "orgId" = COALESCE("orgId", ''),
      "storeId" = COALESCE("storeId", ''),
      "notionPageId" = COALESCE("notionPageId", ''),
      "notionCommentId" = COALESCE("notionCommentId", ''),
      "happenedAt" = COALESCE("happenedAt", CURRENT_TIMESTAMP)
    WHERE
      "orgId" IS NULL
      OR "storeId" IS NULL
      OR "notionPageId" IS NULL
      OR "notionCommentId" IS NULL
      OR "happenedAt" IS NULL;

    ALTER TABLE "TerritoryCheckInMirror"
      ALTER COLUMN "orgId" SET NOT NULL,
      ALTER COLUMN "storeId" SET NOT NULL,
      ALTER COLUMN "notionPageId" SET NOT NULL,
      ALTER COLUMN "notionCommentId" SET NOT NULL,
      ALTER COLUMN "happenedAt" SET NOT NULL;

    CREATE UNIQUE INDEX IF NOT EXISTS "TerritoryCheckInMirror_notionCommentId_key"
      ON "TerritoryCheckInMirror"("notionCommentId");
    CREATE INDEX IF NOT EXISTS "TerritoryCheckInMirror_orgId_storeId_happenedAt_idx"
      ON "TerritoryCheckInMirror"("orgId", "storeId", "happenedAt");
    CREATE INDEX IF NOT EXISTS "TerritoryCheckInMirror_notionPageId_happenedAt_idx"
      ON "TerritoryCheckInMirror"("notionPageId", "happenedAt");

    IF NOT EXISTS (
      SELECT 1
      FROM information_schema.table_constraints
      WHERE constraint_name = 'TerritoryCheckInMirror_orgId_fkey'
        AND table_name = 'TerritoryCheckInMirror'
    ) THEN
      ALTER TABLE "TerritoryCheckInMirror"
        ADD CONSTRAINT "TerritoryCheckInMirror_orgId_fkey"
        FOREIGN KEY ("orgId") REFERENCES "OrganizationWorkspace"("id")
        ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
  END IF;
END
$$;
