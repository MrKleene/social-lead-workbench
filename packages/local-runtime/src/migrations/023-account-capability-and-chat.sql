-- 023: 账号能力状态、聊天发送用途与批次。
-- 历史 v1 只区分 FIRST_CONTACT / INBOX_REPLY。聊天继续使用 intent=FIRST_CONTACT
-- 以兼容既有 CHECK，但用 purpose 区分真正的首次联系、继续聊天和评论回复。

ALTER TABLE accounts ADD COLUMN collect_state TEXT NOT NULL DEFAULT 'ALLOWED' CHECK(collect_state IN('CHECKING','ALLOWED','BLOCKED'));
ALTER TABLE accounts ADD COLUMN contact_state TEXT NOT NULL DEFAULT 'ALLOWED' CHECK(contact_state IN('CHECKING','ALLOWED','BLOCKED'));
ALTER TABLE accounts ADD COLUMN eligibility_checked_at INTEGER;

ALTER TABLE send_attempts ADD COLUMN purpose TEXT NOT NULL DEFAULT 'FIRST_CONTACT' CHECK(purpose IN('FIRST_CONTACT','INBOX_REPLY','CHAT_FOLLOW_UP','INBOX_COMMENT_REPLY'));
ALTER TABLE send_attempts ADD COLUMN batch_id TEXT;
-- 只回补真正占过额度的发送，避免把同一天别的发送额度减掉。
ALTER TABLE send_attempts ADD COLUMN quota_charged INTEGER NOT NULL DEFAULT 0 CHECK(quota_charged IN(0,1));
ALTER TABLE send_attempts ADD COLUMN recipient_name TEXT;
UPDATE send_attempts SET purpose='INBOX_REPLY' WHERE intent='INBOX_REPLY';
UPDATE send_attempts SET quota_charged=1 WHERE intent='FIRST_CONTACT';

-- 继续聊天和评论回复不占用「首次联系」名额，也不该互相挡住。
DROP INDEX recipient_outstanding;
CREATE UNIQUE INDEX recipient_outstanding ON send_attempts(platform,channel,recipient_id)
 WHERE intent='FIRST_CONTACT' AND purpose='FIRST_CONTACT' AND state IN('RESERVED','DISPATCHED','CONFIRMED','UNKNOWN');
CREATE INDEX send_attempts_batch ON send_attempts(batch_id) WHERE batch_id IS NOT NULL;
