ALTER TABLE "AccountSessionReference" ADD COLUMN "deviceKeyId" TEXT;
CREATE TABLE "ExecutionDevice" (
 "id" TEXT PRIMARY KEY, "keyId" TEXT NOT NULL UNIQUE, "publicKey" TEXT NOT NULL,
 "name" TEXT NOT NULL, "os" TEXT NOT NULL, "provider" TEXT NOT NULL,
 "enabled" BOOLEAN NOT NULL DEFAULT true, "credentialRoot" TEXT NOT NULL,
 "approvedBy" TEXT NOT NULL, "approvedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "revokedAt" TIMESTAMP(3), "lastSeenAt" TIMESTAMP(3), "runtimeId" TEXT, "version" INTEGER NOT NULL DEFAULT 0
);
CREATE UNIQUE INDEX "ExecutionDevice_single_enabled" ON "ExecutionDevice" ((true)) WHERE "enabled" = true;
CREATE TABLE "DeviceExecutionLease" (
 "accountId" TEXT PRIMARY KEY REFERENCES "PlatformAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE,
 "deviceId" TEXT NOT NULL REFERENCES "ExecutionDevice"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 "token" TEXT NOT NULL UNIQUE, "expiresAt" TIMESTAMP(3) NOT NULL
);
