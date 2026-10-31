ALTER TABLE "NormalAutomationAcceptance" ADD COLUMN "batchPlanned" BOOLEAN NOT NULL DEFAULT false;
CREATE TABLE "NormalAcceptancePost" (
 "acceptanceId" TEXT NOT NULL,
 "postId" TEXT NOT NULL,
 "modelCallId" TEXT,
 "reviewIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
 "estimatedMicros" INTEGER,
 "payloadHash" TEXT,
 CONSTRAINT "NormalAcceptancePost_pkey" PRIMARY KEY ("acceptanceId", "postId"),
 CONSTRAINT "NormalAcceptancePost_acceptanceId_fkey" FOREIGN KEY ("acceptanceId") REFERENCES "NormalAutomationAcceptance"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "NormalAcceptancePost_modelCallId_key" ON "NormalAcceptancePost"("modelCallId");
-- Retain the first-version envelope evidence; never reset a consumed call.
INSERT INTO "NormalAcceptancePost" ("acceptanceId","postId","modelCallId","reviewIds")
SELECT id,"capturedPostId","modelCallId","reviewIds" FROM "NormalAutomationAcceptance" WHERE "capturedPostId" IS NOT NULL;
