-- CreateEnum
CREATE TYPE "WorkerSkillTier" AS ENUM ('TRAINEE', 'STANDARD', 'ALL_STAR');

-- CreateEnum
CREATE TYPE "CalendarConnectionProvider" AS ENUM ('GOOGLE', 'APPLE');

-- CreateEnum
CREATE TYPE "CalendarConnectionStatus" AS ENUM ('ACTIVE', 'STALE', 'ERROR', 'REVOKED', 'MANUAL_ONLY');

-- CreateEnum
CREATE TYPE "PayrollBatchStatus" AS ENUM ('OPEN', 'CLOSED', 'EXPORTED', 'PAID');

-- CreateEnum
CREATE TYPE "PayrollLineStatus" AS ENUM ('PENDING', 'DISPUTED', 'APPROVED', 'PAID', 'VOID');

-- CreateEnum
CREATE TYPE "NotificationCategory" AS ENUM ('OFFERS', 'ASSIGNMENTS', 'APPROVALS', 'PAYROLL', 'SYSTEM_ALERTS', 'EVENT_RECAPS', 'EXCEPTIONS');

-- AlterTable
ALTER TABLE "Account" ADD COLUMN     "vendorDaySuppressed" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "vendorDaySuppressionReason" TEXT;

-- AlterTable
ALTER TABLE "VendorDayRequest" ADD COLUMN     "preferredWorkerProfileId" TEXT,
ADD COLUMN     "repApprovalRequired" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "repApprovedAt" TIMESTAMP(3),
ADD COLUMN     "repApprovedByClerkUserId" TEXT;

-- AlterTable
ALTER TABLE "WorkerProfile" ADD COLUMN     "employerId" TEXT,
ADD COLUMN     "tier" "WorkerSkillTier" NOT NULL DEFAULT 'STANDARD',
ADD COLUMN     "travelRadiusMiles" DOUBLE PRECISION;

-- CreateTable
CREATE TABLE "Employer" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isServiceCompany" BOOLEAN NOT NULL DEFAULT false,
    "flatEventRateDollars" DECIMAL(10,2),
    "mileageRateDollars" DECIMAL(10,2),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Employer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkerAvailabilityRule" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "workerProfileId" TEXT NOT NULL,
    "dayOfWeek" INTEGER NOT NULL,
    "startMinute" INTEGER NOT NULL,
    "endMinute" INTEGER NOT NULL,
    "timezone" TEXT NOT NULL DEFAULT 'America/New_York',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkerAvailabilityRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkerAvailabilityBlock" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "workerProfileId" TEXT NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "reason" TEXT,
    "source" TEXT NOT NULL DEFAULT 'manual',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkerAvailabilityBlock_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkerCalendarConnection" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "workerProfileId" TEXT NOT NULL,
    "provider" "CalendarConnectionProvider" NOT NULL,
    "calendarEmail" TEXT,
    "status" "CalendarConnectionStatus" NOT NULL DEFAULT 'MANUAL_ONLY',
    "lastSuccessfulSyncAt" TIMESTAMP(3),
    "lastAttemptAt" TIMESTAMP(3),
    "accessTokenExpiresAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkerCalendarConnection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkerGearItem" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "workerProfileId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "notes" TEXT,
    "needsRestock" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkerGearItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkerCertification" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "workerProfileId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "certifiedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkerCertification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkerBrandTraining" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "workerProfileId" TEXT NOT NULL,
    "brandName" TEXT NOT NULL,
    "level" TEXT,
    "trainedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkerBrandTraining_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkerSkillTag" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "workerProfileId" TEXT NOT NULL,
    "tag" TEXT NOT NULL,
    "label" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WorkerSkillTag_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkerReview" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "workerProfileId" TEXT NOT NULL,
    "accountId" TEXT,
    "rating" INTEGER NOT NULL,
    "reviewerName" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WorkerReview_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PayrollBatch" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "startsOn" TIMESTAMP(3) NOT NULL,
    "endsOn" TIMESTAMP(3) NOT NULL,
    "status" "PayrollBatchStatus" NOT NULL DEFAULT 'OPEN',
    "exportedAt" TIMESTAMP(3),
    "paidAt" TIMESTAMP(3),
    "createdByClerkUserId" TEXT,
    "createdByEmail" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PayrollBatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PayrollLineItem" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "assignmentId" TEXT NOT NULL,
    "workerProfileId" TEXT NOT NULL,
    "employerId" TEXT,
    "batchId" TEXT,
    "status" "PayrollLineStatus" NOT NULL DEFAULT 'PENDING',
    "eventMinutes" INTEGER NOT NULL DEFAULT 0,
    "travelMinutes" INTEGER NOT NULL DEFAULT 0,
    "eventPayAmount" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "travelPayAmount" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "totalPayAmount" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "disputedReason" TEXT,
    "approvedAt" TIMESTAMP(3),
    "paidAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PayrollLineItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VendorDayRoiSnapshot" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "assignmentId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "workerProfileId" TEXT,
    "employerId" TEXT,
    "windowDays" INTEGER NOT NULL DEFAULT 30,
    "preOrderCount" INTEGER NOT NULL DEFAULT 0,
    "postOrderCount" INTEGER NOT NULL DEFAULT 0,
    "preRevenue" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "postRevenue" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "revenueLift" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "orderCountLift" INTEGER NOT NULL DEFAULT 0,
    "firstReorderLagDays" INTEGER,
    "pennyBundleCreditExposure" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "laborCost" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "travelCost" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "serviceCompanyCost" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "roiMultiple" DECIMAL(10,4),
    "territoryLabel" TEXT,
    "brandLabel" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VendorDayRoiSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NotificationPreference" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "workerProfileId" TEXT,
    "clerkUserId" TEXT,
    "email" TEXT,
    "category" "NotificationCategory" NOT NULL,
    "emailEnabled" BOOLEAN NOT NULL DEFAULT true,
    "inAppEnabled" BOOLEAN NOT NULL DEFAULT true,
    "quietHoursEnabled" BOOLEAN NOT NULL DEFAULT true,
    "quietHoursStartMinute" INTEGER NOT NULL DEFAULT 1320,
    "quietHoursEndMinute" INTEGER NOT NULL DEFAULT 420,
    "timezone" TEXT NOT NULL DEFAULT 'America/New_York',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NotificationPreference_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Employer_orgId_isServiceCompany_idx" ON "Employer"("orgId", "isServiceCompany");

-- CreateIndex
CREATE UNIQUE INDEX "Employer_orgId_name_key" ON "Employer"("orgId", "name");

-- CreateIndex
CREATE INDEX "WorkerAvailabilityRule_orgId_workerProfileId_dayOfWeek_acti_idx" ON "WorkerAvailabilityRule"("orgId", "workerProfileId", "dayOfWeek", "active");

-- CreateIndex
CREATE INDEX "WorkerAvailabilityBlock_orgId_workerProfileId_startsAt_ends_idx" ON "WorkerAvailabilityBlock"("orgId", "workerProfileId", "startsAt", "endsAt");

-- CreateIndex
CREATE INDEX "WorkerCalendarConnection_orgId_status_updatedAt_idx" ON "WorkerCalendarConnection"("orgId", "status", "updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "WorkerCalendarConnection_workerProfileId_provider_key" ON "WorkerCalendarConnection"("workerProfileId", "provider");

-- CreateIndex
CREATE INDEX "WorkerGearItem_orgId_workerProfileId_needsRestock_idx" ON "WorkerGearItem"("orgId", "workerProfileId", "needsRestock");

-- CreateIndex
CREATE UNIQUE INDEX "WorkerGearItem_workerProfileId_name_key" ON "WorkerGearItem"("workerProfileId", "name");

-- CreateIndex
CREATE INDEX "WorkerCertification_orgId_workerProfileId_code_idx" ON "WorkerCertification"("orgId", "workerProfileId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "WorkerCertification_workerProfileId_code_key" ON "WorkerCertification"("workerProfileId", "code");

-- CreateIndex
CREATE INDEX "WorkerBrandTraining_orgId_workerProfileId_brandName_idx" ON "WorkerBrandTraining"("orgId", "workerProfileId", "brandName");

-- CreateIndex
CREATE UNIQUE INDEX "WorkerBrandTraining_workerProfileId_brandName_key" ON "WorkerBrandTraining"("workerProfileId", "brandName");

-- CreateIndex
CREATE INDEX "WorkerSkillTag_orgId_workerProfileId_tag_idx" ON "WorkerSkillTag"("orgId", "workerProfileId", "tag");

-- CreateIndex
CREATE UNIQUE INDEX "WorkerSkillTag_workerProfileId_tag_key" ON "WorkerSkillTag"("workerProfileId", "tag");

-- CreateIndex
CREATE INDEX "WorkerReview_orgId_workerProfileId_createdAt_idx" ON "WorkerReview"("orgId", "workerProfileId", "createdAt");

-- CreateIndex
CREATE INDEX "WorkerReview_orgId_accountId_createdAt_idx" ON "WorkerReview"("orgId", "accountId", "createdAt");

-- CreateIndex
CREATE INDEX "PayrollBatch_orgId_status_startsOn_idx" ON "PayrollBatch"("orgId", "status", "startsOn");

-- CreateIndex
CREATE UNIQUE INDEX "PayrollBatch_orgId_startsOn_endsOn_key" ON "PayrollBatch"("orgId", "startsOn", "endsOn");

-- CreateIndex
CREATE UNIQUE INDEX "PayrollLineItem_assignmentId_key" ON "PayrollLineItem"("assignmentId");

-- CreateIndex
CREATE INDEX "PayrollLineItem_orgId_workerProfileId_status_idx" ON "PayrollLineItem"("orgId", "workerProfileId", "status");

-- CreateIndex
CREATE INDEX "PayrollLineItem_orgId_batchId_status_idx" ON "PayrollLineItem"("orgId", "batchId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "VendorDayRoiSnapshot_assignmentId_key" ON "VendorDayRoiSnapshot"("assignmentId");

-- CreateIndex
CREATE INDEX "VendorDayRoiSnapshot_orgId_accountId_createdAt_idx" ON "VendorDayRoiSnapshot"("orgId", "accountId", "createdAt");

-- CreateIndex
CREATE INDEX "VendorDayRoiSnapshot_orgId_workerProfileId_createdAt_idx" ON "VendorDayRoiSnapshot"("orgId", "workerProfileId", "createdAt");

-- CreateIndex
CREATE INDEX "NotificationPreference_orgId_workerProfileId_category_idx" ON "NotificationPreference"("orgId", "workerProfileId", "category");

-- CreateIndex
CREATE UNIQUE INDEX "NotificationPreference_orgId_clerkUserId_category_key" ON "NotificationPreference"("orgId", "clerkUserId", "category");

-- CreateIndex
CREATE INDEX "VendorDayRequest_orgId_preferredWorkerProfileId_idx" ON "VendorDayRequest"("orgId", "preferredWorkerProfileId");

-- AddForeignKey
ALTER TABLE "Employer" ADD CONSTRAINT "Employer_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "OrganizationWorkspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkerProfile" ADD CONSTRAINT "WorkerProfile_employerId_fkey" FOREIGN KEY ("employerId") REFERENCES "Employer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkerAvailabilityRule" ADD CONSTRAINT "WorkerAvailabilityRule_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "OrganizationWorkspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkerAvailabilityRule" ADD CONSTRAINT "WorkerAvailabilityRule_workerProfileId_fkey" FOREIGN KEY ("workerProfileId") REFERENCES "WorkerProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkerAvailabilityBlock" ADD CONSTRAINT "WorkerAvailabilityBlock_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "OrganizationWorkspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkerAvailabilityBlock" ADD CONSTRAINT "WorkerAvailabilityBlock_workerProfileId_fkey" FOREIGN KEY ("workerProfileId") REFERENCES "WorkerProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkerCalendarConnection" ADD CONSTRAINT "WorkerCalendarConnection_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "OrganizationWorkspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkerCalendarConnection" ADD CONSTRAINT "WorkerCalendarConnection_workerProfileId_fkey" FOREIGN KEY ("workerProfileId") REFERENCES "WorkerProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkerGearItem" ADD CONSTRAINT "WorkerGearItem_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "OrganizationWorkspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkerGearItem" ADD CONSTRAINT "WorkerGearItem_workerProfileId_fkey" FOREIGN KEY ("workerProfileId") REFERENCES "WorkerProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkerCertification" ADD CONSTRAINT "WorkerCertification_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "OrganizationWorkspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkerCertification" ADD CONSTRAINT "WorkerCertification_workerProfileId_fkey" FOREIGN KEY ("workerProfileId") REFERENCES "WorkerProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkerBrandTraining" ADD CONSTRAINT "WorkerBrandTraining_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "OrganizationWorkspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkerBrandTraining" ADD CONSTRAINT "WorkerBrandTraining_workerProfileId_fkey" FOREIGN KEY ("workerProfileId") REFERENCES "WorkerProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkerSkillTag" ADD CONSTRAINT "WorkerSkillTag_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "OrganizationWorkspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkerSkillTag" ADD CONSTRAINT "WorkerSkillTag_workerProfileId_fkey" FOREIGN KEY ("workerProfileId") REFERENCES "WorkerProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkerReview" ADD CONSTRAINT "WorkerReview_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "OrganizationWorkspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkerReview" ADD CONSTRAINT "WorkerReview_workerProfileId_fkey" FOREIGN KEY ("workerProfileId") REFERENCES "WorkerProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkerReview" ADD CONSTRAINT "WorkerReview_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VendorDayRequest" ADD CONSTRAINT "VendorDayRequest_preferredWorkerProfileId_fkey" FOREIGN KEY ("preferredWorkerProfileId") REFERENCES "WorkerProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayrollBatch" ADD CONSTRAINT "PayrollBatch_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "OrganizationWorkspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayrollLineItem" ADD CONSTRAINT "PayrollLineItem_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "OrganizationWorkspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayrollLineItem" ADD CONSTRAINT "PayrollLineItem_assignmentId_fkey" FOREIGN KEY ("assignmentId") REFERENCES "VendorDayAssignment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayrollLineItem" ADD CONSTRAINT "PayrollLineItem_workerProfileId_fkey" FOREIGN KEY ("workerProfileId") REFERENCES "WorkerProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayrollLineItem" ADD CONSTRAINT "PayrollLineItem_employerId_fkey" FOREIGN KEY ("employerId") REFERENCES "Employer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayrollLineItem" ADD CONSTRAINT "PayrollLineItem_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "PayrollBatch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VendorDayRoiSnapshot" ADD CONSTRAINT "VendorDayRoiSnapshot_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "OrganizationWorkspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VendorDayRoiSnapshot" ADD CONSTRAINT "VendorDayRoiSnapshot_assignmentId_fkey" FOREIGN KEY ("assignmentId") REFERENCES "VendorDayAssignment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VendorDayRoiSnapshot" ADD CONSTRAINT "VendorDayRoiSnapshot_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VendorDayRoiSnapshot" ADD CONSTRAINT "VendorDayRoiSnapshot_workerProfileId_fkey" FOREIGN KEY ("workerProfileId") REFERENCES "WorkerProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VendorDayRoiSnapshot" ADD CONSTRAINT "VendorDayRoiSnapshot_employerId_fkey" FOREIGN KEY ("employerId") REFERENCES "Employer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotificationPreference" ADD CONSTRAINT "NotificationPreference_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "OrganizationWorkspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotificationPreference" ADD CONSTRAINT "NotificationPreference_workerProfileId_fkey" FOREIGN KEY ("workerProfileId") REFERENCES "WorkerProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

