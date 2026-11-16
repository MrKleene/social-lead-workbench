-- 额度不足而未发送的回复不能静默消失，要留在「待处理回复」里等人处理。
-- resolved_at 为空表示还没处理过；重新入队成功或用户忽略后写入时间戳。
-- 不改 state 的 CHECK 约束：额度不足仍是 SKIPPED + ACCOUNT_POOL_QUOTA_EXHAUSTED，
-- 只是多一列区分「还没处理」和「已处理」。
ALTER TABLE automation_decisions ADD COLUMN resolved_at INTEGER;
