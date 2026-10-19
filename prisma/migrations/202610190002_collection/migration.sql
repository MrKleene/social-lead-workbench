-- CreateTable
CREATE TABLE "CollectionConfig" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "platform" "Platform" NOT NULL,
    "mode" TEXT NOT NULL DEFAULT 'MOCK',
    "keywords" TEXT[],
    "excludeWords" TEXT[],
    "batchLimit" INTEGER NOT NULL DEFAULT 3,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "revision" INTEGER NOT NULL DEFAULT 1,
    "activeRunId" TEXT,
    "failureCount" INTEGER NOT NULL DEFAULT 0,
    "nextAllowedAt" TIMESTAMP(3),
    "pauseReason" TEXT,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CollectionConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CollectionRun" (
    "id" TEXT NOT NULL,
    "configId" TEXT NOT NULL,
    "requestKey" TEXT NOT NULL,
    "revision" INTEGER NOT NULL,
    "snapshot" JSONB NOT NULL,
    "scenario" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'QUEUED',
    "reason" TEXT,
    "cancelRequested" BOOLEAN NOT NULL DEFAULT false,
    "requests" INTEGER NOT NULL DEFAULT 0,
    "observed" INTEGER NOT NULL DEFAULT 0,
    "matched" INTEGER NOT NULL DEFAULT 0,
    "added" INTEGER NOT NULL DEFAULT 0,
    "notices" INTEGER NOT NULL DEFAULT 0,
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CollectionRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MonitorPost" (
    "id" TEXT NOT NULL,
    "configId" TEXT NOT NULL,
    "revision" INTEGER NOT NULL,
    "platformPostId" TEXT NOT NULL,
    "baselineAt" TIMESTAMP(3),
    "coverage" TEXT NOT NULL DEFAULT 'PARTIAL',
    "lastRunId" TEXT,

    CONSTRAINT "MonitorPost_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CommentObservation" (
    "id" TEXT NOT NULL,
    "monitorId" TEXT NOT NULL,
    "platformCommentId" TEXT NOT NULL,
    "state" TEXT NOT NULL DEFAULT 'PRESENT',
    "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastRunId" TEXT NOT NULL,

    CONSTRAINT "CommentObservation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SourceMatch" (
    "id" TEXT NOT NULL,
    "configId" TEXT NOT NULL,
    "revision" INTEGER NOT NULL,
    "runId" TEXT NOT NULL,
    "commentId" TEXT NOT NULL,
    "keywords" TEXT[],
    "classification" TEXT NOT NULL,
    "isBaseline" BOOLEAN NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SourceMatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CollectionNotice" (
    "id" TEXT NOT NULL,
    "commentId" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CollectionNotice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NoticeRead" (
    "noticeId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "readAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NoticeRead_pkey" PRIMARY KEY ("noticeId","userId")
);

-- CreateIndex
CREATE UNIQUE INDEX "CollectionRun_requestKey_key" ON "CollectionRun"("requestKey");

-- CreateIndex
CREATE INDEX "CollectionRun_configId_createdAt_idx" ON "CollectionRun"("configId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "MonitorPost_configId_revision_platformPostId_key" ON "MonitorPost"("configId", "revision", "platformPostId");

-- CreateIndex
CREATE UNIQUE INDEX "CommentObservation_monitorId_platformCommentId_key" ON "CommentObservation"("monitorId", "platformCommentId");

-- CreateIndex
CREATE UNIQUE INDEX "SourceMatch_configId_revision_commentId_key" ON "SourceMatch"("configId", "revision", "commentId");

-- CreateIndex
CREATE UNIQUE INDEX "CollectionNotice_commentId_key" ON "CollectionNotice"("commentId");

-- CreateIndex
CREATE INDEX "CollectionNotice_leadId_createdAt_idx" ON "CollectionNotice"("leadId", "createdAt");

-- AddForeignKey
ALTER TABLE "CollectionRun" ADD CONSTRAINT "CollectionRun_configId_fkey" FOREIGN KEY ("configId") REFERENCES "CollectionConfig"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MonitorPost" ADD CONSTRAINT "MonitorPost_configId_fkey" FOREIGN KEY ("configId") REFERENCES "CollectionConfig"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommentObservation" ADD CONSTRAINT "CommentObservation_monitorId_fkey" FOREIGN KEY ("monitorId") REFERENCES "MonitorPost"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SourceMatch" ADD CONSTRAINT "SourceMatch_configId_fkey" FOREIGN KEY ("configId") REFERENCES "CollectionConfig"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SourceMatch" ADD CONSTRAINT "SourceMatch_runId_fkey" FOREIGN KEY ("runId") REFERENCES "CollectionRun"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SourceMatch" ADD CONSTRAINT "SourceMatch_commentId_fkey" FOREIGN KEY ("commentId") REFERENCES "SourceComment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CollectionNotice" ADD CONSTRAINT "CollectionNotice_commentId_fkey" FOREIGN KEY ("commentId") REFERENCES "SourceComment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CollectionNotice" ADD CONSTRAINT "CollectionNotice_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NoticeRead" ADD CONSTRAINT "NoticeRead_noticeId_fkey" FOREIGN KEY ("noticeId") REFERENCES "CollectionNotice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NoticeRead" ADD CONSTRAINT "NoticeRead_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

