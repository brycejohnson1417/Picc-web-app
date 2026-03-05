-- Account identity bridge, check-in metadata enrichment, and hot-path indexes

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'Account'
  ) THEN
    ALTER TABLE "Account"
      ADD COLUMN IF NOT EXISTS "notionPageId" TEXT;

    CREATE UNIQUE INDEX IF NOT EXISTS "Account_orgId_notionPageId_key" ON "Account"("orgId", "notionPageId");
    CREATE INDEX IF NOT EXISTS "Account_orgId_lastContactedAt_idx" ON "Account"("orgId", "lastContactedAt");
  END IF;
END
$$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'Opportunity'
  ) THEN
    CREATE INDEX IF NOT EXISTS "Opportunity_orgId_status_updatedAt_idx" ON "Opportunity"("orgId", "status", "updatedAt");
  END IF;
END
$$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'Task'
  ) THEN
    CREATE INDEX IF NOT EXISTS "Task_orgId_status_dueDate_idx" ON "Task"("orgId", "status", "dueDate");
  END IF;
END
$$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'Message'
  ) THEN
    CREATE INDEX IF NOT EXISTS "Message_orgId_accountId_sentAt_idx" ON "Message"("orgId", "accountId", "sentAt");
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
    ALTER TABLE "CheckIn"
      ADD COLUMN IF NOT EXISTS "mode" TEXT,
      ADD COLUMN IF NOT EXISTS "associatedContactName" TEXT,
      ADD COLUMN IF NOT EXISTS "associatedContactRole" TEXT,
      ADD COLUMN IF NOT EXISTS "associatedContactEmail" TEXT,
      ADD COLUMN IF NOT EXISTS "associatedContactPhone" TEXT,
      ADD COLUMN IF NOT EXISTS "notionNoteUrl" TEXT;
  END IF;
END
$$;
