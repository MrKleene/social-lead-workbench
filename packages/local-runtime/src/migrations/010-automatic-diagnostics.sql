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
