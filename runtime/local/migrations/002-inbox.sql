-- Keep v1 intact. Receiving and replying are separate, explicitly authorized jobs.
CREATE TABLE inbox_receivers(
 account_id TEXT PRIMARY KEY REFERENCES accounts(id), job_id TEXT NOT NULL REFERENCES jobs(id),
 generation TEXT NOT NULL, account_revision INTEGER NOT NULL, expected_sender TEXT NOT NULL,
 state TEXT NOT NULL CHECK(state IN('CONNECTING','SYNCING','LISTENING','RECONNECTING','YIELDING','STOPPED','FAILED')),
 baseline_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, expires_at INTEGER NOT NULL,
 stop_requested INTEGER NOT NULL DEFAULT 0, comment_mode TEXT NOT NULL DEFAULT 'UNCONFIRMED',
 dm_mode TEXT NOT NULL DEFAULT 'UNCONFIRMED', coverage TEXT NOT NULL DEFAULT 'UNCONFIRMED',
 reason TEXT, last_event_at INTEGER
);
CREATE TABLE received_messages(
 sequence INTEGER PRIMARY KEY AUTOINCREMENT, id TEXT NOT NULL UNIQUE,
 account_id TEXT NOT NULL REFERENCES accounts(id), channel TEXT NOT NULL CHECK(channel IN('COMMENT','DM')),
 platform_id TEXT NOT NULL, sender_id TEXT NOT NULL, receiver_id TEXT,
 sender_name TEXT NOT NULL DEFAULT '', body TEXT NOT NULL, content_type TEXT NOT NULL CHECK(content_type IN('TEXT','UNSUPPORTED')),
 post_id TEXT, post_title TEXT, comment_id TEXT, published_at INTEGER, received_at INTEGER NOT NULL,
 is_new INTEGER NOT NULL DEFAULT 0, source TEXT NOT NULL CHECK(source IN('PUSH','RECONCILIATION','LEGACY')),
 identity_verified INTEGER NOT NULL DEFAULT 0, identity_conflict INTEGER NOT NULL DEFAULT 0, read_at INTEGER,
 UNIQUE(account_id,channel,platform_id)
);
CREATE INDEX received_thread ON received_messages(account_id,channel,sender_id,sequence DESC);
CREATE TABLE inbound_history_blocks(
 account_id TEXT NOT NULL REFERENCES accounts(id), platform_id TEXT NOT NULL,
 outcome TEXT NOT NULL, PRIMARY KEY(account_id,platform_id)
);
INSERT INTO received_messages(id,account_id,channel,platform_id,sender_id,receiver_id,body,content_type,received_at,source,read_at)
 SELECT id,account_id,channel,platform_id,sender_id,NULL,body,'TEXT',received_at,'LEGACY',read_at FROM inbox_messages;
ALTER TABLE contact_ledger ADD COLUMN first_contact_blocked INTEGER NOT NULL DEFAULT 0;
ALTER TABLE send_attempts ADD COLUMN intent TEXT NOT NULL DEFAULT 'FIRST_CONTACT' CHECK(intent IN('FIRST_CONTACT','INBOX_REPLY'));
ALTER TABLE send_attempts ADD COLUMN inbound_message_id TEXT REFERENCES received_messages(id);
ALTER TABLE send_attempts ADD COLUMN sender_id TEXT;
ALTER TABLE send_attempts ADD COLUMN execution_deadline INTEGER;
DROP INDEX recipient_outstanding;
CREATE UNIQUE INDEX recipient_outstanding ON send_attempts(platform,channel,recipient_id)
 WHERE intent='FIRST_CONTACT' AND state IN('RESERVED','DISPATCHED','CONFIRMED','UNKNOWN');
CREATE UNIQUE INDEX inbound_answered ON send_attempts(inbound_message_id)
 WHERE inbound_message_id IS NOT NULL AND state IN('RESERVED','DISPATCHED','CONFIRMED','UNKNOWN');
