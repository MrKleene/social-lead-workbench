-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "ContactOutcome" ADD VALUE 'RESERVED';
ALTER TYPE "ContactOutcome" ADD VALUE 'CONFIRMED';
ALTER TYPE "ContactOutcome" ADD VALUE 'CANCELLED';

-- DropIndex
ALTER TABLE "ContactLedger" DROP CONSTRAINT IF EXISTS "ContactLedger_identityId_key";
DROP INDEX IF EXISTS "ContactLedger_identityId_key";

-- AlterTable
ALTER TABLE "ContactLedger" ADD COLUMN     "mode" TEXT NOT NULL DEFAULT 'LEGACY_SIMULATION';

-- AlterTable
ALTER TABLE "ContactAttempt" ADD COLUMN     "attemptedAt" TIMESTAMP(3),
ADD COLUMN     "channel" "ReplyChannel",
ADD COLUMN     "confirmedAt" TIMESTAMP(3),
ADD COLUMN     "content" TEXT,
ADD COLUMN     "jobId" TEXT,
ADD COLUMN     "mode" TEXT NOT NULL DEFAULT 'LEGACY_SIMULATION',
ADD COLUMN     "platformReceipt" TEXT;

-- CreateTable
CREATE TABLE "AutoContactRule" (
    "accountLimits" JSONB NOT NULL DEFAULT '[]',
    "model" TEXT NOT NULL DEFAULT '',
    "id" TEXT NOT NULL,
    "platform" "Platform" NOT NULL,
    "policyId" TEXT NOT NULL,
    "policyRevision" INTEGER NOT NULL,
    "threshold" INTEGER NOT NULL DEFAULT 80,
    "channel" "ReplyChannel" NOT NULL DEFAULT 'COMMENT',
    "content" TEXT NOT NULL DEFAULT '',
    "accountIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "version" INTEGER NOT NULL DEFAULT 1,
    "authorizedBy" TEXT,
    "authorizedAt" TIMESTAMP(3),
    "authorizedHash" TEXT,
    "mode" TEXT NOT NULL DEFAULT 'REAL',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AutoContactRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AutoContactControl" (
    "activeJobId" TEXT,
    "leaseUntil" TIMESTAMP(3),
    "platform" "Platform" NOT NULL,
    "mode" TEXT NOT NULL,
    "pauseReason" TEXT,
    "pausedAt" TIMESTAMP(3),

    CONSTRAINT "AutoContactControl_pkey" PRIMARY KEY ("platform","mode")
);

-- CreateTable
CREATE TABLE "AutoContactJob" (
    "id" TEXT NOT NULL,
    "ruleId" TEXT NOT NULL,
    "ruleVersion" INTEGER NOT NULL,
    "reviewId" TEXT NOT NULL,
    "reviewVersion" INTEGER NOT NULL,
    "mode" TEXT NOT NULL,
    "platform" "Platform" NOT NULL,
    "recipientId" TEXT NOT NULL,
    "postId" TEXT NOT NULL,
    "commentId" TEXT NOT NULL,
    "channel" "ReplyChannel" NOT NULL,
    "content" TEXT NOT NULL,
    "evidence" JSONB NOT NULL,
    "eligibilityHash" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'QUEUED',
    "reason" TEXT,
    "accountId" TEXT,
    "attemptId" TEXT,
    "leaseUntil" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AutoContactJob_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AutoContactJob_attemptId_key" ON "AutoContactJob"("attemptId");

-- CreateIndex
CREATE INDEX "AutoContactJob_status_createdAt_idx" ON "AutoContactJob"("status", "createdAt");

-- CreateIndex
CREATE INDEX "AutoContactJob_platform_recipientId_mode_idx" ON "AutoContactJob"("platform", "recipientId", "mode");

-- CreateIndex
CREATE UNIQUE INDEX "AutoContactJob_ruleId_ruleVersion_reviewId_key" ON "AutoContactJob"("ruleId", "ruleVersion", "reviewId");

-- CreateIndex
CREATE UNIQUE INDEX "ContactLedger_identityId_mode_key" ON "ContactLedger"("identityId", "mode");

-- CreateIndex
CREATE UNIQUE INDEX "ContactAttempt_jobId_key" ON "ContactAttempt"("jobId");

-- AddForeignKey
ALTER TABLE "AutoContactJob" ADD CONSTRAINT "AutoContactJob_ruleId_fkey" FOREIGN KEY ("ruleId") REFERENCES "AutoContactRule"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AutoContactJob" ADD CONSTRAINT "AutoContactJob_reviewId_fkey" FOREIGN KEY ("reviewId") REFERENCES "SemanticReview"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
