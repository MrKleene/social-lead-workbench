-- Additive migration: existing search, source, Key, accounts, leads and rules remain.
ALTER TABLE "CollectionConfig" ADD COLUMN "legacyMatchingEnabled" BOOLEAN NOT NULL DEFAULT false;
CREATE TABLE "CommentReviewPolicy" ("id" TEXT PRIMARY KEY,"name" TEXT NOT NULL,"target" TEXT NOT NULL,"revision" INTEGER NOT NULL DEFAULT 1,"version" INTEGER NOT NULL DEFAULT 1,"enabled" BOOLEAN NOT NULL DEFAULT false,"createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,"updatedAt" TIMESTAMP(3) NOT NULL);
CREATE TABLE "CommentReviewPolicyVersion" ("policyId" TEXT NOT NULL,"revision" INTEGER NOT NULL,"target" TEXT NOT NULL,"createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,PRIMARY KEY("policyId","revision"),FOREIGN KEY("policyId") REFERENCES "CommentReviewPolicy"("id") ON DELETE RESTRICT ON UPDATE CASCADE);
-- Preserve existing targets as separate disabled policies. Never infer or auto-enable one.
INSERT INTO "CommentReviewPolicy" ("id","name","target","updatedAt") SELECT 'legacy-'||"id","name", "semanticRules"->>'target', CURRENT_TIMESTAMP FROM "CollectionConfig" WHERE jsonb_typeof("semanticRules")='object' AND length(btrim("semanticRules"->>'target')) BETWEEN 10 AND 1500;
INSERT INTO "CommentReviewPolicyVersion" ("policyId","revision","target") SELECT "id",1,"target" FROM "CommentReviewPolicy";
ALTER TABLE "SemanticReview" ADD COLUMN "policyId" TEXT, ADD COLUMN "policyRevision" INTEGER, ADD COLUMN "sourceContentHash" TEXT;
ALTER TABLE "SemanticReview" ADD CONSTRAINT "SemanticReview_policyId_policyRevision_fkey" FOREIGN KEY ("policyId","policyRevision") REFERENCES "CommentReviewPolicyVersion"("policyId","revision") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "SemanticReview_policyId_policyRevision_sourceContentHash_se_idx" ON "SemanticReview"("policyId","policyRevision","sourceContentHash","selectedModel");
ALTER TABLE "SemanticModelCall" ALTER COLUMN "configId" DROP NOT NULL;
ALTER TABLE "SemanticModelCall" ADD COLUMN "policyId" TEXT, ADD COLUMN "policyRevision" INTEGER;
ALTER TABLE "SemanticModelCall" ADD CONSTRAINT "SemanticModelCall_policyId_policyRevision_fkey" FOREIGN KEY ("policyId","policyRevision") REFERENCES "CommentReviewPolicyVersion"("policyId","revision") ON DELETE RESTRICT ON UPDATE CASCADE;
