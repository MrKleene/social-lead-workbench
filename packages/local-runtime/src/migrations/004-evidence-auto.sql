-- 未知发送的自动只读核对任务。发送结果未知时先暂停；系统自行完成两次独立回读，
-- 确认后恢复发送队列。任务跨重启保留，人工核对仍是兜底。
CREATE TABLE evidence_auto_tasks(
 attempt_id TEXT PRIMARY KEY REFERENCES send_attempts(id) ON DELETE CASCADE,
 state TEXT NOT NULL CHECK(state IN('WAITING','RUNNING','CONFIRMED','UNVERIFIED','STOPPED')),
 attempts INTEGER NOT NULL DEFAULT 0,
 next_at INTEGER NOT NULL,
 last_reason TEXT,
 created_at INTEGER NOT NULL,
 updated_at INTEGER NOT NULL
);

CREATE INDEX evidence_auto_due ON evidence_auto_tasks(state,next_at);

INSERT INTO evidence_auto_tasks(attempt_id,state,attempts,next_at,created_at,updated_at)
SELECT id,'WAITING',0,CAST(strftime('%s','now') AS INTEGER)*1000,created_at,created_at
FROM send_attempts WHERE state='UNKNOWN';
