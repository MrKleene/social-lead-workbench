ALTER TABLE "PlatformAccount" ADD COLUMN "loginSessionKey" TEXT, ADD COLUMN "loginProvider" TEXT, ADD COLUMN "loginPlatformUserId" TEXT, ADD COLUMN "loginNickname" TEXT, ADD COLUMN "loginVerifiedAt" TIMESTAMP(3);
CREATE UNIQUE INDEX "PlatformAccount_loginSessionKey_key" ON "PlatformAccount"("loginSessionKey");
CREATE UNIQUE INDEX "PlatformAccount_platform_loginProvider_loginPlatformUserId_key" ON "PlatformAccount"("platform", "loginProvider", "loginPlatformUserId");
CREATE TABLE "AccountLogin" ("id" TEXT PRIMARY KEY, "accountId" TEXT NOT NULL REFERENCES "PlatformAccount"("id") ON DELETE CASCADE, "actorId" TEXT NOT NULL, "requestKey" TEXT NOT NULL UNIQUE, "runtimeId" TEXT NOT NULL, "mode" TEXT NOT NULL, "state" TEXT NOT NULL DEFAULT 'STARTING', "reason" TEXT, "expiresAt" TIMESTAMP(3) NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE INDEX "AccountLogin_accountId_createdAt_idx" ON "AccountLogin"("accountId", "createdAt");
CREATE UNIQUE INDEX "AccountLogin_one_active_per_account" ON "AccountLogin"("accountId") WHERE "state" IN ('STARTING','WAITING');
