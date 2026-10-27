-- Additive state; existing posts remain unclassified. No historical status inference.
ALTER TABLE "ContactAttempt" ADD COLUMN "accountIdSnapshot" TEXT, ADD COLUMN "historySnapshot" JSONB;
ALTER TABLE "AutoContactJob" ADD COLUMN "availabilityVersion" INTEGER NOT NULL DEFAULT 0, ADD COLUMN "sourceSnapshot" JSONB;
CREATE TABLE "PostAvailability" (
 "platform" "Platform" NOT NULL, "postId" TEXT NOT NULL, "state" TEXT NOT NULL DEFAULT 'UNKNOWN', "reason" TEXT NOT NULL DEFAULT 'NOT_CHECKED',
 "version" INTEGER NOT NULL DEFAULT 1, "checkedAt" TIMESTAMP(3) NOT NULL, "source" TEXT NOT NULL, "evidence" JSONB NOT NULL, "invalidatedAt" TIMESTAMP(3),
 PRIMARY KEY ("platform","postId"), CHECK (state IN ('UNKNOWN','NORMAL','UNAVAILABLE','CONFIRMED_DELETED'))
);
CREATE TABLE "PostAvailabilityEvent" (
 "id" TEXT NOT NULL PRIMARY KEY, "platform" "Platform" NOT NULL, "postId" TEXT NOT NULL, "version" INTEGER NOT NULL,
 "state" TEXT NOT NULL, "reason" TEXT NOT NULL, "checkedAt" TIMESTAMP(3) NOT NULL, "source" TEXT NOT NULL, "evidence" JSONB NOT NULL, "actorId" TEXT
);
CREATE UNIQUE INDEX "PostAvailabilityEvent_platform_postId_version_key" ON "PostAvailabilityEvent"("platform","postId","version");
ALTER TABLE "ContactLedger" DROP CONSTRAINT "ContactLedger_identityId_fkey", ADD CONSTRAINT "ContactLedger_identityId_fkey" FOREIGN KEY ("identityId") REFERENCES "PlatformIdentity"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ContactAttempt" DROP CONSTRAINT "ContactAttempt_ledgerId_fkey", ADD CONSTRAINT "ContactAttempt_ledgerId_fkey" FOREIGN KEY ("ledgerId") REFERENCES "ContactLedger"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SemanticReview" DROP CONSTRAINT "SemanticReview_captureId_fkey", ADD CONSTRAINT "SemanticReview_captureId_fkey" FOREIGN KEY ("captureId") REFERENCES "CapturedComment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SemanticReview" DROP CONSTRAINT "SemanticReview_configId_fkey", ADD CONSTRAINT "SemanticReview_configId_fkey" FOREIGN KEY ("configId") REFERENCES "CollectionConfig"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SemanticReview" DROP CONSTRAINT "SemanticReview_runId_fkey", ADD CONSTRAINT "SemanticReview_runId_fkey" FOREIGN KEY ("runId") REFERENCES "CollectionRun"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CapturedPost" DROP CONSTRAINT "CapturedPost_configId_fkey", ADD CONSTRAINT "CapturedPost_configId_fkey" FOREIGN KEY ("configId") REFERENCES "CollectionConfig"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CapturedPost" DROP CONSTRAINT "CapturedPost_runId_fkey", ADD CONSTRAINT "CapturedPost_runId_fkey" FOREIGN KEY ("runId") REFERENCES "CollectionRun"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CapturedComment" DROP CONSTRAINT "CapturedComment_configId_fkey", ADD CONSTRAINT "CapturedComment_configId_fkey" FOREIGN KEY ("configId") REFERENCES "CollectionConfig"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CapturedComment" DROP CONSTRAINT "CapturedComment_runId_fkey", ADD CONSTRAINT "CapturedComment_runId_fkey" FOREIGN KEY ("runId") REFERENCES "CollectionRun"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CapturedComment" DROP CONSTRAINT "CapturedComment_postId_fkey", ADD CONSTRAINT "CapturedComment_postId_fkey" FOREIGN KEY ("postId") REFERENCES "CapturedPost"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
