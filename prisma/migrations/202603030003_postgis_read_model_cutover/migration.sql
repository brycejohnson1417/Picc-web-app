-- PostGIS full-cutover foundation
CREATE EXTENSION IF NOT EXISTS postgis;

ALTER TABLE "Account"
  ADD COLUMN "geoLat" DOUBLE PRECISION,
  ADD COLUMN "geoLng" DOUBLE PRECISION,
  ADD COLUMN "geoPoint" geometry(Point,4326);

ALTER TABLE "Contact"
  ADD COLUMN "geoLat" DOUBLE PRECISION,
  ADD COLUMN "geoLng" DOUBLE PRECISION,
  ADD COLUMN "geoPoint" geometry(Point,4326);

CREATE TABLE "Territory" (
  "id" TEXT NOT NULL,
  "orgId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "geometry" geometry(MultiPolygon,4326) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Territory_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "Territory_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "OrganizationWorkspace"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "SalesRoute" (
  "id" TEXT NOT NULL,
  "orgId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "mode" TEXT NOT NULL DEFAULT 'car',
  "orderedStopIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
  "totalDistanceMeters" INTEGER NOT NULL DEFAULT 0,
  "totalDurationSeconds" INTEGER NOT NULL DEFAULT 0,
  "geometry" geometry(LineString,4326),
  "createdBy" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "SalesRoute_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "SalesRoute_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "OrganizationWorkspace"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "CheckIn" (
  "id" TEXT NOT NULL,
  "orgId" TEXT NOT NULL,
  "storeId" TEXT,
  "contactId" TEXT,
  "happenedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "noteText" TEXT,
  "photoUrls" TEXT[] DEFAULT ARRAY[]::TEXT[],
  "mileageMiles" DOUBLE PRECISION,
  "geoLat" DOUBLE PRECISION,
  "geoLng" DOUBLE PRECISION,
  "geoPoint" geometry(Point,4326),
  "createdByEmail" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CheckIn_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "CheckIn_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "OrganizationWorkspace"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "TerritoryStoreReadModel" (
  "id" TEXT NOT NULL,
  "orgId" TEXT NOT NULL,
  "notionPageId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "statusKey" TEXT NOT NULL,
  "statusColor" TEXT NOT NULL,
  "pinKind" TEXT NOT NULL,
  "repNames" TEXT[] DEFAULT ARRAY[]::TEXT[],
  "repEmails" TEXT[] DEFAULT ARRAY[]::TEXT[],
  "lat" DOUBLE PRECISION NOT NULL,
  "lng" DOUBLE PRECISION NOT NULL,
  "locationLabel" TEXT,
  "locationAddress" TEXT,
  "locationSource" TEXT NOT NULL,
  "lastEditedTime" TIMESTAMP(3) NOT NULL,
  "licenseNumber" TEXT,
  "city" TEXT,
  "state" TEXT,
  "daysOverdue" INTEGER,
  "phoneNumber" TEXT,
  "email" TEXT,
  "followUpDate" TIMESTAMP(3),
  "notes" TEXT,
  "lastCheckIn" TIMESTAMP(3),
  "interactionsScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "purchasesScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "followUpUrgencyScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "geoPoint" geometry(Point,4326),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "TerritoryStoreReadModel_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "TerritoryStoreReadModel_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "OrganizationWorkspace"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "TerritoryFilterPreset" (
  "id" TEXT NOT NULL,
  "orgId" TEXT NOT NULL,
  "ownerEmail" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "search" TEXT NOT NULL DEFAULT '',
  "selectedStatuses" TEXT[] DEFAULT ARRAY[]::TEXT[],
  "selectedReps" TEXT[] DEFAULT ARRAY[]::TEXT[],
  "showRouteOnly" BOOLEAN NOT NULL DEFAULT false,
  "pinColorMode" TEXT NOT NULL DEFAULT 'status',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "TerritoryFilterPreset_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "TerritoryFilterPreset_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "OrganizationWorkspace"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "TerritoryStoreReadModel_notionPageId_key" ON "TerritoryStoreReadModel"("notionPageId");
CREATE UNIQUE INDEX "TerritoryFilterPreset_orgId_ownerEmail_name_key" ON "TerritoryFilterPreset"("orgId", "ownerEmail", "name");

CREATE INDEX "Territory_orgId_name_idx" ON "Territory"("orgId", "name");
CREATE INDEX "SalesRoute_orgId_createdAt_idx" ON "SalesRoute"("orgId", "createdAt");
CREATE INDEX "CheckIn_orgId_storeId_happenedAt_idx" ON "CheckIn"("orgId", "storeId", "happenedAt");
CREATE INDEX "TerritoryStoreReadModel_orgId_name_idx" ON "TerritoryStoreReadModel"("orgId", "name");
CREATE INDEX "TerritoryStoreReadModel_orgId_statusKey_idx" ON "TerritoryStoreReadModel"("orgId", "statusKey");
CREATE INDEX "TerritoryStoreReadModel_orgId_followUpDate_idx" ON "TerritoryStoreReadModel"("orgId", "followUpDate");
CREATE INDEX "TerritoryFilterPreset_orgId_ownerEmail_updatedAt_idx" ON "TerritoryFilterPreset"("orgId", "ownerEmail", "updatedAt");

CREATE INDEX "Account_geoLat_geoLng_idx" ON "Account"("geoLat", "geoLng");
CREATE INDEX "Contact_geoLat_geoLng_idx" ON "Contact"("geoLat", "geoLng");

CREATE INDEX "Territory_gix" ON "Territory" USING GIST ("geometry");
CREATE INDEX "SalesRoute_gix" ON "SalesRoute" USING GIST ("geometry");
CREATE INDEX "CheckIn_gix" ON "CheckIn" USING GIST ("geoPoint");
CREATE INDEX "TerritoryStoreReadModel_gix" ON "TerritoryStoreReadModel" USING GIST ("geoPoint");
CREATE INDEX "Account_gix" ON "Account" USING GIST ("geoPoint");
CREATE INDEX "Contact_gix" ON "Contact" USING GIST ("geoPoint");
