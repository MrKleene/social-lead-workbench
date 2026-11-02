ALTER TABLE "AccountDay" ADD COLUMN "dailyLimitOverride" INTEGER;
ALTER TABLE "AccountDay" ADD CONSTRAINT "AccountDay_dailyLimitOverride_range" CHECK ("dailyLimitOverride" IS NULL OR ("dailyLimitOverride" BETWEEN 0 AND 1000 AND day LIKE 'REAL:Asia/Shanghai:%'));
