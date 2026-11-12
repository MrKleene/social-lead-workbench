-- 模型每日请求上限改为可空：NULL 表示不限量。
-- SQLite 不能直接改 CHECK 约束，按官方推荐重建表。
CREATE TABLE model_profile_unlimited(
 id TEXT PRIMARY KEY CHECK(id='qwen'),model TEXT NOT NULL,version INTEGER NOT NULL,
 authorized INTEGER NOT NULL DEFAULT 0,
 daily_limit INTEGER CHECK(daily_limit IS NULL OR (daily_limit BETWEEN 1 AND 100)),
 price_ack TEXT NOT NULL,consent TEXT NOT NULL
);
INSERT INTO model_profile_unlimited(id,model,version,authorized,daily_limit,price_ack,consent)
 SELECT id,model,version,authorized,daily_limit,price_ack,consent FROM model_profile;
DROP TABLE model_profile;
ALTER TABLE model_profile_unlimited RENAME TO model_profile;
