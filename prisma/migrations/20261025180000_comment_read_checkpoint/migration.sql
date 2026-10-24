CREATE TABLE "CommentReadCheckpoint" (
 "id" TEXT NOT NULL, "configId" TEXT NOT NULL, "platformPostId" TEXT NOT NULL,
 "accountId" TEXT NOT NULL, "deviceId" TEXT NOT NULL, "revision" INTEGER NOT NULL,
 "fence" INTEGER NOT NULL DEFAULT 0, "ownerRunId" TEXT, "expiresAt" TIMESTAMP(3),
 "sequence" INTEGER NOT NULL DEFAULT 0, "state" TEXT NOT NULL DEFAULT 'PARTIAL',
 "checkpoint" JSONB NOT NULL, "updatedAt" TIMESTAMP(3) NOT NULL,
 CONSTRAINT "CommentReadCheckpoint_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "CommentReadCheckpoint_configId_platformPostId_accountId_device_key" ON "CommentReadCheckpoint"("configId","platformPostId","accountId","deviceId");
CREATE INDEX "CommentReadCheckpoint_ownerRunId_idx" ON "CommentReadCheckpoint"("ownerRunId");
