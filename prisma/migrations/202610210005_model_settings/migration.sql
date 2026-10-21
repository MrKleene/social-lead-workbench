CREATE TABLE "ModelSettings" (
 "id" TEXT PRIMARY KEY, "version" INTEGER NOT NULL DEFAULT 0, "model" TEXT NOT NULL,
 "endpoint" TEXT NOT NULL DEFAULT 'beijing-standard', "dailyLimit" INTEGER NOT NULL,
 "priceVersion" TEXT NOT NULL, "consent" BOOLEAN NOT NULL DEFAULT false,
 "note" TEXT NOT NULL DEFAULT '', "encryptedKey" JSONB, "updatedAt" TIMESTAMP(3) NOT NULL
);
