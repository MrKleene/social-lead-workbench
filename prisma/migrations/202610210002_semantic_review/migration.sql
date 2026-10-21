ALTER TABLE "CollectionConfig" ADD COLUMN "semanticRules" JSONB;
CREATE TABLE "SemanticReview" (
 "id" TEXT PRIMARY KEY, "configId" TEXT NOT NULL REFERENCES "CollectionConfig"("id") ON DELETE CASCADE ON UPDATE CASCADE,
 "runId" TEXT NOT NULL REFERENCES "CollectionRun"("id") ON DELETE CASCADE ON UPDATE CASCADE,
 "leaseUntil" TIMESTAMP(3), "revision" INTEGER NOT NULL, "snapshotHash" TEXT NOT NULL, "platform" "Platform" NOT NULL, "platformUserId" TEXT NOT NULL,
 "snapshot" JSONB NOT NULL, "rules" JSONB NOT NULL, "state" TEXT NOT NULL DEFAULT 'UNCONFIGURED',
 "score" INTEGER CHECK ("score" BETWEEN 0 AND 100), "reason" TEXT, "context" TEXT NOT NULL DEFAULT 'INSUFFICIENT',
 "result" JSONB, "provider" TEXT NOT NULL DEFAULT 'NONE', "modelVersion" TEXT, "isDemo" BOOLEAN NOT NULL,
 "reviewStatus" TEXT NOT NULL DEFAULT 'PENDING', "reviewNote" TEXT, "reviewedBy" TEXT, "reviewedAt" TIMESTAMP(3),
 "version" INTEGER NOT NULL DEFAULT 0, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL
);
CREATE UNIQUE INDEX "SemanticReview_configId_revision_snapshotHash_key" ON "SemanticReview"("configId","revision","snapshotHash");
CREATE INDEX "SemanticReview_configId_createdAt_idx" ON "SemanticReview"("configId","createdAt");
CREATE INDEX "SemanticReview_platform_platformUserId_idx" ON "SemanticReview"("platform","platformUserId");
