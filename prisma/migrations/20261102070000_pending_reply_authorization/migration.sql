ALTER TABLE "AutoContactJob" ADD COLUMN "manualRequestId" TEXT;
CREATE TABLE "ManualReplyRequest" (
 "id" TEXT NOT NULL PRIMARY KEY, "actorId" TEXT NOT NULL, "accountId" TEXT NOT NULL,
 "accountVersion" INTEGER NOT NULL, "tokenHash" TEXT NOT NULL, "scope" JSONB NOT NULL,
 "expiresAt" TIMESTAMP(3) NOT NULL, "confirmedAt" TIMESTAMP(3), "submissionKey" TEXT,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX "ManualReplyRequest_submissionKey_key" ON "ManualReplyRequest"("submissionKey");
CREATE INDEX "ManualReplyRequest_expiresAt_idx" ON "ManualReplyRequest"("expiresAt");
