-- 自动入队配置：按匹配方案独立设置入队阈值与渠道。
CREATE TABLE queue_rules(
  id TEXT PRIMARY KEY,
  policy_id TEXT NOT NULL UNIQUE,
  threshold INTEGER NOT NULL CHECK(threshold BETWEEN 0 AND 100),
  channels TEXT NOT NULL CHECK(json_valid(channels)),
  enabled INTEGER NOT NULL DEFAULT 1 CHECK(enabled IN(0,1)),
  system_default INTEGER NOT NULL DEFAULT 0 CHECK(system_default IN(0,1)),
  version INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX queue_rules_policy ON queue_rules(policy_id);
