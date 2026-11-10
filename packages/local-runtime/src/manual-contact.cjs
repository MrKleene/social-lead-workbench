'use strict';
const {LocalError,hash}=require('./database.cjs'),{LocalReview}=require('./review.cjs');
const {historicalSendHold}=require('./account-safety.cjs');
class ManualContact{
 constructor(store){this.store=store;this.db=store.db;}
 plan({reviewId,accountId,channel,content}){
  if(!['DM','COMMENT'].includes(channel)||typeof content!=='string'||!content.trim()||content!==content.trim()||content.length>1000||/[\r\n\0]/.test(content))throw new LocalError('INVALID_CONTACT_CONTENT');
  const r=this.db.prepare('SELECT r.*,b.run_id,b.review_mode,b.post_id review_post_id,b.policy_id,b.scope_hash,b.state batch_state,b.job_id,c.body,c.user_id,c.platform_id,c.source_hash current_source_hash,p.platform_id post_platform_id FROM review_results r JOIN review_batches b ON b.id=r.batch_id JOIN run_comments c ON c.id=r.comment_id JOIN run_posts p ON p.id=c.post_id WHERE r.id=?').get(reviewId);
  if(!r||r.review_status!=='APPROVED'||r.context!=='SUFFICIENT'||r.decision!=='MATCH'||r.source_hash!==r.current_source_hash)throw new LocalError('REVIEW_CONTACT_INELIGIBLE');
  const reviewer=new LocalReview(this.store);if(r.review_mode==='INDEPENDENT'){
   const job=this.db.prepare('SELECT state,cancel_requested FROM jobs WHERE id=?').get(r.job_id);if(r.batch_state!=='COMPLETED'||job?.state!=='SUCCEEDED'||job.cancel_requested||hash(reviewer.plan(r.run_id,r.review_post_id,r.policy_id,'INDEPENDENT').scope)!==r.scope_hash)throw new LocalError('REVIEW_CONTACT_INELIGIBLE');
  }else if(!r.automatic_contact_allowed||!reviewer.barrier(r.run_id).ready)throw new LocalError('REVIEW_CONTACT_INELIGIBLE');
  const snapshot=JSON.parse(r.snapshot),evidence=JSON.parse(r.evidence);if(snapshot.comment!==r.body||snapshot.userId!==r.user_id||!evidence.some(e=>e.source==='COMMENT'&&typeof e.quote==='string'&&e.quote.trim()&&r.body.includes(e.quote)))throw new LocalError('CONTACT_EVIDENCE_CHANGED');
  const a=this.db.prepare("SELECT * FROM accounts WHERE id=? AND state='VERIFIED'").get(accountId);
  if(!a?.session_ref||!a.platform_user_id||historicalSendHold(a.platform_user_id)||this.db.prepare('SELECT 1 FROM account_holds WHERE account_id=? AND (channel IS NULL OR channel=?)').get(accountId,channel))throw new LocalError('SEND_ACCOUNT_UNAVAILABLE');
  const scope={platform:'XHS',channel,accountId,accountRevision:a.revision,recipientId:r.user_id,content,intent:'FIRST_CONTACT',target:channel==='DM'?{recipientId:r.user_id}:{postId:r.post_platform_id,commentId:r.platform_id,recipientId:r.user_id},basis:{type:'MANUAL_REVIEW',reviewId:r.id,reviewVersion:r.version,sourceHash:r.source_hash}};
  return {scope,previewHash:hash(scope),accountName:a.name,content,recipientId:r.user_id,channel};
 }
 assertScope(scope){if(scope.basis?.type!=='MANUAL_REVIEW'||hash(this.plan({reviewId:scope.basis.reviewId,accountId:scope.accountId,channel:scope.channel,content:scope.content}).scope)!==hash(scope))throw new LocalError('REVIEW_CONTACT_CHANGED');}
}
module.exports={ManualContact};
