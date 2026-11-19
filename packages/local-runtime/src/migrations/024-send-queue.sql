-- 发送队列：审核完成、人工通过、手动立即发送都先入队，再由调度器逐条创建 SEND 任务。
-- 首联（FIRST_CONTACT）按渠道各算一次：同一收件人 COMMENT 和 DM 互不阻塞。
DROP INDEX IF EXISTS recipient_uncertain;
CREATE UNIQUE INDEX recipient_uncertain ON send_attempts(platform,channel,recipient_id) WHERE state IN('RESERVED','DISPATCHED','UNKNOWN');
CREATE TABLE send_queue(
 id TEXT PRIMARY KEY,
 platform TEXT NOT NULL DEFAULT 'XHS' CHECK(platform='XHS'),
 run_id TEXT NOT NULL,
 review_id TEXT NOT NULL,
 comment_id TEXT NOT NULL,
 channel TEXT NOT NULL CHECK(channel IN('COMMENT','DM')),
 recipient_id TEXT NOT NULL,
 origin TEXT NOT NULL CHECK(origin IN('AUTO','MANUAL_REVIEW','MANUAL_SEND')),
 state TEXT NOT NULL CHECK(state IN('WAITING_SWITCH','READY','WAITING_QUOTA','SENDING','SENT','FAILED','UNKNOWN','EXPIRED','CANCELLED')),
 priority INTEGER NOT NULL DEFAULT 0,
 manual_now INTEGER NOT NULL DEFAULT 0 CHECK(manual_now IN(0,1)),
 plan TEXT NOT NULL CHECK(json_valid(plan)),
 account_id TEXT,
 template_id TEXT,
 job_id TEXT,
 scope_hash TEXT,
 reason TEXT,
 comment_published_at INTEGER,
 enqueued_at INTEGER NOT NULL,
 expires_at INTEGER NOT NULL,
 created_at INTEGER NOT NULL,
 updated_at INTEGER NOT NULL,
 settled_at INTEGER
);
CREATE UNIQUE INDEX send_queue_active ON send_queue(platform,channel,recipient_id) WHERE state IN('WAITING_SWITCH','READY','WAITING_QUOTA','SENDING');
CREATE INDEX send_queue_pick ON send_queue(state,priority DESC,enqueued_at,id);
CREATE INDEX send_queue_review ON send_queue(run_id,review_id);
