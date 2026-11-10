CREATE TABLE run_checkpoints(
 post_id TEXT PRIMARY KEY REFERENCES run_posts(id),checkpoint TEXT NOT NULL CHECK(json_valid(checkpoint)),
 hash TEXT NOT NULL,remaining_anchors INTEGER NOT NULL,sequence INTEGER NOT NULL,updated_at INTEGER NOT NULL
);
