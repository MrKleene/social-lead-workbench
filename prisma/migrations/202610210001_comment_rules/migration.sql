ALTER TABLE "CollectionConfig" ADD COLUMN "commentRules" JSONB;
ALTER TABLE "CollectionRun" ADD COLUMN "metrics" JSONB;
ALTER TABLE "SourceMatch" ADD COLUMN "assessment" JSONB;
