-- Preserve every existing limit; NULL explicitly represents no cumulative count cap.
ALTER TABLE "ModelSettings" ALTER COLUMN "dailyLimit" DROP NOT NULL;
