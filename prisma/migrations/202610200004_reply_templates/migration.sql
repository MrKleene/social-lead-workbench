CREATE TYPE "ReplyChannel" AS ENUM ('COMMENT', 'DM');
CREATE TABLE "ReplyTemplate" (
  "id" TEXT NOT NULL, "name" TEXT NOT NULL, "channel" "ReplyChannel" NOT NULL, "body" TEXT NOT NULL,
  "version" INTEGER NOT NULL DEFAULT 0, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL, CONSTRAINT "ReplyTemplate_pkey" PRIMARY KEY ("id")
);
ALTER TABLE "CollectionConfig" ADD COLUMN "defaultReplyTemplateId" TEXT;
ALTER TABLE "CollectionConfig" ADD CONSTRAINT "CollectionConfig_defaultReplyTemplateId_fkey" FOREIGN KEY ("defaultReplyTemplateId") REFERENCES "ReplyTemplate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "CollectionConfig_defaultReplyTemplateId_idx" ON "CollectionConfig"("defaultReplyTemplateId");
