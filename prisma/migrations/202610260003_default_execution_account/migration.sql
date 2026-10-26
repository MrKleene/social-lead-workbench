ALTER TABLE "CollectionConfig" ADD COLUMN "defaultExecutionAccountId" TEXT;
CREATE INDEX "CollectionConfig_defaultExecutionAccountId_idx" ON "CollectionConfig"("defaultExecutionAccountId");
ALTER TABLE "CollectionConfig" ADD CONSTRAINT "CollectionConfig_defaultExecutionAccountId_fkey" FOREIGN KEY ("defaultExecutionAccountId") REFERENCES "PlatformAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
