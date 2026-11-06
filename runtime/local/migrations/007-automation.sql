CREATE TABLE automation_decisions(
 id INTEGER PRIMARY KEY AUTOINCREMENT,run_id TEXT NOT NULL REFERENCES collection_runs(id),
 review_id TEXT NOT NULL REFERENCES review_results(id),rule_id TEXT NOT NULL REFERENCES contact_rules(id),
 channel TEXT NOT NULL CHECK(channel IN('DM','COMMENT')),job_id TEXT REFERENCES jobs(id),
 state TEXT NOT NULL CHECK(state IN('QUEUED','SKIPPED')),reason TEXT NOT NULL,created_at INTEGER NOT NULL,
 UNIQUE(run_id,review_id,rule_id,channel)
);
