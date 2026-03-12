-- CreateTable
CREATE TABLE "AppSessionAudit" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "clerkUserId" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "email" TEXT,
    "displayName" TEXT,
    "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AppSessionAudit_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AppSessionAudit_sessionId_key" ON "AppSessionAudit"("sessionId");

-- CreateIndex
CREATE INDEX "AppSessionAudit_orgId_clerkUserId_lastSeenAt_idx" ON "AppSessionAudit"("orgId", "clerkUserId", "lastSeenAt");

-- CreateIndex
CREATE INDEX "AppSessionAudit_orgId_email_lastSeenAt_idx" ON "AppSessionAudit"("orgId", "email", "lastSeenAt");

-- AddForeignKey
ALTER TABLE "AppSessionAudit" ADD CONSTRAINT "AppSessionAudit_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "OrganizationWorkspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
