CREATE TABLE "NormalAutomationAcceptance" (
 "id" TEXT PRIMARY KEY, "state" TEXT NOT NULL DEFAULT 'ACTIVE', "scope" JSONB NOT NULL,
 "actorId" TEXT NOT NULL, "runId" TEXT UNIQUE, "capturedPostId" TEXT, "modelCallId" TEXT UNIQUE,
 "reviewIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[], "sendJobId" TEXT UNIQUE,
 "modelClaimedAt" TIMESTAMP(3), "sendClaimedAt" TIMESTAMP(3),
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "closedAt" TIMESTAMP(3)
);
CREATE INDEX "NormalAutomationAcceptance_state_idx" ON "NormalAutomationAcceptance"("state");
CREATE UNIQUE INDEX "NormalAutomationAcceptance_one_active" ON "NormalAutomationAcceptance"("state") WHERE "state"='ACTIVE';
