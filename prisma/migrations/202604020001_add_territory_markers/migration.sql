CREATE TABLE "TerritoryMarker" (
  "id" TEXT NOT NULL,
  "orgId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "address" TEXT,
  "lat" DOUBLE PRECISION NOT NULL,
  "lng" DOUBLE PRECISION NOT NULL,
  "color" TEXT NOT NULL DEFAULT '#0f172a',
  "kind" TEXT NOT NULL DEFAULT 'home',
  "isVisibleByDefault" BOOLEAN NOT NULL DEFAULT true,
  "createdByEmail" TEXT,
  "updatedByEmail" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "TerritoryMarker_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "TerritoryMarker_orgId_kind_name_idx" ON "TerritoryMarker"("orgId", "kind", "name");

ALTER TABLE "TerritoryMarker"
ADD CONSTRAINT "TerritoryMarker_orgId_fkey"
FOREIGN KEY ("orgId") REFERENCES "OrganizationWorkspace"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
