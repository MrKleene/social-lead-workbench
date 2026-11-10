'use strict';
const {LocalError}=require('./database.cjs');
class PostVersions{
 constructor(store){this.db=store.db;}
 post(id){const p=this.db.prepare('SELECT p.*,r.created_at,r.finished_at,r.reason FROM run_posts p JOIN collection_runs r ON r.id=p.run_id WHERE p.id=?').get(id);if(!p)throw new LocalError('POST_NOT_FOUND');return p;}
 describe(p){const s=JSON.parse(p.snapshot);return {id:p.id,runId:p.run_id,title:s.title??'',body:s.body??'',coverage:p.coverage,observedAt:p.finished_at??p.created_at,legacy:p.reason==='LEGACY_HISTORY_READ_ONLY'};}
 reviews(id){return this.db.prepare(`SELECT b.id,b.policy_id,b.policy_revision,b.policy_version,b.model,b.model_version,b.review_mode,b.state,b.created_at,b.error_code,p.name policy_name,
 CASE WHEN p.enabled=1 AND p.revision=b.policy_revision AND p.version=b.policy_version AND m.authorized=1 AND m.version=b.model_version AND m.model=b.model THEN 1 ELSE 0 END current_configuration,
 (SELECT count(*) FROM review_results r WHERE r.batch_id=b.id) result_count,
 (SELECT count(*) FROM review_results r JOIN run_comments c ON c.id=r.comment_id WHERE r.batch_id=b.id AND r.source_hash=c.source_hash) matching_source_count
 FROM review_batches b LEFT JOIN review_policies p ON p.id=b.policy_id LEFT JOIN model_profile m ON m.id='qwen' WHERE b.post_id=? ORDER BY b.created_at DESC,b.rowid DESC LIMIT 100`).all(id);}
 compare({leftId,rightId,page=1}){
  if(typeof leftId!=='string'||typeof rightId!=='string'||leftId===rightId||!Number.isInteger(page)||page<1||page>100)throw new LocalError('INVALID_VERSION_COMPARISON');
  const left=this.post(leftId),right=this.post(rightId);if(left.platform_id!==right.platform_id)throw new LocalError('VERSION_POST_MISMATCH');
  const rows=id=>this.db.prepare('SELECT platform_id,user_id,parent_id,body,snapshot FROM run_comments WHERE post_id=? ORDER BY ordinal').all(id),a=rows(leftId),b=rows(rightId),am=new Map(a.map(c=>[c.platform_id,c])),bm=new Map(b.map(c=>[c.platform_id,c])),totals={UNCHANGED:0,CHANGED:0,ONLY_LEFT:0,ONLY_RIGHT:0},diff=[];
  for(const id of new Set([...am.keys(),...bm.keys()])){const x=am.get(id),y=bm.get(id),kind=!x?'ONLY_RIGHT':!y?'ONLY_LEFT':x.body!==y.body||x.user_id!==y.user_id||x.parent_id!==y.parent_id?'CHANGED':'UNCHANGED';totals[kind]++;if(kind==='UNCHANGED')continue;const item=c=>c?{body:c.body,nickname:JSON.parse(c.snapshot).authorNickname??null,parentId:c.parent_id}:null;diff.push({kind,left:item(x),right:item(y)});}
  const l=this.describe(left),r=this.describe(right);return {left:l,right:r,postChanged:l.title!==r.title||l.body!==r.body,totals,items:diff.slice((page-1)*30,page*30),total:diff.length,page,leftReviews:this.reviews(leftId),rightReviews:this.reviews(rightId),readOnly:true,absenceIsDeletion:false,warning:l.legacy||r.legacy?'LEGACY_ARCHIVE_MAY_LACK_HISTORICAL_SNAPSHOTS':left.coverage!=='COMPLETE'||right.coverage!=='COMPLETE'?'PARTIAL_COVERAGE':'OBSERVED_SNAPSHOTS_ONLY'};
 }
}
module.exports={PostVersions};
