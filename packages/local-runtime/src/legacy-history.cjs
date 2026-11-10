'use strict';
const {hash,canonical,LocalError}=require('./database.cjs');
// Native history is deliberately non-executable. The complete original rows
// remain in legacy_records, including old ownership/version and coverage data.
function importHistory(store,tables,importId){
 if(!store.db.isTransaction)throw new LocalError('TRANSACTION_REQUIRED');
 const db=store.db,now=store.clock(),counts={runs:0,posts:0,comments:0,reviews:0,unmappedPosts:0,unmappedComments:0,unmappedReviews:0},runs=new Map(),posts=new Map(),comments=new Map();
 const at=value=>Number.isFinite(Date.parse(value))?Date.parse(value):now;
 const key=(kind,id)=>'legacy-'+kind+'-'+hash({importId,id}).slice(0,32);
 const job=(kind,id,created)=>{const j=key('job-'+kind,id),a=key('authorization-'+kind,id),scope={legacyImportId:importId,legacyEntityId:id,readOnly:true};db.prepare("INSERT INTO authorizations(id,purpose,scope,scope_hash,state,created_at,expires_at) VALUES(?,?,?,?,'REVOKED',?,?)").run(a,kind,canonical(scope),hash(scope),created,created);db.prepare("INSERT INTO jobs(id,request_key,kind,payload,payload_hash,authorization_id,state,available_at,created_at,updated_at,cancel_requested) VALUES(?,?,?,?,?,?,'INTERRUPTED',?,?,?,1)").run(j,j,kind,canonical(scope),hash(scope),a,created,created,created);return j;};
 for(const r of tables.CollectionRun||[]){
  if(typeof r.id!=='string'||!r.id||!db.prepare('SELECT 1 FROM configurations WHERE id=?').get(r.configId))throw new LocalError('LEGACY_RUN_CONFIGURATION_MISSING');
  let accountId=r.execution?.accountId;if(!accountId||!db.prepare('SELECT 1 FROM accounts WHERE id=?').get(accountId)){accountId=key('unbound-account',r.id);db.prepare("INSERT INTO accounts(id,platform,name,state,daily_limit) VALUES(?,'XHS','历史记录：未绑定账号','ARCHIVED',0)").run(accountId);}
  const id=key('run',r.id),created=at(r.createdAt),j=job('COLLECT',r.id,created),snapshot={legacy:{id:r.id,status:r.status,originalSnapshot:r.snapshot??null},strictStages:{version:1,policies:[],contactRules:[]}};
  db.prepare("INSERT INTO collection_runs(id,job_id,config_id,revision,account_id,account_revision,snapshot,read_plan,status,reason,cancel_requested,identity_conflict,created_at,finished_at) VALUES(?,?,?,?,?,?,?,?,'INTERRUPTED','LEGACY_HISTORY_READ_ONLY',1,1,?,?)").run(id,j,r.configId,Math.max(1,r.revision||1),accountId,db.prepare('SELECT revision FROM accounts WHERE id=?').get(accountId).revision,canonical(snapshot),canonical({kind:'LEGACY_HISTORY',original:r.readPlan??null}),created,at(r.finishedAt));runs.set(r.id,id);counts.runs++;
 }
 for(const p of tables.CapturedPost||[]){const runId=runs.get(p.runId),snapshot=p.snapshot;if(!runId||!snapshot||typeof p.platformPostId!=='string'){counts.unmappedPosts++;continue;}
  // Legacy captures can be mutated by a later run. Never invent complete per-run evidence.
  if(db.prepare('SELECT 1 FROM run_posts WHERE run_id=? AND platform_id=?').get(runId,p.platformPostId)){counts.unmappedPosts++;continue;}
  const id=key('post',p.id),ordinal=db.prepare('SELECT count(*) n FROM run_posts WHERE run_id=?').get(runId).n+1;db.prepare("INSERT INTO run_posts(id,run_id,platform_id,snapshot,content_hash,coverage,ordinal) VALUES(?,?,?,?,?,'UNKNOWN',?)").run(id,runId,p.platformPostId,canonical(snapshot),hash(snapshot),ordinal);posts.set(p.id,{id,runId});counts.posts++;
 }
 for(const c of tables.CapturedComment||[]){const parent=posts.get(c.postId),runId=runs.get(c.runId),s=c.snapshot;if(!parent||!runId||parent.runId!==runId||!s||typeof s.comment!=='string'||typeof s.userId!=='string'||typeof c.platformCommentId!=='string'||db.prepare('SELECT 1 FROM run_comments WHERE run_id=? AND platform_id=?').get(runId,c.platformCommentId)){counts.unmappedComments++;continue;}
  const id=key('comment',c.id),ordinal=db.prepare('SELECT count(*) n FROM run_comments WHERE post_id=?').get(parent.id).n+1;db.prepare('INSERT INTO run_comments(id,run_id,post_id,platform_id,user_id,parent_id,body,snapshot,source_hash,ordinal) VALUES(?,?,?,?,?,?,?,?,?,?)').run(id,runId,parent.id,c.platformCommentId,s.userId,s.parentId??null,s.comment,canonical(s),hash(s),ordinal);comments.set(c.id,{id,runId,postId:parent.id,sourceHash:hash(s)});counts.comments++;
 }
 for(const r of tables.SemanticReview||[]){const c=comments.get(r.captureId);if(!c||runs.get(r.runId)!==c.runId||!Number.isInteger(r.score)||r.score<0||r.score>100){counts.unmappedReviews++;continue;}
  let policyId=r.policyId;if(!policyId||!db.prepare('SELECT 1 FROM review_policies WHERE id=?').get(policyId)){policyId=key('historical-policy',r.policyId||r.id);db.prepare("INSERT INTO review_policies(id,name,target,enabled) VALUES(?,'历史匹配目标','仅保留历史审核结果；重新采集和授权后才能执行新任务',0) ON CONFLICT DO NOTHING").run(policyId);}
  const id=key('review',r.id),batch=key('batch',r.id),created=at(r.createdAt),j=job('REVIEW',r.id,created),result=r.result&&typeof r.result==='object'?r.result:{};
  db.prepare("INSERT INTO review_batches(id,job_id,run_id,post_id,policy_id,policy_revision,policy_version,model,model_version,scope_hash,payload,inputs,state,day,created_at,finished_at,error_code) VALUES(?,?,?,?,?,?,0,?,0,?,'{}','[]','CANCELLED',?,?,?,'LEGACY_HISTORY_READ_ONLY')").run(batch,j,c.runId,c.postId,policyId,Math.max(1,r.policyRevision||1),r.selectedModel||r.modelVersion||'legacy-unverified',hash(r),new Date(created).toISOString().slice(0,10),created,at(r.updatedAt));
  db.prepare('INSERT INTO review_results(id,batch_id,comment_id,source_hash,snapshot,score,context,decision,reason,evidence,review_status,automatic_contact_allowed,version,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,0,?,?)').run(id,batch,c.id,c.sourceHash,canonical(r.snapshot??{}),r.score,r.context||'INSUFFICIENT',typeof result.decision==='string'?result.decision:'UNVERIFIED',r.reason||'历史审核记录',canonical(Array.isArray(result.evidence)?result.evidence:[]),['APPROVED','REJECTED','PENDING'].includes(r.reviewStatus)?r.reviewStatus:'PENDING',Math.max(1,r.version||1),created);counts.reviews++;
 }
 return counts;
}
module.exports={importHistory};
