CREATE TABLE "AutomationPreferences" ("id" TEXT NOT NULL DEFAULT 'workspace', "version" INTEGER NOT NULL DEFAULT 1, "configId" TEXT, "policyId" TEXT, CONSTRAINT "AutomationPreferences_pkey" PRIMARY KEY ("id"));
ALTER TABLE "AutoContactRule" ADD COLUMN "channels" "ReplyChannel"[] NOT NULL DEFAULT ARRAY[]::"ReplyChannel"[], ADD COLUMN "templateId" TEXT, ADD COLUMN "templateVersion" INTEGER;
UPDATE "AutoContactRule" SET "channels"=ARRAY["channel"];
