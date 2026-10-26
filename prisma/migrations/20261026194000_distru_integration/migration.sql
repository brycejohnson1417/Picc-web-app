ALTER TYPE "IntegrationProvider" ADD VALUE IF NOT EXISTS 'DISTRU';
CREATE TABLE "SalesSourceRecord" (
  "id" TEXT NOT NULL,
  "orgId" TEXT NOT NULL,
  "integrationId" TEXT NOT NULL,
  "resource" TEXT NOT NULL,
  "externalId" TEXT NOT NULL,
  "payload" JSONB NOT NULL,
  "annotation" JSONB NOT NULL DEFAULT '{}',
  "seenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SalesSourceRecord_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "SalesSourceRecord_integrationId_fkey" FOREIGN KEY ("integrationId") REFERENCES "IntegrationConnection"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "SalesSourceRecord_integrationId_resource_externalId_key" ON "SalesSourceRecord"("integrationId", "resource", "externalId");
CREATE INDEX "SalesSourceRecord_orgId_resource_idx" ON "SalesSourceRecord"("orgId", "resource");
