CREATE TABLE "TerritoryStoreSyncJob" (
  "id" TEXT NOT NULL,
  "orgId" TEXT NOT NULL,
  "notionPageId" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'pending',
  "reason" TEXT NOT NULL DEFAULT 'webhook',
  "attemptCount" INTEGER NOT NULL DEFAULT 0,
  "queuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastAttemptedAt" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3),
  "lastError" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "TerritoryStoreSyncJob_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "TerritoryStoreSyncJob_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "OrganizationWorkspace"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "TerritoryStoreSyncJob_orgId_notionPageId_key"
  ON "TerritoryStoreSyncJob"("orgId", "notionPageId");

CREATE INDEX "TerritoryStoreSyncJob_orgId_status_queuedAt_idx"
  ON "TerritoryStoreSyncJob"("orgId", "status", "queuedAt");
