ALTER TABLE "GmailConnection" ADD COLUMN "sentCopiesEnabled" BOOLEAN NOT NULL DEFAULT false;
CREATE TABLE "MailjetDispatch" (
 "id" TEXT NOT NULL PRIMARY KEY,
 "orgId" TEXT NOT NULL,
 "requestHash" TEXT NOT NULL,
 "fromEmail" TEXT NOT NULL,
 "recipient" TEXT NOT NULL,
 "subject" TEXT NOT NULL,
 "messageId" TEXT NOT NULL,
 "encryptedRaw" TEXT,
 "sendState" TEXT NOT NULL DEFAULT 'SENDING',
 "providerMessageId" TEXT,
 "copyState" TEXT NOT NULL DEFAULT 'WAITING',
 "gmailMessageId" TEXT,
 "copyAttemptAt" TIMESTAMP(3),
 "sentAt" TIMESTAMP(3),
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "updatedAt" TIMESTAMP(3) NOT NULL,
 CONSTRAINT "MailjetDispatch_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "OrganizationWorkspace"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "MailjetDispatch_messageId_key" ON "MailjetDispatch"("messageId");
CREATE INDEX "MailjetDispatch_orgId_fromEmail_createdAt_idx" ON "MailjetDispatch"("orgId", "fromEmail", "createdAt");
