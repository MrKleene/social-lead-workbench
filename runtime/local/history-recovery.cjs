'use strict';
const {randomUUID}=require('node:crypto'),{LocalError,hash}=require('./database.cjs'),policy=require('./policy.cjs');
class HistoryRecovery{
 constructor(store){this.store=store;this.db=store.db;}
 plan(postId){
  const post=this.db.prepare('SELECT p.*,r.identity_conflict,r.reason,r.status FROM run_posts p JOIN collection_runs r ON r.id=p.run_id WHERE p.id=?').get(postId),saved=this.db.prepare('SELECT * FROM run_checkpoints WHERE post_id=?').get(postId);
  if(!post||!saved||post.identity_conflict||post.reason==='LEGACY_HISTORY_READ_ONLY'||post.status==='RUNNING')throw new LocalError('HISTORY_CHECKPOINT_UNAVAILABLE');const checkpoint=policy.commentCheckpointSchema.parse(JSON.parse(saved.checkpoint)),rows=this.db.prepare('SELECT * FROM run_comments WHERE post_id=? ORDER BY ordinal').all(postId);
  if(rows.length>=800||checkpoint.marks.length!==rows.length||policy.checkpointHash(checkpoint)!==saved.hash||rows.some(c=>c.source_hash!==hash(JSON.parse(c.snapshot))||!checkpoint.marks.some(m=>m.id===c.platform_id&&m.parent===(c.parent_id||'')&&m.digest===policy.commentDigest(post.platform_id,{id:c.platform_id,userId:c.user_id,text:c.body,parentId:c.parent_id||undefined}))))throw new LocalError('HISTORY_CHECKPOINT_MISMATCH');
  return {sourcePostId:post.id,checkpointHash:saved.hash,sourceHash:hash(rows.map(c=>({id:c.id,sourceHash:c.source_hash}))),comments:rows.length,sequence:saved.sequence};
 }
 seed(lease,runId,proof){return this.store.transaction(()=>{
  const {LocalCollection}=require('./collection.cjs'),collection=new LocalCollection(this.store),run=collection.current(lease,runId),plan=JSON.parse(run.read_plan);if(plan.kind!=='SAVED_POST'||hash(plan.resume)!==hash(proof)||hash(this.plan(proof.sourcePostId))!==hash(proof)||this.db.prepare('SELECT 1 FROM run_posts WHERE run_id=?').get(runId))throw new LocalError('HISTORY_CHECKPOINT_CHANGED');
  const source=this.db.prepare('SELECT * FROM run_posts WHERE id=?').get(proof.sourcePostId),saved=this.db.prepare('SELECT * FROM run_checkpoints WHERE post_id=?').get(source.id),postId=randomUUID(),rows=this.db.prepare('SELECT * FROM run_comments WHERE post_id=? ORDER BY ordinal').all(source.id);
  this.db.prepare("INSERT INTO run_posts(id,run_id,platform_id,snapshot,content_hash,ordinal,source_reference_ref,coverage) VALUES(?,?,?,?,?,1,?,'UNKNOWN')").run(postId,runId,source.platform_id,source.snapshot,source.content_hash,source.source_reference_ref);
  for(const c of rows)this.db.prepare('INSERT INTO run_comments(id,run_id,post_id,platform_id,user_id,parent_id,body,snapshot,source_hash,ordinal) VALUES(?,?,?,?,?,?,?,?,?,?)').run(randomUUID(),runId,postId,c.platform_id,c.user_id,c.parent_id,c.body,c.snapshot,c.source_hash,c.ordinal);
  this.db.prepare('INSERT INTO run_checkpoints VALUES(?,?,?,?,?,?)').run(postId,saved.checkpoint,saved.hash,saved.remaining_anchors,saved.sequence,this.store.clock());
  this.store.audit('LOCAL_USER','HISTORICAL_CHECKPOINT_COPIED_FOR_REVALIDATION',runId,proof);
  return {checkpoint:JSON.parse(saved.checkpoint),comments:rows.map(c=>({id:c.platform_id,userId:c.user_id,nickname:JSON.parse(c.snapshot).authorNickname||'',text:c.body,...(c.parent_id?{parentId:c.parent_id}:{}),hasReplies:false}))};
 });}
}
module.exports={HistoryRecovery};
