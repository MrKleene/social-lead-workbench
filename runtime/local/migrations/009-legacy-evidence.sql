CREATE TABLE legacy_evidence_links(
 import_id TEXT NOT NULL REFERENCES legacy_imports(id),ordinal INTEGER NOT NULL,
 attempt_id TEXT NOT NULL UNIQUE REFERENCES send_attempts(id),PRIMARY KEY(import_id,ordinal)
);
