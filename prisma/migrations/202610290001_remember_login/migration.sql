BEGIN;
-- Additive migration: existing 8-hour sessions stay valid and are not upgraded.
CREATE TABLE "RefreshGrant" (
  "id" TEXT PRIMARY KEY, "userId" TEXT NOT NULL,
  "csrfToken" TEXT NOT NULL, "expiresAt" TIMESTAMP(3) NOT NULL,
  "revokedAt" TIMESTAMP(3), "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "RefreshGrant_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "RefreshGrant_userId_idx" ON "RefreshGrant"("userId");
CREATE INDEX "RefreshGrant_expiresAt_idx" ON "RefreshGrant"("expiresAt");
CREATE TABLE "RefreshToken" (
  "id" TEXT PRIMARY KEY, "grantId" TEXT NOT NULL, "usedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "RefreshToken_grantId_fkey" FOREIGN KEY ("grantId") REFERENCES "RefreshGrant"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "RefreshToken_grantId_idx" ON "RefreshToken"("grantId");
ALTER TABLE "Session" ADD COLUMN "refreshGrantId" TEXT;
ALTER TABLE "Session" ADD CONSTRAINT "Session_refreshGrantId_fkey" FOREIGN KEY ("refreshGrantId") REFERENCES "RefreshGrant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
CREATE INDEX "Session_refreshGrantId_idx" ON "Session"("refreshGrantId");
-- Applies to all password/active changes, including existing administrative SQL tools.
CREATE FUNCTION invalidate_user_auth() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."passwordHash" IS DISTINCT FROM OLD."passwordHash" OR NEW."active" IS DISTINCT FROM OLD."active" THEN
    UPDATE "RefreshGrant" SET "revokedAt" = CURRENT_TIMESTAMP WHERE "userId" = NEW."id" AND "revokedAt" IS NULL;
    DELETE FROM "Session" WHERE "userId" = NEW."id";
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER user_auth_changed AFTER UPDATE OF "passwordHash", "active" ON "User"
FOR EACH ROW EXECUTE FUNCTION invalidate_user_auth();
COMMIT;
