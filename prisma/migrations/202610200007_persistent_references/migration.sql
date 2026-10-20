CREATE TABLE "AccountSessionReference" (
 "accountId" TEXT PRIMARY KEY REFERENCES "PlatformAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE,
 "deviceId" TEXT NOT NULL, "sessionKey" TEXT NOT NULL UNIQUE, "provider" TEXT NOT NULL,
 "state" TEXT NOT NULL DEFAULT 'UNVERIFIED', "checkedRuntimeId" TEXT,
 "verifiedAt" TIMESTAMP(3), "checkingUntil" TIMESTAMP(3), "updatedAt" TIMESTAMP(3) NOT NULL
);
-- Existing mappings are historical only. Never adopt orphan session directories.
