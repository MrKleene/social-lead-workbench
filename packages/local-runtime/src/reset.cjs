'use strict';
const {LocalError}=require('./database.cjs');

// 勾选项：父类勾上就代表连带删除它派生出的子类，删除顺序由外键决定。
const CATEGORIES=new Set(['runs','posts','comments','reviews']);

function plan(input){
 if(!input||Object.getPrototypeOf(input)!==Object.prototype||!Array.isArray(input.categories))throw new LocalError('INVALID_RESET_SELECTION');
 const raw=input.categories;
 if(!raw.length||raw.length>CATEGORIES.size||new Set(raw).size!==raw.length)throw new LocalError('INVALID_RESET_SELECTION');
 if(raw.some(x=>typeof x!=='string'||!CATEGORIES.has(x)))throw new LocalError('INVALID_RESET_SELECTION');
 const selected=new Set(raw);
 if(selected.has('runs')){selected.add('posts');selected.add('comments');selected.add('reviews');}
 if(selected.has('posts')){selected.add('comments');selected.add('reviews');}
 if(selected.has('comments'))selected.add('reviews');
 return selected;
}

// 只有采集与审核会写这些派生表。在途发送不算忙：删除不碰 send_attempts 与证据链。
const BUSY="SELECT (SELECT count(*) FROM jobs WHERE state IN('QUEUED','RUNNING') AND kind IN('COLLECT','REVIEW'))+(SELECT count(*) FROM review_batches WHERE state IN('RESERVED','DISPATCHED'))+(SELECT count(*) FROM account_leases WHERE expires_at>?)+(SELECT count(*) FROM post_diagnostics WHERE state='RUNNING') AS n";

const ORPHAN_JOBS=`DELETE FROM jobs WHERE kind IN('COLLECT','REVIEW')
 AND NOT EXISTS(SELECT 1 FROM collection_runs r WHERE r.job_id=jobs.id)
 AND NOT EXISTS(SELECT 1 FROM review_batches b WHERE b.job_id=jobs.id)
 AND NOT EXISTS(SELECT 1 FROM automation_decisions d WHERE d.job_id=jobs.id)
 AND NOT EXISTS(SELECT 1 FROM automatic_review_tasks t WHERE t.job_id=jobs.id)`;

// 已用掉的发送授权被 send_attempts 永久占用；这里只收拾没人再引用的一次性授权，
// 发送授权的 scope.basis.reviewId 指向仍存在的审核结果时也留着。
const ORPHAN_GRANTS=`DELETE FROM authorizations WHERE
 NOT EXISTS(SELECT 1 FROM jobs j WHERE j.authorization_id=authorizations.id)
 AND NOT EXISTS(SELECT 1 FROM send_attempts s WHERE s.authorization_id=authorizations.id)
 AND (purpose IN('COLLECT','REVIEW')
  OR (purpose='SEND' AND json_extract(scope,'$.basis.reviewId') IS NOT NULL
   AND json_extract(scope,'$.basis.reviewId') NOT IN(SELECT id FROM review_results)))`;

class LocalReset{
 constructor(store){this.store=store;this.db=store.db;}
 delete(input){
  const selected=plan(input);
  if(this.db.prepare(BUSY).get(this.store.clock()).n>0)throw new LocalError('RESET_REQUIRES_IDLE');
  const counts=this.store.transaction(()=>{
   const out={},drop=table=>{out[table]=this.db.prepare('DELETE FROM '+table).run().changes;};
   if(selected.has('reviews')){drop('automation_decisions');drop('model_submissions');drop('review_results');drop('review_batches');}
   if(selected.has('comments'))drop('run_comments');
   if(selected.has('posts')){drop('run_checkpoints');drop('automatic_review_tasks');drop('run_posts');}
   if(selected.has('runs')){drop('capture_conflicts');drop('collection_runs');}
   out.jobs=this.db.prepare(ORPHAN_JOBS).run().changes;
   out.authorizations=this.db.prepare(ORPHAN_GRANTS).run().changes;
   this.store.audit('LOCAL_USER','TEST_DATA_DELETED','installation',{categories:[...selected],counts:out});
   return out;
  });
  // 用户要的是把库打回干净状态：删完把空闲页还给磁盘，文件里不留已删行的残影。
  this.db.exec('VACUUM');
  return {deleted:true,counts};
 }
}
module.exports={LocalReset};
