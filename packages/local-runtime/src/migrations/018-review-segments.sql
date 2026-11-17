ALTER TABLE review_batches ADD COLUMN segment_no INTEGER NOT NULL DEFAULT 0;
ALTER TABLE review_batches ADD COLUMN attempt_no INTEGER NOT NULL DEFAULT 1;
ALTER TABLE review_batches ADD COLUMN error_stage TEXT;
ALTER TABLE review_batches ADD COLUMN http_status INTEGER;
ALTER TABLE review_batches ADD COLUMN retryable INTEGER;

DROP INDEX IF EXISTS model_batch_claim;
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
