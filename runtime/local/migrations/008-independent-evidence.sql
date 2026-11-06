ALTER TABLE review_batches ADD COLUMN review_mode TEXT NOT NULL DEFAULT 'FROZEN_RUN' CHECK(review_mode IN('FROZEN_RUN','INDEPENDENT'));
CREATE TABLE evidence_checks(
 id TEXT PRIMARY KEY,attempt_id TEXT NOT NULL REFERENCES send_attempts(id),scope_hash TEXT NOT NULL,
 state TEXT NOT NULL CHECK(state IN('RUNNING','CONFIRMED','UNVERIFIED','INTERRUPTED')),
 started_at INTEGER NOT NULL,finished_at INTEGER,details TEXT NOT NULL DEFAULT '{}' CHECK(json_valid(details))
);
CREATE UNIQUE INDEX one_evidence_check ON evidence_checks((1)) WHERE state='RUNNING';
