ALTER TABLE "SemanticReview" ADD COLUMN "evaluationInput" JSONB;
CREATE TABLE "SemanticModelCall" (
 "id" TEXT PRIMARY KEY, "requestKey" TEXT NOT NULL UNIQUE, "previewHash" TEXT NOT NULL,
 "configId" TEXT NOT NULL REFERENCES "CollectionConfig"("id") ON DELETE CASCADE ON UPDATE CASCADE,
 "actorId" TEXT NOT NULL, "status" TEXT NOT NULL, "errorCode" TEXT,
 "rows" INTEGER NOT NULL, "inputTokens" INTEGER, "outputTokens" INTEGER,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "finishedAt" TIMESTAMP(3), "reservedUntil" TIMESTAMP(3) NOT NULL
);
CREATE INDEX "SemanticModelCall_createdAt_idx" ON "SemanticModelCall"("createdAt");
