CREATE TABLE contact_rules(
 id TEXT PRIMARY KEY,name TEXT NOT NULL,policy_id TEXT NOT NULL REFERENCES review_policies(id),policy_revision INTEGER NOT NULL,
 model TEXT NOT NULL,threshold INTEGER NOT NULL CHECK(threshold BETWEEN 0 AND 100),
 plans TEXT NOT NULL CHECK(json_valid(plans)),accounts TEXT NOT NULL CHECK(json_valid(accounts)),
 version INTEGER NOT NULL,enabled INTEGER NOT NULL DEFAULT 0,authorization_hash TEXT,authorized_at INTEGER
);
CREATE TABLE account_holds(
 id TEXT PRIMARY KEY,account_id TEXT NOT NULL REFERENCES accounts(id),channel TEXT CHECK(channel IN('COMMENT','DM')),
 reason TEXT NOT NULL,source_hash TEXT NOT NULL,created_at INTEGER NOT NULL,UNIQUE(account_id,channel,source_hash)
);
CREATE TABLE account_capabilities(
 account_id TEXT NOT NULL REFERENCES accounts(id),channel TEXT NOT NULL CHECK(channel='COMMENT'),
 account_revision INTEGER NOT NULL,sender_id TEXT NOT NULL,session_hash TEXT NOT NULL,
 driver_hash TEXT NOT NULL,evidence_hash TEXT NOT NULL,verified_at INTEGER NOT NULL,expires_at INTEGER NOT NULL,
 PRIMARY KEY(account_id,channel)
);
ALTER TABLE authorizations ADD COLUMN issuer TEXT NOT NULL DEFAULT 'LOCAL_USER';
ALTER TABLE authorizations ADD COLUMN parent_proof TEXT CHECK(parent_proof IS NULL OR json_valid(parent_proof));
