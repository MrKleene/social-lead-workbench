-- 采集过程时间线：只记录帖子级事件，不保存评论正文。
CREATE TABLE collection_run_events (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL REFERENCES collection_runs(id) ON DELETE CASCADE,
  sequence INTEGER NOT NULL,
  kind TEXT NOT NULL,
  platform_id TEXT,
  title TEXT,
  comments INTEGER NOT NULL DEFAULT 0,
  reason TEXT,
  created_at INTEGER NOT NULL,
  UNIQUE(run_id, sequence)
);
CREATE INDEX collection_run_events_run ON collection_run_events(run_id, sequence);
