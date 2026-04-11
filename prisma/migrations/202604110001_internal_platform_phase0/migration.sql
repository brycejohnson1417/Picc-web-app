-- CreateEnum
CREATE TYPE "AccountIdentityType" AS ENUM ('ACCOUNT_ID', 'NOTION_PAGE_ID', 'LICENSED_LOCATION_ID', 'NABIS_RETAILER_ID', 'LICENSE_NUMBER', 'ALIAS');

-- CreateEnum
CREATE TYPE "VendorDayRequestSource" AS ENUM ('STORE_REQUESTED', 'REP_REQUESTED', 'BA_REQUESTED', 'OPS_REQUESTED', 'ADMIN_REQUESTED', 'AUTO_GENERATED');

-- CreateEnum
CREATE TYPE "VendorDayRequestStatus" AS ENUM ('PROPOSED', 'REQUESTED', 'AWAITING_REP_APPROVAL', 'READY_FOR_DISPATCH', 'OFFER_PENDING', 'ASSIGNED', 'PASSED_OFF', 'NO_SHOW', 'EXCEPTION', 'DISPUTED', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "VendorDayOfferStatus" AS ENUM ('OPEN', 'ACCEPTED', 'DECLINED', 'WITHDRAWN', 'EXPIRED');

-- CreateEnum
CREATE TYPE "VendorDayAssignmentStatus" AS ENUM ('ASSIGNED', 'PASSED_OFF', 'NO_SHOW', 'CHECKED_IN', 'CHECKED_OUT', 'COMPLETED', 'EXCEPTION', 'DISPUTED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "VendorDayArtifactType" AS ENUM ('CHECK_IN_PHOTO', 'CHECK_OUT_PHOTO', 'POS_REPORT', 'SCREENSHOT', 'EXTRA');

-- AlterEnum
ALTER TYPE "IntegrationProvider" ADD VALUE 'NABIS';

-- DropIndex
DROP INDEX "Account_geoLat_geoLng_idx";

-- DropIndex
DROP INDEX "Account_gix";

-- DropIndex
DROP INDEX "Account_orgId_lastContactedAt_idx";

-- DropIndex
DROP INDEX "CheckIn_gix";

-- DropIndex
DROP INDEX "Contact_geoLat_geoLng_idx";

-- DropIndex
DROP INDEX "Contact_gix";

-- DropIndex
DROP INDEX "Message_orgId_accountId_sentAt_idx";

-- DropIndex
DROP INDEX "Opportunity_orgId_status_updatedAt_idx";

-- DropIndex
DROP INDEX "SalesRoute_gix";

-- DropIndex
DROP INDEX "Task_orgId_status_dueDate_idx";

-- DropIndex
DROP INDEX "Territory_gix";

-- DropIndex
DROP INDEX "TerritoryStoreReadModel_gix";

-- AlterTable
ALTER TABLE "Account" ADD COLUMN     "licensedLocationId" TEXT,
ADD COLUMN     "nabisRetailerId" TEXT;

-- AlterTable
ALTER TABLE "CheckIn" DROP COLUMN "associatedContactEmail",
DROP COLUMN "associatedContactName",
DROP COLUMN "associatedContactPhone",
DROP COLUMN "associatedContactRole",
DROP COLUMN "mode",
DROP COLUMN "notionNoteUrl";

-- AlterTable
ALTER TABLE "NabisOrder" ADD COLUMN     "isInternalTransfer" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "nabisRetailerId" TEXT,
ADD COLUMN     "orderCreatedDate" TIMESTAMP(3),
ADD COLUMN     "status" TEXT;

-- AlterTable
ALTER TABLE "NotionCacheSnapshot" ALTER COLUMN "lastEditedMax" SET DATA TYPE TIMESTAMP(3),
ALTER COLUMN "syncedAt" SET DATA TYPE TIMESTAMP(3),
ALTER COLUMN "updatedAt" DROP DEFAULT,
ALTER COLUMN "updatedAt" SET DATA TYPE TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Territory" DROP COLUMN "geometry";

-- AlterTable
ALTER TABLE "TerritoryCheckInMirror" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "TerritoryMarker" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "TerritoryStoreSyncJob" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- CreateTable
CREATE TABLE "MembershipRoleGrant" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "clerkUserId" TEXT NOT NULL,
    "role" "Role" NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MembershipRoleGrant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OperationalAccessInvite" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'BRAND_AMBASSADOR',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "invitedByClerkUserId" TEXT NOT NULL,
    "invitedByEmail" TEXT,
    "note" TEXT,
    "acceptedAt" TIMESTAMP(3),
    "acceptedByClerkUserId" TEXT,
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OperationalAccessInvite_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PolicySnapshot" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "values" JSONB NOT NULL,
    "effectiveFrom" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdByClerkUserId" TEXT,
    "createdByEmail" TEXT,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PolicySnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkerProfile" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "clerkUserId" TEXT,
    "email" TEXT,
    "displayName" TEXT NOT NULL,
    "phone" TEXT,
    "photoUrl" TEXT,
    "homeAddress" TEXT,
    "homeLat" DOUBLE PRECISION,
    "homeLng" DOUBLE PRECISION,
    "maxTravelMinutes" INTEGER NOT NULL DEFAULT 60,
    "hasVehicle" BOOLEAN NOT NULL DEFAULT false,
    "vehicleType" TEXT,
    "employerName" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "canAcceptOffers" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkerProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VendorDayRequest" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "source" "VendorDayRequestSource" NOT NULL,
    "status" "VendorDayRequestStatus" NOT NULL DEFAULT 'REQUESTED',
    "requestedStart" TIMESTAMP(3) NOT NULL,
    "requestedEnd" TIMESTAMP(3) NOT NULL,
    "alternateStart" TIMESTAMP(3),
    "alternateEnd" TIMESTAMP(3),
    "requestedDurationHours" INTEGER NOT NULL DEFAULT 3,
    "pennyBundleRequested" BOOLEAN NOT NULL DEFAULT false,
    "override60DayWindow" BOOLEAN NOT NULL DEFAULT false,
    "overrideReason" TEXT,
    "requiresAdminApproval" BOOLEAN NOT NULL DEFAULT false,
    "requestedByClerkUserId" TEXT,
    "requestedByRole" "Role",
    "requestedByEmail" TEXT,
    "approvedByClerkUserId" TEXT,
    "approvedAt" TIMESTAMP(3),
    "priorityScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "priorityBreakdown" JSONB,
    "notes" TEXT,
    "policySnapshotId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VendorDayRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VendorDayOffer" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "workerProfileId" TEXT NOT NULL,
    "status" "VendorDayOfferStatus" NOT NULL DEFAULT 'OPEN',
    "offeredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "respondedAt" TIMESTAMP(3),
    "rankScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "rankReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VendorDayOffer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VendorDayAssignment" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "workerProfileId" TEXT NOT NULL,
    "acceptedOfferId" TEXT,
    "status" "VendorDayAssignmentStatus" NOT NULL DEFAULT 'ASSIGNED',
    "scheduledStart" TIMESTAMP(3) NOT NULL,
    "scheduledEnd" TIMESTAMP(3) NOT NULL,
    "travelMinutesOneWay" INTEGER,
    "travelMilesOneWay" DOUBLE PRECISION,
    "eventPayRateDollars" DECIMAL(10,2),
    "travelPayRateDollars" DECIMAL(10,2),
    "oneWayTravelThresholdMin" INTEGER,
    "eventPayAmount" DECIMAL(10,2),
    "travelPayAmount" DECIMAL(10,2),
    "override60DayWindow" BOOLEAN NOT NULL DEFAULT false,
    "overrideReason" TEXT,
    "passOffRequestedAt" TIMESTAMP(3),
    "passOffReason" TEXT,
    "policySnapshotId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VendorDayAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VendorDayExecution" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "assignmentId" TEXT NOT NULL,
    "checkInAt" TIMESTAMP(3),
    "checkOutAt" TIMESTAMP(3),
    "checkInGeoLat" DOUBLE PRECISION,
    "checkInGeoLng" DOUBLE PRECISION,
    "checkInAccuracyMeters" DOUBLE PRECISION,
    "checkOutGeoLat" DOUBLE PRECISION,
    "checkOutGeoLng" DOUBLE PRECISION,
    "checkOutAccuracyMeters" DOUBLE PRECISION,
    "locationUnavailable" BOOLEAN NOT NULL DEFAULT false,
    "distanceFlagged" BOOLEAN NOT NULL DEFAULT false,
    "pendingArtifactSync" BOOLEAN NOT NULL DEFAULT false,
    "pennyBundleStatus" TEXT,
    "trafficLevel" TEXT,
    "budtenderEngagementScore" INTEGER,
    "checkInNotes" TEXT,
    "checkOutNotes" TEXT,
    "restockNeeded" TEXT,
    "objections" TEXT,
    "bestConversation" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VendorDayExecution_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VendorDayArtifact" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "executionId" TEXT NOT NULL,
    "type" "VendorDayArtifactType" NOT NULL,
    "storageUrl" TEXT NOT NULL,
    "originalName" TEXT,
    "mimeType" TEXT,
    "sizeBytes" INTEGER,
    "syncStatus" TEXT NOT NULL DEFAULT 'synced',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VendorDayArtifact_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NabisRetailer" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "accountId" TEXT,
    "notionPageId" TEXT,
    "licensedLocationId" TEXT NOT NULL,
    "externalRetailerId" TEXT,
    "licenseNumber" TEXT,
    "name" TEXT NOT NULL,
    "doingBusinessAs" TEXT,
    "address1" TEXT,
    "address2" TEXT,
    "city" TEXT,
    "state" TEXT,
    "zipcode" TEXT,
    "geoLat" DOUBLE PRECISION,
    "geoLng" DOUBLE PRECISION,
    "orderCount" INTEGER NOT NULL DEFAULT 0,
    "lifetimeRevenue" DECIMAL(12,2),
    "firstOrderAt" TIMESTAMP(3),
    "lastOrderAt" TIMESTAMP(3),
    "lastSyncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NabisRetailer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NabisStoreMetricDaily" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "accountId" TEXT,
    "licensedLocationId" TEXT NOT NULL,
    "metricDate" TIMESTAMP(3) NOT NULL,
    "orderCount" INTEGER NOT NULL DEFAULT 0,
    "revenue" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "firstOrderAt" TIMESTAMP(3),
    "lastOrderAt" TIMESTAMP(3),
    "lastSyncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NabisStoreMetricDaily_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AccountIdentityMapping" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "accountId" TEXT,
    "identityType" "AccountIdentityType" NOT NULL,
    "identityValue" TEXT NOT NULL,
    "normalizedValue" TEXT NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'SYSTEM',
    "isOverride" BOOLEAN NOT NULL DEFAULT false,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdByClerkUserId" TEXT,
    "createdByEmail" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AccountIdentityMapping_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditEvent" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "actorClerkUserId" TEXT,
    "actorEmail" TEXT,
    "action" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT,
    "reason" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MembershipRoleGrant_orgId_clerkUserId_active_idx" ON "MembershipRoleGrant"("orgId", "clerkUserId", "active");

-- CreateIndex
CREATE UNIQUE INDEX "MembershipRoleGrant_orgId_clerkUserId_role_key" ON "MembershipRoleGrant"("orgId", "clerkUserId", "role");

-- CreateIndex
CREATE INDEX "OperationalAccessInvite_email_active_idx" ON "OperationalAccessInvite"("email", "active");

-- CreateIndex
CREATE UNIQUE INDEX "OperationalAccessInvite_orgId_email_key" ON "OperationalAccessInvite"("orgId", "email");

-- CreateIndex
CREATE INDEX "PolicySnapshot_orgId_effectiveFrom_idx" ON "PolicySnapshot"("orgId", "effectiveFrom");

-- CreateIndex
CREATE INDEX "PolicySnapshot_orgId_createdAt_idx" ON "PolicySnapshot"("orgId", "createdAt");

-- CreateIndex
CREATE INDEX "WorkerProfile_orgId_active_canAcceptOffers_idx" ON "WorkerProfile"("orgId", "active", "canAcceptOffers");

-- CreateIndex
CREATE INDEX "WorkerProfile_orgId_email_idx" ON "WorkerProfile"("orgId", "email");

-- CreateIndex
CREATE UNIQUE INDEX "WorkerProfile_orgId_clerkUserId_key" ON "WorkerProfile"("orgId", "clerkUserId");

-- CreateIndex
CREATE INDEX "VendorDayRequest_orgId_status_requestedStart_idx" ON "VendorDayRequest"("orgId", "status", "requestedStart");

-- CreateIndex
CREATE INDEX "VendorDayRequest_orgId_accountId_status_idx" ON "VendorDayRequest"("orgId", "accountId", "status");

-- CreateIndex
CREATE INDEX "VendorDayOffer_orgId_status_expiresAt_idx" ON "VendorDayOffer"("orgId", "status", "expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "VendorDayOffer_requestId_workerProfileId_key" ON "VendorDayOffer"("requestId", "workerProfileId");

-- CreateIndex
CREATE UNIQUE INDEX "VendorDayAssignment_acceptedOfferId_key" ON "VendorDayAssignment"("acceptedOfferId");

-- CreateIndex
CREATE INDEX "VendorDayAssignment_orgId_status_scheduledStart_idx" ON "VendorDayAssignment"("orgId", "status", "scheduledStart");

-- CreateIndex
CREATE UNIQUE INDEX "VendorDayAssignment_requestId_workerProfileId_key" ON "VendorDayAssignment"("requestId", "workerProfileId");

-- CreateIndex
CREATE UNIQUE INDEX "VendorDayExecution_assignmentId_key" ON "VendorDayExecution"("assignmentId");

-- CreateIndex
CREATE INDEX "VendorDayArtifact_orgId_executionId_type_idx" ON "VendorDayArtifact"("orgId", "executionId", "type");

-- CreateIndex
CREATE INDEX "NabisRetailer_orgId_accountId_idx" ON "NabisRetailer"("orgId", "accountId");

-- CreateIndex
CREATE INDEX "NabisRetailer_orgId_notionPageId_idx" ON "NabisRetailer"("orgId", "notionPageId");

-- CreateIndex
CREATE UNIQUE INDEX "NabisRetailer_orgId_licensedLocationId_key" ON "NabisRetailer"("orgId", "licensedLocationId");

-- CreateIndex
CREATE UNIQUE INDEX "NabisRetailer_orgId_externalRetailerId_key" ON "NabisRetailer"("orgId", "externalRetailerId");

-- CreateIndex
CREATE INDEX "NabisStoreMetricDaily_orgId_accountId_metricDate_idx" ON "NabisStoreMetricDaily"("orgId", "accountId", "metricDate");

-- CreateIndex
CREATE INDEX "NabisStoreMetricDaily_orgId_licensedLocationId_metricDate_idx" ON "NabisStoreMetricDaily"("orgId", "licensedLocationId", "metricDate");

-- CreateIndex
CREATE UNIQUE INDEX "NabisStoreMetricDaily_orgId_licensedLocationId_metricDate_key" ON "NabisStoreMetricDaily"("orgId", "licensedLocationId", "metricDate");

-- CreateIndex
CREATE INDEX "AccountIdentityMapping_orgId_accountId_active_idx" ON "AccountIdentityMapping"("orgId", "accountId", "active");

-- CreateIndex
CREATE INDEX "AccountIdentityMapping_orgId_identityType_active_idx" ON "AccountIdentityMapping"("orgId", "identityType", "active");

-- CreateIndex
CREATE UNIQUE INDEX "AccountIdentityMapping_orgId_identityType_normalizedValue_key" ON "AccountIdentityMapping"("orgId", "identityType", "normalizedValue");

-- CreateIndex
CREATE INDEX "AuditEvent_orgId_createdAt_idx" ON "AuditEvent"("orgId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditEvent_orgId_actorClerkUserId_createdAt_idx" ON "AuditEvent"("orgId", "actorClerkUserId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditEvent_orgId_entityType_entityId_createdAt_idx" ON "AuditEvent"("orgId", "entityType", "entityId", "createdAt");

-- CreateIndex
CREATE INDEX "Account_orgId_licensedLocationId_idx" ON "Account"("orgId", "licensedLocationId");

-- CreateIndex
CREATE INDEX "Account_orgId_nabisRetailerId_idx" ON "Account"("orgId", "nabisRetailerId");

-- CreateIndex
CREATE UNIQUE INDEX "Account_orgId_licensedLocationId_key" ON "Account"("orgId", "licensedLocationId");

-- CreateIndex
CREATE UNIQUE INDEX "Account_orgId_nabisRetailerId_key" ON "Account"("orgId", "nabisRetailerId");

-- CreateIndex
CREATE INDEX "NabisOrder_orgId_licensedLocationId_idx" ON "NabisOrder"("orgId", "licensedLocationId");

-- CreateIndex
CREATE INDEX "NabisOrder_orgId_nabisRetailerId_idx" ON "NabisOrder"("orgId", "nabisRetailerId");

-- CreateIndex
CREATE INDEX "NabisOrder_orgId_orderCreatedDate_idx" ON "NabisOrder"("orgId", "orderCreatedDate");

-- CreateIndex
CREATE INDEX "NabisOrder_orgId_deliveryDate_idx" ON "NabisOrder"("orgId", "deliveryDate");

-- AddForeignKey
ALTER TABLE "MembershipRoleGrant" ADD CONSTRAINT "MembershipRoleGrant_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "OrganizationWorkspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OperationalAccessInvite" ADD CONSTRAINT "OperationalAccessInvite_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "OrganizationWorkspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PolicySnapshot" ADD CONSTRAINT "PolicySnapshot_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "OrganizationWorkspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkerProfile" ADD CONSTRAINT "WorkerProfile_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "OrganizationWorkspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VendorDayRequest" ADD CONSTRAINT "VendorDayRequest_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "OrganizationWorkspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VendorDayRequest" ADD CONSTRAINT "VendorDayRequest_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VendorDayRequest" ADD CONSTRAINT "VendorDayRequest_policySnapshotId_fkey" FOREIGN KEY ("policySnapshotId") REFERENCES "PolicySnapshot"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VendorDayOffer" ADD CONSTRAINT "VendorDayOffer_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "OrganizationWorkspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VendorDayOffer" ADD CONSTRAINT "VendorDayOffer_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "VendorDayRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VendorDayOffer" ADD CONSTRAINT "VendorDayOffer_workerProfileId_fkey" FOREIGN KEY ("workerProfileId") REFERENCES "WorkerProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VendorDayAssignment" ADD CONSTRAINT "VendorDayAssignment_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "OrganizationWorkspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VendorDayAssignment" ADD CONSTRAINT "VendorDayAssignment_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "VendorDayRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VendorDayAssignment" ADD CONSTRAINT "VendorDayAssignment_workerProfileId_fkey" FOREIGN KEY ("workerProfileId") REFERENCES "WorkerProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VendorDayAssignment" ADD CONSTRAINT "VendorDayAssignment_acceptedOfferId_fkey" FOREIGN KEY ("acceptedOfferId") REFERENCES "VendorDayOffer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VendorDayAssignment" ADD CONSTRAINT "VendorDayAssignment_policySnapshotId_fkey" FOREIGN KEY ("policySnapshotId") REFERENCES "PolicySnapshot"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VendorDayExecution" ADD CONSTRAINT "VendorDayExecution_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "OrganizationWorkspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VendorDayExecution" ADD CONSTRAINT "VendorDayExecution_assignmentId_fkey" FOREIGN KEY ("assignmentId") REFERENCES "VendorDayAssignment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VendorDayArtifact" ADD CONSTRAINT "VendorDayArtifact_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "OrganizationWorkspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VendorDayArtifact" ADD CONSTRAINT "VendorDayArtifact_executionId_fkey" FOREIGN KEY ("executionId") REFERENCES "VendorDayExecution"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NabisRetailer" ADD CONSTRAINT "NabisRetailer_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "OrganizationWorkspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NabisRetailer" ADD CONSTRAINT "NabisRetailer_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NabisStoreMetricDaily" ADD CONSTRAINT "NabisStoreMetricDaily_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "OrganizationWorkspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NabisStoreMetricDaily" ADD CONSTRAINT "NabisStoreMetricDaily_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccountIdentityMapping" ADD CONSTRAINT "AccountIdentityMapping_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "OrganizationWorkspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccountIdentityMapping" ADD CONSTRAINT "AccountIdentityMapping_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditEvent" ADD CONSTRAINT "AuditEvent_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "OrganizationWorkspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

