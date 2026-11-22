-- Desktop-only database. No application login, password or User table.
CREATE TABLE schema_migrations(version INTEGER PRIMARY KEY, checksum TEXT NOT NULL, applied_at INTEGER NOT NULL);

CREATE TABLE installation(id TEXT PRIMARY KEY, created_at INTEGER NOT NULL);

CREATE TABLE settings(key TEXT PRIMARY KEY, value TEXT NOT NULL CHECK(json_valid(value)), revision INTEGER NOT NULL DEFAULT 1);

CREATE TABLE configurations(
 id TEXT PRIMARY KEY, kind TEXT NOT NULL, name TEXT NOT NULL, body TEXT NOT NULL CHECK(json_valid(body)),
 revision INTEGER NOT NULL DEFAULT 1, archived INTEGER NOT NULL DEFAULT 0 CHECK(archived IN(0,1)), updated_at INTEGER NOT NULL, builtin INTEGER NOT NULL DEFAULT 0 CHECK(builtin IN(0,1)));

CREATE TABLE accounts(
 id TEXT PRIMARY KEY, platform TEXT NOT NULL CHECK(platform='XHS'), platform_user_id TEXT,
 name TEXT NOT NULL, session_ref TEXT, revision INTEGER NOT NULL DEFAULT 1,
 state TEXT NOT NULL CHECK(state IN('UNVERIFIED','VERIFIED','RESTRICTED','ARCHIVED')),
 daily_limit INTEGER NOT NULL CHECK(daily_limit BETWEEN 0 AND 1000), nickname TEXT, avatar_url TEXT, collect_state TEXT NOT NULL DEFAULT 'ALLOWED' CHECK(collect_state IN('CHECKING','ALLOWED','BLOCKED')), contact_state TEXT NOT NULL DEFAULT 'ALLOWED' CHECK(contact_state IN('CHECKING','ALLOWED','BLOCKED')), eligibility_checked_at INTEGER, UNIQUE(platform,platform_user_id)
);

CREATE TABLE authorizations(
 id TEXT PRIMARY KEY, purpose TEXT NOT NULL, scope TEXT NOT NULL CHECK(json_valid(scope)), scope_hash TEXT NOT NULL,
 state TEXT NOT NULL CHECK(state IN('ACTIVE','REVOKED','CONSUMED')), created_at INTEGER NOT NULL, expires_at INTEGER NOT NULL, issuer TEXT NOT NULL DEFAULT 'LOCAL_USER', parent_proof TEXT CHECK(parent_proof IS NULL OR json_valid(parent_proof)));

CREATE TABLE jobs(
 id TEXT PRIMARY KEY, request_key TEXT NOT NULL UNIQUE, kind TEXT NOT NULL CHECK(kind IN('COLLECT','REVIEW','SEND','INBOX')),
 payload TEXT NOT NULL CHECK(json_valid(payload)), payload_hash TEXT NOT NULL, authorization_id TEXT NOT NULL REFERENCES authorizations(id),
 state TEXT NOT NULL CHECK(state IN('QUEUED','RUNNING','SUCCEEDED','FAILED','CANCELLED','INTERRUPTED','UNKNOWN')),
 available_at INTEGER NOT NULL, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL,
 lease_owner TEXT, lease_until INTEGER, fence INTEGER NOT NULL DEFAULT 0, dispatch_started INTEGER NOT NULL DEFAULT 0,
 cancel_requested INTEGER NOT NULL DEFAULT 0, result TEXT CHECK(result IS NULL OR json_valid(result))
);

CREATE INDEX jobs_available ON jobs(state,available_at,created_at,id);

CREATE TABLE account_leases(account_id TEXT PRIMARY KEY REFERENCES accounts(id), owner TEXT NOT NULL, fence INTEGER NOT NULL, expires_at INTEGER NOT NULL);

CREATE TABLE contact_ledger(
 platform TEXT NOT NULL, channel TEXT NOT NULL CHECK(channel IN('COMMENT','DM')), recipient_id TEXT NOT NULL,
 blocked INTEGER NOT NULL DEFAULT 0, reason TEXT, first_contact_blocked INTEGER NOT NULL DEFAULT 0, PRIMARY KEY(platform,channel,recipient_id)
);

CREATE TABLE send_attempts(
 id TEXT PRIMARY KEY, request_key TEXT NOT NULL UNIQUE, platform TEXT NOT NULL, channel TEXT NOT NULL,
 recipient_id TEXT NOT NULL, account_id TEXT NOT NULL REFERENCES accounts(id), account_revision INTEGER NOT NULL,
 authorization_id TEXT NOT NULL UNIQUE REFERENCES authorizations(id), scope_hash TEXT NOT NULL,
 content TEXT NOT NULL, target TEXT NOT NULL CHECK(json_valid(target)), quota_day TEXT NOT NULL,
 state TEXT NOT NULL CHECK(state IN('RESERVED','DISPATCHED','CONFIRMED','UNKNOWN','NOT_SUBMITTED','CANCELLED')),
 created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, receipt TEXT, evidence TEXT CHECK(evidence IS NULL OR json_valid(evidence)), intent TEXT NOT NULL DEFAULT 'FIRST_CONTACT' CHECK(intent IN('FIRST_CONTACT','INBOX_REPLY')), inbound_message_id TEXT REFERENCES received_messages(id), sender_id TEXT, execution_deadline INTEGER, template_id TEXT, purpose TEXT NOT NULL DEFAULT 'FIRST_CONTACT' CHECK(purpose IN('FIRST_CONTACT','INBOX_REPLY','CHAT_FOLLOW_UP','INBOX_COMMENT_REPLY')), batch_id TEXT, quota_charged INTEGER NOT NULL DEFAULT 0 CHECK(quota_charged IN(0,1)), recipient_name TEXT,
 FOREIGN KEY(platform,channel,recipient_id) REFERENCES contact_ledger(platform,channel,recipient_id)
);

CREATE TABLE account_days(account_id TEXT NOT NULL REFERENCES accounts(id),day TEXT NOT NULL,occupied INTEGER NOT NULL CHECK(occupied>=0),daily_limit_override INTEGER CHECK(daily_limit_override BETWEEN 0 AND 1000),PRIMARY KEY(account_id,day));

CREATE TABLE safety_state(id TEXT PRIMARY KEY,version INTEGER NOT NULL DEFAULT 1,event_id TEXT,reason TEXT,created_at INTEGER NOT NULL);

CREATE TABLE audit_events(id INTEGER PRIMARY KEY AUTOINCREMENT,event_id TEXT NOT NULL UNIQUE,source TEXT NOT NULL CHECK(source IN('LOCAL_USER','AUTOMATION','RECOVERY','IMPORT')),action TEXT NOT NULL,entity_id TEXT NOT NULL,details TEXT NOT NULL CHECK(json_valid(details)),created_at INTEGER NOT NULL);

CREATE TABLE legacy_imports(id TEXT PRIMARY KEY,source_hash TEXT NOT NULL UNIQUE,counts TEXT NOT NULL CHECK(json_valid(counts)),created_at INTEGER NOT NULL);

CREATE TABLE legacy_records(import_id TEXT NOT NULL REFERENCES legacy_imports(id),entity TEXT NOT NULL,ordinal INTEGER NOT NULL,body TEXT NOT NULL CHECK(json_valid(body)),PRIMARY KEY(import_id,entity,ordinal));

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

CREATE UNIQUE INDEX inbound_answered ON send_attempts(inbound_message_id)
 WHERE inbound_message_id IS NOT NULL AND state IN('RESERVED','DISPATCHED','CONFIRMED','UNKNOWN');

CREATE TABLE review_policies(
 id TEXT PRIMARY KEY,name TEXT NOT NULL,target TEXT NOT NULL,revision INTEGER NOT NULL DEFAULT 1,
 version INTEGER NOT NULL DEFAULT 1,enabled INTEGER NOT NULL DEFAULT 0,model_version INTEGER
);

CREATE TABLE collection_runs(
 id TEXT PRIMARY KEY,job_id TEXT NOT NULL UNIQUE REFERENCES jobs(id),config_id TEXT NOT NULL REFERENCES configurations(id),
 revision INTEGER NOT NULL,account_id TEXT NOT NULL REFERENCES accounts(id),account_revision INTEGER NOT NULL,
 snapshot TEXT NOT NULL CHECK(json_valid(snapshot)),read_plan TEXT NOT NULL CHECK(json_valid(read_plan)),
 status TEXT NOT NULL CHECK(status IN('RUNNING','COMPLETE','PARTIAL','FAILED','CANCELLED','INTERRUPTED')),
 reason TEXT,cancel_requested INTEGER NOT NULL DEFAULT 0,identity_conflict INTEGER NOT NULL DEFAULT 0,
 coverage TEXT CHECK(coverage IS NULL OR json_valid(coverage)),created_at INTEGER NOT NULL,finished_at INTEGER
);

CREATE TABLE run_posts(
 id TEXT PRIMARY KEY,run_id TEXT NOT NULL REFERENCES collection_runs(id),platform_id TEXT NOT NULL,
 snapshot TEXT NOT NULL CHECK(json_valid(snapshot)),content_hash TEXT NOT NULL,coverage TEXT NOT NULL DEFAULT 'UNKNOWN',
 ordinal INTEGER NOT NULL,source_reference_ref TEXT, post_id TEXT REFERENCES posts(id),UNIQUE(run_id,platform_id),UNIQUE(run_id,ordinal)
);

CREATE TABLE run_comments(
 id TEXT PRIMARY KEY,run_id TEXT NOT NULL REFERENCES collection_runs(id),post_id TEXT NOT NULL REFERENCES run_posts(id),
 platform_id TEXT NOT NULL,user_id TEXT NOT NULL,parent_id TEXT,body TEXT NOT NULL,
 snapshot TEXT NOT NULL CHECK(json_valid(snapshot)),source_hash TEXT NOT NULL,ordinal INTEGER NOT NULL, comment_id TEXT REFERENCES comments(id),
 UNIQUE(run_id,platform_id),UNIQUE(post_id,ordinal)
);

CREATE TABLE capture_conflicts(
 id INTEGER PRIMARY KEY AUTOINCREMENT,run_id TEXT NOT NULL REFERENCES collection_runs(id),
 platform_id TEXT NOT NULL,kind TEXT NOT NULL,observed TEXT NOT NULL CHECK(json_valid(observed)),created_at INTEGER NOT NULL
);

CREATE TABLE model_days(day TEXT PRIMARY KEY,occupied INTEGER NOT NULL CHECK(occupied>=0));

CREATE TABLE review_batches(
 id TEXT PRIMARY KEY,job_id TEXT NOT NULL UNIQUE REFERENCES jobs(id),run_id TEXT NOT NULL REFERENCES collection_runs(id),
 post_id TEXT NOT NULL REFERENCES run_posts(id),policy_id TEXT NOT NULL REFERENCES review_policies(id),
 policy_revision INTEGER NOT NULL,policy_version INTEGER NOT NULL,model TEXT NOT NULL,model_version INTEGER NOT NULL,
 scope_hash TEXT NOT NULL,payload TEXT NOT NULL CHECK(json_valid(payload)),inputs TEXT NOT NULL CHECK(json_valid(inputs)),
 state TEXT NOT NULL CHECK(state IN('RESERVED','DISPATCHED','COMPLETED','FAILED','UNKNOWN','CANCELLED')),
 day TEXT NOT NULL,created_at INTEGER NOT NULL,finished_at INTEGER,error_code TEXT, review_mode TEXT NOT NULL DEFAULT 'FROZEN_RUN' CHECK(review_mode IN('FROZEN_RUN','INDEPENDENT')), segment_no INTEGER NOT NULL DEFAULT 0, attempt_no INTEGER NOT NULL DEFAULT 1, error_stage TEXT, http_status INTEGER, retryable INTEGER, error_detail TEXT);

CREATE TABLE review_results(
 id TEXT PRIMARY KEY,batch_id TEXT NOT NULL REFERENCES review_batches(id),comment_id TEXT NOT NULL REFERENCES run_comments(id),
 source_hash TEXT NOT NULL,snapshot TEXT NOT NULL CHECK(json_valid(snapshot)),score INTEGER NOT NULL CHECK(score BETWEEN 0 AND 100),
 context TEXT NOT NULL,decision TEXT NOT NULL,reason TEXT NOT NULL,evidence TEXT NOT NULL CHECK(json_valid(evidence)),
 review_status TEXT NOT NULL DEFAULT 'PENDING',automatic_contact_allowed INTEGER NOT NULL DEFAULT 0,
 version INTEGER NOT NULL DEFAULT 1,created_at INTEGER NOT NULL, manual_decision TEXT CHECK(manual_decision IS NULL OR manual_decision IN('MATCH','NO_MATCH')),UNIQUE(batch_id,comment_id)
);

CREATE TABLE contact_rules(
 id TEXT PRIMARY KEY,name TEXT NOT NULL,policy_id TEXT NOT NULL REFERENCES review_policies(id),policy_revision INTEGER NOT NULL,
 model TEXT NOT NULL,threshold INTEGER NOT NULL CHECK(threshold BETWEEN 0 AND 100),
 plans TEXT NOT NULL CHECK(json_valid(plans)),accounts TEXT NOT NULL CHECK(json_valid(accounts)),
 version INTEGER NOT NULL,enabled INTEGER NOT NULL DEFAULT 0,authorization_hash TEXT,authorized_at INTEGER
);

CREATE TABLE account_holds(
 id TEXT PRIMARY KEY,account_id TEXT NOT NULL REFERENCES accounts(id),channel TEXT CHECK(channel IN('COMMENT','DM')),
 reason TEXT NOT NULL,source_hash TEXT NOT NULL,created_at INTEGER NOT NULL, detail TEXT,UNIQUE(account_id,channel,source_hash)
);

CREATE TABLE account_capabilities(
 account_id TEXT NOT NULL REFERENCES accounts(id),channel TEXT NOT NULL CHECK(channel='COMMENT'),
 account_revision INTEGER NOT NULL,sender_id TEXT NOT NULL,session_hash TEXT NOT NULL,
 driver_hash TEXT NOT NULL,evidence_hash TEXT NOT NULL,verified_at INTEGER NOT NULL,expires_at INTEGER NOT NULL,
 PRIMARY KEY(account_id,channel)
);

CREATE TABLE model_submissions(
 batch_id TEXT PRIMARY KEY REFERENCES review_batches(id),scope_hash TEXT NOT NULL,started_at INTEGER NOT NULL
);

CREATE TABLE run_checkpoints(
 post_id TEXT PRIMARY KEY REFERENCES run_posts(id),checkpoint TEXT NOT NULL CHECK(json_valid(checkpoint)),
 hash TEXT NOT NULL,remaining_anchors INTEGER NOT NULL,sequence INTEGER NOT NULL,updated_at INTEGER NOT NULL
);

CREATE TABLE automation_decisions(
 id INTEGER PRIMARY KEY AUTOINCREMENT,run_id TEXT NOT NULL REFERENCES collection_runs(id),
 review_id TEXT NOT NULL REFERENCES review_results(id),rule_id TEXT NOT NULL REFERENCES contact_rules(id),
 channel TEXT NOT NULL CHECK(channel IN('DM','COMMENT')),job_id TEXT REFERENCES jobs(id),
 state TEXT NOT NULL CHECK(state IN('QUEUED','SKIPPED')),reason TEXT NOT NULL,created_at INTEGER NOT NULL, resolved_at INTEGER,
 UNIQUE(run_id,review_id,rule_id,channel)
);

CREATE TABLE evidence_checks(
 id TEXT PRIMARY KEY,attempt_id TEXT NOT NULL REFERENCES send_attempts(id),scope_hash TEXT NOT NULL,
 state TEXT NOT NULL CHECK(state IN('RUNNING','CONFIRMED','UNVERIFIED','INTERRUPTED')),
 started_at INTEGER NOT NULL,finished_at INTEGER,details TEXT NOT NULL DEFAULT '{}' CHECK(json_valid(details))
);

CREATE UNIQUE INDEX one_evidence_check ON evidence_checks((1)) WHERE state='RUNNING';

CREATE TABLE legacy_evidence_links(
 import_id TEXT NOT NULL REFERENCES legacy_imports(id),ordinal INTEGER NOT NULL,
 attempt_id TEXT NOT NULL UNIQUE REFERENCES send_attempts(id),PRIMARY KEY(import_id,ordinal)
);

CREATE TABLE automatic_review_authorizations(
 policy_id TEXT PRIMARY KEY REFERENCES review_policies(id),policy_version INTEGER NOT NULL,
 model_version INTEGER NOT NULL,price_ack TEXT NOT NULL,consent TEXT NOT NULL,
 request_policy TEXT NOT NULL,enabled INTEGER NOT NULL CHECK(enabled IN(0,1)),authorized_at INTEGER NOT NULL
);

CREATE TABLE automatic_review_tasks(
 run_id TEXT NOT NULL REFERENCES collection_runs(id),post_id TEXT NOT NULL REFERENCES run_posts(id),
 policy_id TEXT NOT NULL REFERENCES review_policies(id),job_id TEXT UNIQUE REFERENCES jobs(id),
 reason TEXT NOT NULL,created_at INTEGER NOT NULL,PRIMARY KEY(run_id,post_id,policy_id)
);

CREATE TABLE post_diagnostics(
 request_key TEXT PRIMARY KEY,account_id TEXT NOT NULL REFERENCES accounts(id),mode TEXT NOT NULL,
 state TEXT NOT NULL CHECK(state IN('RUNNING','COMPLETED','FAILED','INTERRUPTED')),
 started_at INTEGER NOT NULL,finished_at INTEGER
);

CREATE TABLE "model_profile"(
 id TEXT PRIMARY KEY CHECK(id='qwen'),model TEXT NOT NULL,version INTEGER NOT NULL,
 authorized INTEGER NOT NULL DEFAULT 0,
 daily_limit INTEGER CHECK(daily_limit IS NULL OR (daily_limit BETWEEN 1 AND 100)),
 price_ack TEXT NOT NULL,consent TEXT NOT NULL
);

CREATE INDEX account_holds_account_created ON account_holds(account_id,created_at);

CREATE INDEX review_batches_claim ON review_batches(run_id,post_id,policy_id,policy_revision,model_version,segment_no);

CREATE INDEX review_batches_failures ON review_batches(run_id,state,finished_at);

CREATE TABLE review_pauses(
 id TEXT PRIMARY KEY,
 run_id TEXT NOT NULL,
 post_id TEXT,
 policy_id TEXT,
 kind TEXT NOT NULL CHECK(kind IN('POST','QUEUE')),
 reason TEXT NOT NULL,
 created_at INTEGER NOT NULL
);

CREATE INDEX review_pauses_run ON review_pauses(run_id,kind);

CREATE TABLE automatic_review_segments(
 run_id TEXT NOT NULL,
 post_id TEXT NOT NULL,
 policy_id TEXT NOT NULL,
 segment_no INTEGER NOT NULL,
 attempt_no INTEGER NOT NULL,
 job_id TEXT NOT NULL UNIQUE,
 reason TEXT,
 created_at INTEGER NOT NULL,
 PRIMARY KEY(run_id,post_id,policy_id,segment_no,attempt_no)
);

CREATE INDEX automatic_review_segments_job ON automatic_review_segments(job_id);

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

CREATE TABLE posts(
 id TEXT PRIMARY KEY,platform_id TEXT NOT NULL UNIQUE,
 first_seen_at INTEGER NOT NULL,last_seen_at INTEGER NOT NULL,
 latest_run_post_id TEXT,latest_complete_run_post_id TEXT
);

CREATE TABLE comments(
 id TEXT PRIMARY KEY,post_id TEXT NOT NULL REFERENCES posts(id),
 platform_id TEXT NOT NULL,parent_platform_id TEXT,
 first_seen_at INTEGER NOT NULL,last_seen_at INTEGER NOT NULL,
 latest_run_comment_id TEXT,UNIQUE(post_id,platform_id)
);

CREATE INDEX run_posts_post ON run_posts(post_id);

CREATE INDEX run_comments_comment ON run_comments(comment_id);

CREATE UNIQUE INDEX recipient_outstanding ON send_attempts(platform,channel,recipient_id)
 WHERE intent='FIRST_CONTACT' AND purpose='FIRST_CONTACT' AND state IN('RESERVED','DISPATCHED','CONFIRMED','UNKNOWN');

CREATE INDEX send_attempts_batch ON send_attempts(batch_id) WHERE batch_id IS NOT NULL;

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
