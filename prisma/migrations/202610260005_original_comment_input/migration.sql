ALTER TABLE "ModelSettings" ADD COLUMN "consentInputPolicy" TEXT;
ALTER TABLE "AutoReviewJob" ADD COLUMN "inputPolicyVersion" TEXT NOT NULL DEFAULT 'contact-redaction-v1';
UPDATE "ModelSettings" SET consent=false, version=version+1;
UPDATE "CommentReviewPolicy" SET "autoEnabled"=false, "autoModelVersion"=NULL, "autoActorId"=NULL, version=version+1 WHERE "autoEnabled";
UPDATE "AutoReviewJob" SET status='CANCELLED', reason='输入策略已变化；旧任务未获评论原文外发授权', "updatedAt"=CURRENT_TIMESTAMP WHERE status IN ('PENDING','PROCESSING');
UPDATE "ManualReviewJob" SET status='INVALIDATED', reason='输入策略已变化；请重新预览并确认评论原文外发', "updatedAt"=CURRENT_TIMESTAMP WHERE status IN ('PREVIEW','PENDING','PROCESSING');
