CREATE TABLE model_submissions(
 batch_id TEXT PRIMARY KEY REFERENCES review_batches(id),scope_hash TEXT NOT NULL,started_at INTEGER NOT NULL
);
