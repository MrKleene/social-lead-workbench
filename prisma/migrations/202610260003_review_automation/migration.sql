-- Legacy enabled/consent are deliberately NOT migrated into automatic consent.
ALTER TABLE "CommentReviewPolicy" ADD COLUMN "autoEnabled" BOOLEAN NOT NULL DEFAULT false,
 ADD COLUMN "autoModelVersion" INTEGER, ADD COLUMN "autoActorId" TEXT;
CREATE TABLE "AutoReviewJob" (
 "id" TEXT PRIMARY KEY, "policyId" TEXT NOT NULL REFERENCES "CommentReviewPolicy"("id") ON DELETE CASCADE ON UPDATE CASCADE,
 "policyVersion" INTEGER NOT NULL, "postId" TEXT NOT NULL, "runId" TEXT NOT NULL,
 "status" TEXT NOT NULL DEFAULT 'PENDING', "reason" TEXT, "processed" INTEGER NOT NULL DEFAULT 0,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL
);
CREATE UNIQUE INDEX "AutoReviewJob_policyId_postId_runId_key" ON "AutoReviewJob"("policyId","postId","runId");
CREATE INDEX "AutoReviewJob_status_createdAt_idx" ON "AutoReviewJob"("status","createdAt");

ALTER TABLE "SemanticModelCall" ADD COLUMN "trigger" TEXT NOT NULL DEFAULT 'MANUAL', ADD COLUMN "configurationVersion" INTEGER;
