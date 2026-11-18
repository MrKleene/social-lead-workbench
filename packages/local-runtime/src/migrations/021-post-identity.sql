-- 帖子/评论身份层：run_posts 与 run_comments 仍保存每轮快照，
-- 这里只记录跨轮稳定的对象身份与最新指针，不复制正文。
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
ALTER TABLE run_posts ADD COLUMN post_id TEXT REFERENCES posts(id);
ALTER TABLE run_comments ADD COLUMN comment_id TEXT REFERENCES comments(id);
CREATE INDEX run_posts_post ON run_posts(post_id);
CREATE INDEX run_comments_comment ON run_comments(comment_id);

INSERT INTO posts(id,platform_id,first_seen_at,last_seen_at)
SELECT lower(hex(randomblob(16))),p.platform_id,min(r.created_at),max(r.created_at)
FROM run_posts p JOIN collection_runs r ON r.id=p.run_id GROUP BY p.platform_id;
UPDATE run_posts SET post_id=(SELECT id FROM posts WHERE platform_id=run_posts.platform_id);
UPDATE posts SET latest_run_post_id=(
 SELECT p.id FROM run_posts p JOIN collection_runs r ON r.id=p.run_id
 WHERE p.platform_id=posts.platform_id ORDER BY r.created_at DESC,p.ordinal DESC,p.rowid DESC LIMIT 1
),latest_complete_run_post_id=(
 SELECT p.id FROM run_posts p JOIN collection_runs r ON r.id=p.run_id
 WHERE p.platform_id=posts.platform_id AND p.coverage='COMPLETE'
 ORDER BY r.created_at DESC,p.ordinal DESC,p.rowid DESC LIMIT 1
);

INSERT INTO comments(id,post_id,platform_id,parent_platform_id,first_seen_at,last_seen_at)
SELECT lower(hex(randomblob(16))),p.post_id,c.platform_id,NULL,min(r.created_at),max(r.created_at)
FROM run_comments c JOIN run_posts p ON p.id=c.post_id JOIN collection_runs r ON r.id=c.run_id
WHERE p.post_id IS NOT NULL GROUP BY p.post_id,c.platform_id;
UPDATE run_comments SET comment_id=(
 SELECT c.id FROM comments c JOIN run_posts p ON p.post_id=c.post_id
 WHERE p.id=run_comments.post_id AND c.platform_id=run_comments.platform_id
);
UPDATE comments SET latest_run_comment_id=(
 SELECT c.id FROM run_comments c JOIN run_posts p ON p.id=c.post_id JOIN collection_runs r ON r.id=c.run_id
 WHERE p.post_id=comments.post_id AND c.platform_id=comments.platform_id
 ORDER BY r.created_at DESC,c.ordinal DESC,c.rowid DESC LIMIT 1
);
UPDATE comments SET parent_platform_id=(
 SELECT c.parent_id FROM run_comments c WHERE c.id=comments.latest_run_comment_id
);
