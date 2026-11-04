-- Additive frozen per-channel content; historical records are unchanged.
ALTER TABLE "AutoContactRule" ADD COLUMN "channelPlans" JSONB NOT NULL DEFAULT '[]';
DROP INDEX "AutoContactJob_ruleId_ruleVersion_reviewId_key";
CREATE UNIQUE INDEX "AutoContactJob_ruleId_ruleVersion_reviewId_channel_key" ON "AutoContactJob"("ruleId","ruleVersion","reviewId","channel");

CREATE OR REPLACE VIEW history_display."AutoContactRule" AS SELECT t."channels"::text::history_display."ReplyChannel"[] AS "channels",t."templateId",t."templateVersion",t."accountLimits",t."model",t."id",t."platform"::text::history_display."Platform" AS "platform",t."policyId",t."policyRevision",t."threshold",t."channel"::text::history_display."ReplyChannel" AS "channel",t."content",t."accountIds",t."enabled",t."version",t."authorizedBy",t."authorizedAt",t."authorizedHash",t."mode",t."createdAt",t."updatedAt",t."channelPlans" FROM public."AutoContactRule" t;
