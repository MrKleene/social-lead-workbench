-- Desktop-only database. No application login, password or User table.
CREATE TABLE IF NOT EXISTS schema_migrations(version INTEGER PRIMARY KEY, checksum TEXT NOT NULL, applied_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS installation(id TEXT PRIMARY KEY, created_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS settings(key TEXT PRIMARY KEY, value TEXT NOT NULL CHECK(json_valid(value)), revision INTEGER NOT NULL DEFAULT 1);
CREATE TABLE IF NOT EXISTS configurations(
 id TEXT PRIMARY KEY, kind TEXT NOT NULL, name TEXT NOT NULL, body TEXT NOT NULL CHECK(json_valid(body)),
 revision INTEGER NOT NULL DEFAULT 1, archived INTEGER NOT NULL DEFAULT 0 CHECK(archived IN(0,1)), updated_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS accounts(
 id TEXT PRIMARY KEY, platform TEXT NOT NULL CHECK(platform='XHS'), platform_user_id TEXT,
 name TEXT NOT NULL, session_ref TEXT, revision INTEGER NOT NULL DEFAULT 1,
 state TEXT NOT NULL CHECK(state IN('UNVERIFIED','VERIFIED','RESTRICTED','ARCHIVED')),
 daily_limit INTEGER NOT NULL CHECK(daily_limit BETWEEN 0 AND 1000), UNIQUE(platform,platform_user_id)
);
CREATE TABLE IF NOT EXISTS authorizations(
 id TEXT PRIMARY KEY, purpose TEXT NOT NULL, scope TEXT NOT NULL CHECK(json_valid(scope)), scope_hash TEXT NOT NULL,
 state TEXT NOT NULL CHECK(state IN('ACTIVE','REVOKED','CONSUMED')), created_at INTEGER NOT NULL, expires_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS jobs(
 id TEXT PRIMARY KEY, request_key TEXT NOT NULL UNIQUE, kind TEXT NOT NULL CHECK(kind IN('COLLECT','REVIEW','SEND','INBOX')),
 payload TEXT NOT NULL CHECK(json_valid(payload)), payload_hash TEXT NOT NULL, authorization_id TEXT NOT NULL REFERENCES authorizations(id),
 state TEXT NOT NULL CHECK(state IN('QUEUED','RUNNING','SUCCEEDED','FAILED','CANCELLED','INTERRUPTED','UNKNOWN')),
 available_at INTEGER NOT NULL, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL,
 lease_owner TEXT, lease_until INTEGER, fence INTEGER NOT NULL DEFAULT 0, dispatch_started INTEGER NOT NULL DEFAULT 0,
 cancel_requested INTEGER NOT NULL DEFAULT 0, result TEXT CHECK(result IS NULL OR json_valid(result))
);
CREATE INDEX IF NOT EXISTS jobs_available ON jobs(state,available_at,created_at,id);
CREATE TABLE IF NOT EXISTS account_leases(account_id TEXT PRIMARY KEY REFERENCES accounts(id), owner TEXT NOT NULL, fence INTEGER NOT NULL, expires_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS contact_ledger(
 platform TEXT NOT NULL, channel TEXT NOT NULL CHECK(channel IN('COMMENT','DM')), recipient_id TEXT NOT NULL,
 blocked INTEGER NOT NULL DEFAULT 0, reason TEXT, PRIMARY KEY(platform,channel,recipient_id)
);
CREATE TABLE IF NOT EXISTS send_attempts(
 id TEXT PRIMARY KEY, request_key TEXT NOT NULL UNIQUE, platform TEXT NOT NULL, channel TEXT NOT NULL,
 recipient_id TEXT NOT NULL, account_id TEXT NOT NULL REFERENCES accounts(id), account_revision INTEGER NOT NULL,
 authorization_id TEXT NOT NULL UNIQUE REFERENCES authorizations(id), scope_hash TEXT NOT NULL,
 content TEXT NOT NULL, target TEXT NOT NULL CHECK(json_valid(target)), quota_day TEXT NOT NULL,
 state TEXT NOT NULL CHECK(state IN('RESERVED','DISPATCHED','CONFIRMED','UNKNOWN','NOT_SUBMITTED','CANCELLED')),
 created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, receipt TEXT, evidence TEXT CHECK(evidence IS NULL OR json_valid(evidence)),
 FOREIGN KEY(platform,channel,recipient_id) REFERENCES contact_ledger(platform,channel,recipient_id)
);
CREATE UNIQUE INDEX IF NOT EXISTS recipient_outstanding ON send_attempts(platform,channel,recipient_id) WHERE state IN('RESERVED','DISPATCHED','CONFIRMED','UNKNOWN');
CREATE UNIQUE INDEX IF NOT EXISTS recipient_uncertain ON send_attempts(platform,recipient_id) WHERE state IN('RESERVED','DISPATCHED','UNKNOWN');
CREATE TABLE IF NOT EXISTS account_days(account_id TEXT NOT NULL REFERENCES accounts(id),day TEXT NOT NULL,occupied INTEGER NOT NULL CHECK(occupied>=0),daily_limit_override INTEGER CHECK(daily_limit_override BETWEEN 0 AND 1000),PRIMARY KEY(account_id,day));
CREATE TABLE IF NOT EXISTS safety_state(id TEXT PRIMARY KEY,version INTEGER NOT NULL DEFAULT 1,event_id TEXT,reason TEXT,created_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS audit_events(id INTEGER PRIMARY KEY AUTOINCREMENT,event_id TEXT NOT NULL UNIQUE,source TEXT NOT NULL CHECK(source IN('LOCAL_USER','AUTOMATION','RECOVERY','IMPORT')),action TEXT NOT NULL,entity_id TEXT NOT NULL,details TEXT NOT NULL CHECK(json_valid(details)),created_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS captured_posts(id TEXT PRIMARY KEY,platform TEXT NOT NULL,platform_id TEXT NOT NULL,body TEXT NOT NULL CHECK(json_valid(body)),UNIQUE(platform,platform_id));
CREATE TABLE IF NOT EXISTS captured_comments(id TEXT PRIMARY KEY,post_id TEXT NOT NULL REFERENCES captured_posts(id),platform_id TEXT NOT NULL,body TEXT NOT NULL CHECK(json_valid(body)),UNIQUE(post_id,platform_id));
CREATE TABLE IF NOT EXISTS inbox_messages(id TEXT PRIMARY KEY,account_id TEXT NOT NULL REFERENCES accounts(id),channel TEXT NOT NULL,platform_id TEXT NOT NULL,sender_id TEXT NOT NULL,receiver_id TEXT NOT NULL,body TEXT NOT NULL,received_at INTEGER NOT NULL,read_at INTEGER,UNIQUE(account_id,channel,platform_id));
CREATE TABLE IF NOT EXISTS legacy_imports(id TEXT PRIMARY KEY,source_hash TEXT NOT NULL UNIQUE,counts TEXT NOT NULL CHECK(json_valid(counts)),created_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS legacy_records(import_id TEXT NOT NULL REFERENCES legacy_imports(id),entity TEXT NOT NULL,ordinal INTEGER NOT NULL,body TEXT NOT NULL CHECK(json_valid(body)),PRIMARY KEY(import_id,entity,ordinal));
