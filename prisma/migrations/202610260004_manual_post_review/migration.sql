CREATE TABLE "ManualReviewJob" (
 "id" TEXT NOT NULL, "policyId" TEXT NOT NULL, "policyRevision" INTEGER NOT NULL,
 "modelVersion" INTEGER NOT NULL, "model" TEXT NOT NULL, "priceVersion" TEXT NOT NULL,
 "actorId" TEXT NOT NULL, "postId" TEXT NOT NULL, "title" TEXT NOT NULL, "coverage" TEXT NOT NULL,
 "scopeHash" TEXT NOT NULL, "items" JSONB NOT NULL, "preview" JSONB NOT NULL,
 "status" TEXT NOT NULL DEFAULT 'PREVIEW', "reason" TEXT, "requestKey" TEXT,
 "batchIds" TEXT[] DEFAULT ARRAY[]::TEXT[], "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "updatedAt" TIMESTAMP(3) NOT NULL, CONSTRAINT "ManualReviewJob_pkey" PRIMARY KEY ("id"),
 CONSTRAINT "ManualReviewJob_policyId_fkey" FOREIGN KEY ("policyId") REFERENCES "CommentReviewPolicy"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "ManualReviewJob_requestKey_key" ON "ManualReviewJob"("requestKey");
CREATE INDEX "ManualReviewJob_status_createdAt_idx" ON "ManualReviewJob"("status", "createdAt");
CREATE INDEX "ManualReviewJob_scopeHash_actorId_idx" ON "ManualReviewJob"("scopeHash", "actorId");
