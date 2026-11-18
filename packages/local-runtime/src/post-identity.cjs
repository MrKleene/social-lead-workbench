'use strict';
const {randomUUID}=require('node:crypto');
/** 跨轮稳定的帖子/评论身份。只维护指针与时间，不复制任何正文。 */
class PostIdentity{
 constructor(db,clock){this.db=db;this.clock=clock;}
 post(platformId,now=this.clock()){
  let row=this.db.prepare('SELECT id FROM posts WHERE platform_id=?').get(platformId);
  if(!row){const id=randomUUID();this.db.prepare('INSERT INTO posts(id,platform_id,first_seen_at,last_seen_at) VALUES(?,?,?,?)').run(id,platformId,now,now);return id;}
  this.db.prepare('UPDATE posts SET last_seen_at=? WHERE id=?').run(now,row.id);return row.id;
 }
 comment(postId,platformId,parentPlatformId,now=this.clock()){
  let row=this.db.prepare('SELECT id FROM comments WHERE post_id=? AND platform_id=?').get(postId,platformId);
  if(!row){const id=randomUUID();this.db.prepare('INSERT INTO comments(id,post_id,platform_id,parent_platform_id,first_seen_at,last_seen_at) VALUES(?,?,?,?,?,?)').run(id,postId,platformId,parentPlatformId,now,now);return id;}
  this.db.prepare('UPDATE comments SET last_seen_at=?,parent_platform_id=? WHERE id=?').run(now,parentPlatformId,row.id);return row.id;
 }
 touchPostRun(postId,runPostId){this.db.prepare('UPDATE posts SET latest_run_post_id=?,last_seen_at=? WHERE id=?').run(runPostId,this.clock(),postId);}
 touchCommentRun(commentId,runCommentId){this.db.prepare('UPDATE comments SET latest_run_comment_id=?,last_seen_at=? WHERE id=?').run(runCommentId,this.clock(),commentId);}
 completePostRun(postId,runPostId){const now=this.clock();this.db.prepare('UPDATE posts SET latest_run_post_id=?,latest_complete_run_post_id=?,last_seen_at=? WHERE id=?').run(runPostId,runPostId,now,postId);}
}
module.exports={PostIdentity};
