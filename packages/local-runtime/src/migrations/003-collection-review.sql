CREATE TABLE review_policies(
 id TEXT PRIMARY KEY,name TEXT NOT NULL,target TEXT NOT NULL,revision INTEGER NOT NULL DEFAULT 1,
 version INTEGER NOT NULL DEFAULT 1,enabled INTEGER NOT NULL DEFAULT 0,model_version INTEGER
);
CREATE TABLE model_profile(
 id TEXT PRIMARY KEY CHECK(id='qwen'),model TEXT NOT NULL,version INTEGER NOT NULL,
 authorized INTEGER NOT NULL DEFAULT 0,daily_limit INTEGER NOT NULL CHECK(daily_limit BETWEEN 1 AND 100),
 price_ack TEXT NOT NULL,consent TEXT NOT NULL
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
 ordinal INTEGER NOT NULL,source_reference_ref TEXT,UNIQUE(run_id,platform_id),UNIQUE(run_id,ordinal)
);
CREATE TABLE run_comments(
 id TEXT PRIMARY KEY,run_id TEXT NOT NULL REFERENCES collection_runs(id),post_id TEXT NOT NULL REFERENCES run_posts(id),
 platform_id TEXT NOT NULL,user_id TEXT NOT NULL,parent_id TEXT,body TEXT NOT NULL,
 snapshot TEXT NOT NULL CHECK(json_valid(snapshot)),source_hash TEXT NOT NULL,ordinal INTEGER NOT NULL,
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
 day TEXT NOT NULL,created_at INTEGER NOT NULL,finished_at INTEGER,error_code TEXT
);
CREATE UNIQUE INDEX model_batch_claim ON review_batches(run_id,post_id,policy_id,policy_revision,model_version) WHERE state IN('RESERVED','DISPATCHED','COMPLETED','UNKNOWN');
CREATE TABLE review_results(
 id TEXT PRIMARY KEY,batch_id TEXT NOT NULL REFERENCES review_batches(id),comment_id TEXT NOT NULL REFERENCES run_comments(id),
 source_hash TEXT NOT NULL,snapshot TEXT NOT NULL CHECK(json_valid(snapshot)),score INTEGER NOT NULL CHECK(score BETWEEN 0 AND 100),
 context TEXT NOT NULL,decision TEXT NOT NULL,reason TEXT NOT NULL,evidence TEXT NOT NULL CHECK(json_valid(evidence)),
 review_status TEXT NOT NULL DEFAULT 'PENDING',automatic_contact_allowed INTEGER NOT NULL DEFAULT 0,
 version INTEGER NOT NULL DEFAULT 1,created_at INTEGER NOT NULL,UNIQUE(batch_id,comment_id)
);
