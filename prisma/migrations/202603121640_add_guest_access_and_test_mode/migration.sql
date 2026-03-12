ALTER TYPE "Role" ADD VALUE IF NOT EXISTS 'GUEST_VIEWER';

CREATE TYPE "GuestInviteStatus" AS ENUM ('PENDING', 'ACCEPTED', 'REVOKED');

ALTER TABLE "Membership"
ADD COLUMN "testModeEnabled" BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE "GuestAccessInvite" (
  "id" TEXT NOT NULL,
  "orgId" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "status" "GuestInviteStatus" NOT NULL DEFAULT 'PENDING',
  "invitedByClerkUserId" TEXT NOT NULL,
  "invitedByEmail" TEXT,
  "note" TEXT,
  "acceptedAt" TIMESTAMP(3),
  "acceptedByClerkUserId" TEXT,
  "revokedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "GuestAccessInvite_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "GuestAccessInvite_orgId_email_key" ON "GuestAccessInvite"("orgId", "email");
CREATE INDEX "GuestAccessInvite_orgId_status_createdAt_idx" ON "GuestAccessInvite"("orgId", "status", "createdAt");
CREATE INDEX "GuestAccessInvite_email_status_idx" ON "GuestAccessInvite"("email", "status");

ALTER TABLE "GuestAccessInvite"
ADD CONSTRAINT "GuestAccessInvite_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "OrganizationWorkspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
