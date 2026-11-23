'use strict';
const {randomInt,randomUUID}=require('node:crypto');
const {LocalError,canonical,hash}=require('./database.cjs');
const {LocalReview}=require('./review.cjs');
const {assertConfiguredSendAccount}=require('./account-safety.cjs');
const {currentQuotaDay}=require('./send-safety.cjs');
const policy=require('@crm/local-runtime/policy');

const ACTIVE=['WAITING_SWITCH','READY','WAITING_QUOTA','SENDING'];
const QUEUE_TYPES=['AUTOMATIC_QUEUE','MANUAL_QUEUE'];
const DAY_MS=86400000,MAX_AGE_MS=7*DAY_MS,RETENTION_MS=30*DAY_MS;
const AUTO_ORIGINS=['AUTO','MANUAL_REVIEW'];

function dayAt(timestamp){const f=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit'});return f.format(new Date(timestamp));}
function dayStart(timestamp){return Date.parse(dayAt(timestamp)+'T00:00:00+08:00');}
function settings(db){const row=db.prepare("SELECT value FROM settings WHERE key='automation-steps'").get();try{return row?JSON.parse(row.value):{};}catch{return {};}}
function publishedAt(snapshot){const value=snapshot&&snapshot.publishedAt;const at=typeof value==='string'?Date.parse(value):NaN;return Number.isFinite(at)?at:null;}
function limitOf(account,dailyLimit){const override=account.daily_limit_override;return Math.min(...[override,dailyLimit,account.daily_limit].filter(value=>Number.isFinite(value)&&value>0));}
function sample(list,seed){if(!list.length)return null;return list[Math.abs(seed)%list.length];}
function shuffle(list){const copy=[...list];for(let index=copy.length-1;index>0;index--){const swap=randomInt(index+1);[copy[index],copy[swap]]=[copy[swap],copy[index]];}return copy;}
function parseChannels(value){try{const list=Array.isArray(value)?value:JSON.parse(value);return [...new Set((Array.isArray(list)?list:[]).filter(channel=>channel==='COMMENT'||channel==='DM'))];}catch{return [];}}
function channelOn(steps,channel){if(steps.autoReply!==true)return false;return channel==='COMMENT'?steps.autoComment!==false:steps.autoDm!==false;}
function offReason(steps){return steps.autoReply===true?'AUTO_CHANNEL_OFF':'AUTO_REPLY_OFF';}

class LocalSendQueue{
 constructor(store){this.store=store;this.db=store.db;this.review=new LocalReview(store);}

 /* ---------- 入队规则 ---------- */
 rules(){
  return this.db.prepare('SELECT q.*,p.name policy_name FROM queue_rules q LEFT JOIN review_policies p ON p.id=q.policy_id ORDER BY q.system_default DESC,q.created_at,q.id').all().map(row=>({id:row.id,policyId:row.policy_id,policyName:row.policy_name??null,threshold:row.threshold,channels:parseChannels(row.channels),enabled:row.enabled===1,systemDefault:row.system_default===1,version:row.version,updatedAt:row.updated_at}));
 }
 ruleForPolicy(policyId){return this.db.prepare('SELECT * FROM queue_rules WHERE policy_id=?').get(policyId)??null;}
 rule(id){return this.db.prepare('SELECT * FROM queue_rules WHERE id=?').get(id)??null;}
 saveRule({id,policyId,threshold,channels,enabled=true,version=0}={}){
  const existing=id?this.rule(id):(policyId?this.ruleForPolicy(policyId):null);
  if(!existing&&!policyId)throw new LocalError('QUEUE_RULE_POLICY_REQUIRED');
  const targetPolicy=existing?existing.policy_id:policyId;
  if(typeof targetPolicy!=='string'||!this.db.prepare('SELECT 1 FROM review_policies WHERE id=? AND NOT EXISTS(SELECT 1 FROM configurations c WHERE c.id=review_policies.id AND c.archived=1)').get(targetPolicy))throw new LocalError('REVIEW_POLICY_CHANGED');
  if(!Number.isInteger(threshold)||threshold<0||threshold>100)throw new LocalError('INVALID_QUEUE_RULE');
  if(!Array.isArray(channels)||!channels.length||new Set(channels).size!==channels.length||channels.some(channel=>channel!=='COMMENT'&&channel!=='DM'))throw new LocalError('INVALID_QUEUE_RULE');
  if(typeof enabled!=='boolean')throw new LocalError('INVALID_QUEUE_RULE');
  return this.store.transaction(()=>{
   const now=this.store.clock();
   if(existing){
    if(!Number.isInteger(version)||version!==existing.version)throw new LocalError('QUEUE_RULE_CHANGED');
    this.db.prepare('UPDATE queue_rules SET threshold=?,channels=?,enabled=?,version=version+1,updated_at=? WHERE id=?').run(threshold,canonical(channels),enabled?1:0,now,existing.id);
    this.store.audit('LOCAL_USER','QUEUE_RULE_SAVED',existing.id,{threshold,channels,enabled,version:existing.version+1});
    return this.rules().find(rule=>rule.id===existing.id);
   }
   if(version!==0&&version!==null&&version!==undefined)throw new LocalError('QUEUE_RULE_CHANGED');
   if(this.ruleForPolicy(targetPolicy))throw new LocalError('QUEUE_RULE_CHANGED');
   const ruleId=randomUUID();
   this.db.prepare('INSERT INTO queue_rules(id,policy_id,threshold,channels,enabled,system_default,version,created_at,updated_at) VALUES(?,?,?,?,?,0,1,?,?)').run(ruleId,targetPolicy,threshold,canonical(channels),enabled?1:0,now,now);
   this.store.audit('LOCAL_USER','QUEUE_RULE_SAVED',ruleId,{policyId:targetPolicy,threshold,channels,enabled,version:1});
   return this.rules().find(rule=>rule.id===ruleId);
  });
 }
 deleteRule({id,version}={}){
  const row=id?this.rule(id):null;
  if(!row)throw new LocalError('QUEUE_RULE_NOT_FOUND');
  if(row.system_default===1)throw new LocalError('QUEUE_RULE_SYSTEM_DEFAULT');
  if(!Number.isInteger(version)||version!==row.version)throw new LocalError('QUEUE_RULE_CHANGED');
  return this.store.transaction(()=>{this.db.prepare('DELETE FROM queue_rules WHERE id=?').run(id);this.store.audit('LOCAL_USER','QUEUE_RULE_DELETED',id,{policyId:row.policy_id});return {id};});
 }

 /* ---------- 入队 ---------- */
 enqueueAfterReview(runId){return this.store.transaction(()=>{
  const run=this.db.prepare('SELECT * FROM collection_runs WHERE id=?').get(runId);
  if(!run)throw new LocalError('RUN_NOT_FOUND');
  if(!this.review.barrier(runId).ready)return {waiting:true,queued:0,skipped:0};
  const steps=settings(this.db),now=this.store.clock();
  const reviews=this.db.prepare("SELECT r.*,b.run_id,b.policy_id,b.policy_revision,b.model,c.user_id,c.ordinal,c.platform_id,c.body,c.source_hash current_source_hash,c.snapshot comment_snapshot,c.post_id,p.platform_id post_platform_id FROM review_results r JOIN review_batches b ON b.id=r.batch_id JOIN run_comments c ON c.id=r.comment_id JOIN run_posts p ON p.id=c.post_id WHERE b.run_id=? AND b.state='COMPLETED' ORDER BY c.ordinal,r.id").all(runId);
  let queued=0,skipped=0;
  const claimed=new Set();
  for(const row of reviews){
   const rule=this.ruleForPolicy(row.policy_id);
   if(!rule||rule.enabled!==1){skipped++;continue;}
   for(const channel of parseChannels(rule.channels)){
    const key=row.user_id+'\u0000'+channel;
    if(claimed.has(key))continue;
    if(!this.eligible(row,channel,rule,'AUTO')){continue;}
    if(this.existing(row.user_id,channel)){claimed.add(key);skipped++;continue;}
    const plan=this.freezePlan(rule,row,channel,'AUTO',steps);
    const published=publishedAt(JSON.parse(row.comment_snapshot||'{}'));
    const expires=Math.min(now+MAX_AGE_MS,published!==null?published+MAX_AGE_MS:now+MAX_AGE_MS);
    const state=this.enqueueState(channel,steps,published,now);
    this.insert({runId:row.run_id,reviewId:row.id,commentId:row.comment_id,channel,recipientId:row.user_id,origin:'AUTO',state:state.state,priority:0,manualNow:0,plan,published,expires,now,reason:state.reason});
    claimed.add(key);queued++;
   }
  }
  if(queued)this.store.audit('AUTOMATION','SEND_QUEUE_AUTO_ENQUEUED',runId,{queued});
  return {queued,skipped};
 });}

 enqueueReview(reviewId){return this.store.transaction(()=>this.enqueueReviewInTransaction(reviewId));}
 enqueueReviewInTransaction(reviewId){
  const row=this.db.prepare("SELECT r.*,b.run_id,b.policy_id,b.policy_revision,b.model,c.user_id,c.ordinal,c.platform_id,c.body,c.source_hash current_source_hash,c.snapshot comment_snapshot,c.post_id,p.platform_id post_platform_id FROM review_results r JOIN review_batches b ON b.id=r.batch_id JOIN run_comments c ON c.id=r.comment_id JOIN run_posts p ON p.id=c.post_id WHERE r.id=?").get(reviewId);
  if(!row)throw new LocalError('REVIEW_RESULT_NOT_FOUND');
  if(row.review_status!=='APPROVED')throw new LocalError('REVIEW_NOT_APPROVED');
  const rule=this.ruleForPolicy(row.policy_id);
  if(!rule)throw new LocalError('QUEUE_RULE_CONFIGURATION_MISSING');
  const channels=parseChannels(rule.channels);
  if(!channels.length)throw new LocalError('QUEUE_RULE_CONFIGURATION_MISSING');
  const now=this.store.clock(),steps=settings(this.db);
  let queued=0;
  for(const channel of channels){
   if(this.existing(row.user_id,channel))continue;
   if(!this.eligible(row,channel,rule,'MANUAL_REVIEW'))throw new LocalError('SEND_QUEUE_ELIGIBILITY_CHANGED');
   const plan=this.freezePlan(rule,row,channel,'MANUAL_REVIEW',steps);
   const published=publishedAt(JSON.parse(row.comment_snapshot||'{}'));
   const expires=Math.min(now+MAX_AGE_MS,published!==null?published+MAX_AGE_MS:now+MAX_AGE_MS);
   const state=this.enqueueState(channel,steps,published,now);
   this.insert({runId:row.run_id,reviewId:row.id,commentId:row.comment_id,channel,recipientId:row.user_id,origin:'MANUAL_REVIEW',state:state.state,priority:0,manualNow:0,plan,published,expires,now,reason:state.reason});
   queued++;
  }
  if(queued)this.store.audit('LOCAL_USER','SEND_QUEUE_REVIEW_ENQUEUED',reviewId,{queued});
  return {queued};
 }

 /* ---------- 生成待发送 ---------- */
 generate({apply=false}={}){
  const steps=settings(this.db),now=this.store.clock();
  const rows=this.db.prepare("SELECT r.id,r.comment_id,r.review_status,r.decision,r.manual_decision,r.score,r.context,r.source_hash,r.version,r.evidence,r.automatic_contact_allowed,r.created_at,b.run_id,b.policy_id,c.user_id,c.body,c.source_hash current_source_hash,c.snapshot comment_snapshot,q.id rule_id,q.threshold,q.channels,q.enabled,q.version rule_version FROM review_results r JOIN review_batches b ON b.id=r.batch_id JOIN run_comments c ON c.id=r.comment_id JOIN queue_rules q ON q.policy_id=b.policy_id AND q.enabled=1 WHERE b.state='COMPLETED' AND r.review_status IN('PENDING','APPROVED') AND (r.review_status='APPROVED' OR r.score>=q.threshold) AND ((r.review_status='APPROVED' AND coalesce(r.manual_decision,r.decision)='MATCH') OR (r.review_status='PENDING' AND r.decision='MATCH')) ORDER BY r.created_at DESC,r.id").all();
  const claimed=new Set(),comments=new Set(),existing=this.existingIndex(rows),pools=new Map();let accounts=null;
  let commentRows=0,dmRows=0,expired=0,skipped=0;
  const inserts=[];
  for(const row of rows){
   const rule={id:row.rule_id,policy_id:row.policy_id,threshold:row.threshold,channels:row.channels,version:row.rule_version,enabled:row.enabled};
   const origin=row.review_status==='APPROVED'?'MANUAL_REVIEW':'AUTO';
   for(const channel of parseChannels(rule.channels)){
    const key=row.user_id+'\u0000'+channel;
    if(claimed.has(key))continue;
    if(!this.eligible(row,channel,rule,origin)){skipped++;continue;}
    if(this.existing(row.user_id,channel,existing)){claimed.add(key);skipped++;continue;}
    const pool=pools.get(channel)??{templates:this.templatePool(steps,channel),accounts:accounts??(accounts=this.accountPool(steps))};
    pools.set(channel,pool);
    const plan=this.freezePlan(rule,row,channel,origin,steps,pool);
    const published=publishedAt(JSON.parse(row.comment_snapshot||'{}'));
    const expires=Math.min(now+MAX_AGE_MS,published!==null?published+MAX_AGE_MS:now+MAX_AGE_MS);
    const state=this.enqueueState(channel,steps,published,now);
    if(state.state==='EXPIRED')expired++;
    claimed.add(key);comments.add(row.id);
    if(apply)inserts.push({runId:row.run_id,reviewId:row.id,commentId:row.comment_id,channel,recipientId:row.user_id,origin,state:state.state,priority:0,manualNow:0,plan,published,expires,now,reason:state.reason});
    if(channel==='COMMENT')commentRows++;else dmRows++;
   }
  }
  if(apply&&inserts.length)this.store.transaction(()=>{for(const item of inserts)this.insert(item);this.store.audit('LOCAL_USER','SEND_QUEUE_GENERATED','all',{comments:comments.size,commentRows,dmRows,expired,skipped});});
  return {apply:!!apply,comments:comments.size,commentRows,dmRows,expired,skipped};
 }

 /* ---------- 调度 ---------- */
 schedule(){const steps=settings(this.db);return this.store.transaction(()=>{
  const now=this.store.clock();
  this.expire(now);
  this.purge(now);
  this.recoverRows(now);
  if(this.db.prepare("SELECT 1 FROM send_queue WHERE state='SENDING' LIMIT 1").get())return {started:false};
  for(const row of this.db.prepare("SELECT id,channel,state FROM send_queue WHERE manual_now=0 AND state IN('WAITING_SWITCH','READY','WAITING_QUOTA')").all()){
   const on=channelOn(steps,row.channel);
   if(on&&row.state==='WAITING_SWITCH')this.db.prepare("UPDATE send_queue SET state='READY',reason=NULL,updated_at=? WHERE id=?").run(now,row.id);
   else if(!on&&row.state!=='WAITING_SWITCH')this.db.prepare("UPDATE send_queue SET state='WAITING_SWITCH',reason=?,updated_at=? WHERE id=?").run(offReason(steps),now,row.id);
  }
  if(this.db.prepare("SELECT 1 FROM safety_state WHERE id IN('sending','platform') AND reason IS NOT NULL").get())return {started:false,paused:true};
  const rows=this.db.prepare("SELECT * FROM send_queue WHERE state IN('READY','WAITING_QUOTA') ORDER BY priority DESC,enqueued_at,id LIMIT 20").all();
  for(const row of rows){
   const result=this.scheduleOne(row,now);
   if(result.started)return {started:true,id:result.id};
  }
  return {started:false};
 });}

 scheduleOne(row,now){
  const steps=settings(this.db);
  let plan=JSON.parse(row.plan);
  const rowData=this.db.prepare("SELECT r.*,b.run_id,b.policy_id,b.policy_revision,b.model,c.user_id,c.platform_id,c.body,c.source_hash current_source_hash,c.snapshot comment_snapshot,c.post_id,p.platform_id post_platform_id FROM review_results r JOIN review_batches b ON b.id=r.batch_id JOIN run_comments c ON c.id=r.comment_id JOIN run_posts p ON p.id=c.post_id WHERE r.id=?").get(row.review_id);
  if(!rowData||!this.eligible(rowData,row.channel,{threshold:plan.threshold},row.manual_now===1?'MANUAL_SEND':row.origin)){
   this.db.prepare("UPDATE send_queue SET state='FAILED',reason=?,updated_at=?,settled_at=? WHERE id=?").run('ELIGIBILITY_CHANGED',now,now,row.id);
   this.store.audit('AUTOMATION','SEND_QUEUE_ELIGIBILITY_FAILED',row.id,{});
   return {started:false};
  }
  if(!(plan.templates??[]).length||!(plan.accounts??[]).length){
   const rule=this.ruleForPolicy(plan.policyId);
   if(rule){plan=this.freezePlan(rule,rowData,row.channel,row.manual_now===1?'MANUAL_SEND':row.origin,steps);this.db.prepare('UPDATE send_queue SET plan=?,updated_at=? WHERE id=?').run(canonical(plan),now,row.id);}
  }
  const refreshed=this.refreshAccounts(plan.accounts??[]);
  if(refreshed.changed){plan={...plan,accounts:refreshed.accounts};this.db.prepare('UPDATE send_queue SET plan=?,updated_at=? WHERE id=?').run(canonical(plan),now,row.id);}
  const picked=this.pickAccount(row,plan,now);
  if(!picked.item){this.db.prepare("UPDATE send_queue SET state='WAITING_QUOTA',reason=?,updated_at=? WHERE id=?").run(picked.reason,now,row.id);return {started:false};}
  const account=picked.item;
  const template=this.pickTemplate(plan,row.channel,account.account.id,row.id);
  if(!template){this.db.prepare("UPDATE send_queue SET state='FAILED',reason=?,updated_at=?,settled_at=? WHERE id=?").run('TEMPLATE_CHANGED',now,now,row.id);return {started:false};}
  const manual=row.manual_now===1;
  const scope=this.buildScope(row,plan,rowData,account.account,template,manual);
  const at=this.slot(row,plan,account.account.id,now);
  const authId=randomUUID(),jobId=randomUUID(),jobAt=Math.max(now,at);
  this.db.prepare("INSERT INTO authorizations(id,purpose,scope,scope_hash,state,issuer,parent_proof,created_at,expires_at) VALUES(?,'SEND',?,?,'ACTIVE',?,?,?,?)").run(authId,canonical(scope),hash(scope),manual?'LOCAL_USER':(row.origin==='MANUAL_SEND'?'LOCAL_USER':'AUTOMATION'),canonical({queueId:row.id,runId:row.run_id}),now,Math.min(now+900000,now+3600000));
  this.db.prepare("INSERT INTO jobs(id,request_key,kind,payload,payload_hash,authorization_id,state,created_at,updated_at,available_at) VALUES(?,?,'SEND',?,?,?,'QUEUED',?,?,?)").run(jobId,'sendq:'+row.id+':'+randomUUID(),canonical(scope),hash(scope),authId,now,now,jobAt);
  this.db.prepare("UPDATE send_queue SET state='SENDING',account_id=?,template_id=?,job_id=?,scope_hash=?,reason=NULL,updated_at=? WHERE id=?").run(account.account.id,template.templateId??null,jobId,hash(scope),now,row.id);
  this.store.audit('AUTOMATION','SEND_QUEUE_DISPATCHED',row.id,{jobId,accountId:account.account.id,channel:row.channel,availableAt:jobAt});
  return {started:true,id:jobId};
 }

 pickAccount(row,plan,now){
  const accounts=plan.accounts??[],available=[];
  let blocked=false,quota=false;
  for(const candidate of accounts){
   try{
    const account=assertConfiguredSendAccount(this.store,candidate.id,candidate.version,row.channel);
    const day=currentQuotaDay(this.store),used=this.db.prepare('SELECT occupied,daily_limit_override FROM account_days WHERE account_id=? AND day=?').get(candidate.id,day);
    if(used?.daily_limit_override===0){quota=true;continue;}
    const limit=limitOf(used?.daily_limit_override!=null?{...account,daily_limit_override:used.daily_limit_override}:account,candidate.dailyLimit);
    if(!(limit>0)){quota=true;continue;}
    const pending=this.db.prepare("SELECT count(*) n FROM jobs j WHERE j.kind='SEND' AND j.state IN('QUEUED','RUNNING') AND json_extract(j.payload,'$.accountId')=? AND NOT EXISTS(SELECT 1 FROM send_attempts a WHERE a.request_key=j.request_key)").get(candidate.id).n;
    if((used?.occupied??0)+pending>=limit){quota=true;continue;}
    available.push({account,version:candidate.version,dailyLimit:candidate.dailyLimit,limit,remaining:limit-(used?.occupied??0)-pending});
   }catch{blocked=true;}
  }
  if(!available.length)return {item:null,reason:blocked&&!quota?'ACCOUNT_POOL_UNAVAILABLE':quota?'ACCOUNT_POOL_QUOTA_EXHAUSTED':'ACCOUNT_POOL_EMPTY'};
  const last=this.lastScheduled();
  if(last){
   const same=available.find(item=>item.account.id===last.accountId);
   if(same&&same.remaining>0){
    const target=1+hashNumber(dayAt(now)+same.account.id)%5;
    const done=this.db.prepare("SELECT count(*) n FROM send_attempts WHERE account_id=? AND channel=? AND created_at>=?").get(same.account.id,row.channel,dayStart(now)).n;
    if(done<target)return {item:same,reason:null};
   }
  }
  const others=last?available.filter(item=>item.account.id!==last.accountId):available;
  return {item:sample(others.length?others:available,hashNumber(row.id+':'+now)),reason:null};
 }

 pickTemplate(plan,channel,accountId,queueId){
  const pool=(plan.templates??[]).filter(template=>template.channel===channel);
  if(!pool.length)return null;
  const last=this.db.prepare('SELECT template_id FROM send_attempts WHERE account_id=? AND channel=? ORDER BY created_at DESC,rowid DESC LIMIT 1').get(accountId,channel)?.template_id??null;
  const fresh=pool.length>1?pool.filter(template=>template.templateId!==last):pool;
  return sample(fresh.length?fresh:pool,hashNumber(queueId+accountId));
 }

 buildScope(row,plan,rowData,account,template,manual=false){
  const basis={type:manual?'MANUAL_QUEUE':'AUTOMATIC_QUEUE',queueId:row.id,runId:row.run_id,reviewId:row.review_id,ruleId:plan.ruleId,ruleVersion:plan.ruleVersion,templateId:template.templateId??null,templateVersion:template.templateVersion??null,eligibilityHash:plan.eligibilityHash};
  return {platform:'XHS',channel:row.channel,accountId:account.id,accountRevision:account.revision,recipientId:row.recipient_id,content:template.content,target:row.channel==='DM'?{recipientId:row.recipient_id}:{postId:rowData.post_platform_id,commentId:rowData.platform_id,recipientId:row.recipient_id},basis};
 }

 slot(row,plan,accountId,now){
  const last=this.lastScheduled();
  if(!last)return now;
  const same=last.accountId===accountId;
  const base=same?30000:180000,span=same?30000:120000;
  const offset=hashNumber(row.id+':'+accountId)%(span+1);
  return Math.max(now,last.at+base+offset);
 }

 lastScheduled(){const row=this.db.prepare("SELECT json_extract(payload,'$.accountId') accountId,available_at at FROM jobs WHERE kind='SEND' ORDER BY created_at DESC,rowid DESC LIMIT 1").get();return row?.accountId?{accountId:row.accountId,at:row.at}:null;}

 /* ---------- 结果 ---------- */
 settle(jobId){return this.store.transaction(()=>{
  const row=this.db.prepare('SELECT * FROM send_queue WHERE job_id=?').get(jobId);if(!row)return null;
  const job=this.db.prepare('SELECT * FROM jobs WHERE id=?').get(jobId);
  const attempt=this.db.prepare("SELECT state,evidence FROM send_attempts WHERE authorization_id=(SELECT authorization_id FROM jobs WHERE id=?) ORDER BY created_at DESC,rowid DESC LIMIT 1").get(jobId);
  const now=this.store.clock();let state='FAILED',reason=null;
  if(job?.state==='SUCCEEDED'||attempt?.state==='CONFIRMED'){state='SENT';}
  else if(job?.state==='UNKNOWN'||attempt?.state==='UNKNOWN'){state='UNKNOWN';reason=readReason(job,attempt)??'SUBMISSION_UNKNOWN';}
  else if(attempt?.state==='NOT_SUBMITTED'){state='FAILED';reason='NOT_SUBMITTED';}
  else {state='FAILED';reason=readReason(job,attempt)??(job?.state??'SEND_FAILED');}
  const settled=state==='SENT'||state==='FAILED'||state==='UNKNOWN';
  this.db.prepare('UPDATE send_queue SET state=?,reason=?,updated_at=?,settled_at=? WHERE id=?').run(state,reason,now,settled?now:null,row.id);
  this.store.audit('AUTOMATION','SEND_QUEUE_SETTLED',row.id,{jobId,state,reason});
  return {id:row.id,state,reason};
 });}

 /* ---------- 人工操作 ---------- */
 retry(id){return this.store.transaction(()=>{
  const row=this.require(id);
  if(row.state!=='FAILED')throw new LocalError('SEND_QUEUE_NOT_RETRYABLE');
  const steps=settings(this.db),state=this.resumeState(row,steps);
  this.db.prepare('UPDATE send_queue SET state=?,reason=?,account_id=NULL,template_id=NULL,job_id=NULL,scope_hash=NULL,updated_at=?,settled_at=NULL WHERE id=?').run(state.state,state.reason,this.store.clock(),id);
  this.store.audit('LOCAL_USER','SEND_QUEUE_RETRIED',id,{});
  return {id};
 });}

 requeue(id,{override=false}={}){return this.store.transaction(()=>{
  const row=this.require(id),now=this.store.clock();
  if(row.state!=='EXPIRED')throw new LocalError('SEND_QUEUE_NOT_EXPIRED');
  if(row.comment_published_at!==null&&row.comment_published_at+MAX_AGE_MS<=now&&!override)throw new LocalError('COMMENT_TOO_OLD');
  const steps=settings(this.db),state=this.resumeState(row,steps);
  this.db.prepare('UPDATE send_queue SET state=?,reason=?,account_id=NULL,template_id=NULL,job_id=NULL,scope_hash=NULL,enqueued_at=?,expires_at=?,updated_at=?,settled_at=NULL WHERE id=?').run(state.state,override?'MANUAL_RECOVERED':state.reason,now,now+MAX_AGE_MS,now,id);
  this.store.audit('LOCAL_USER','SEND_QUEUE_REQUEUED',id,{override});
  return {id};
 });}

 cancel(id){return this.store.transaction(()=>{
  const row=this.require(id);
  if(row.state==='SENDING')throw new LocalError('SEND_QUEUE_SENDING');
  if(!ACTIVE.includes(row.state)&&row.state!=='WAITING_QUOTA')throw new LocalError('SEND_QUEUE_NOT_CANCELLABLE');
  this.db.prepare("UPDATE send_queue SET state='CANCELLED',reason=?,updated_at=?,settled_at=? WHERE id=?").run('CANCELLED_BY_USER',this.store.clock(),this.store.clock(),id);
  this.store.audit('LOCAL_USER','SEND_QUEUE_CANCELLED',id,{});
  return {id};
 });}

 dismiss(id){return this.store.transaction(()=>{
  const row=this.require(id);
  if(!['FAILED','UNKNOWN','EXPIRED'].includes(row.state))throw new LocalError('SEND_QUEUE_NOT_DISMISSABLE');
  this.db.prepare("UPDATE send_queue SET state='CANCELLED',reason=?,updated_at=?,settled_at=? WHERE id=?").run('DISMISSED',this.store.clock(),this.store.clock(),id);
  this.store.audit('LOCAL_USER','SEND_QUEUE_DISMISSED',id,{});
  return {id};
 });}

 sendNow({ids,accountId,templateId,templateIds}){return this.store.transaction(()=>{
  if(!Array.isArray(ids)||!ids.length||ids.length>200)throw new LocalError('INVALID_SEND_QUEUE_SELECTION');
  if(typeof accountId!=='string'||!accountId)throw new LocalError('ACCOUNT_NOT_FOUND');
  const requested=Array.isArray(templateIds)?templateIds:(typeof templateId==='string'&&templateId?[templateId]:[]);
  if(!requested.length||requested.length>100||requested.some(id=>typeof id!=='string'||!id))throw new LocalError('SEND_QUEUE_TEMPLATE_REQUIRED');
  const rows=ids.map(id=>this.require(id));
  const channel=rows[0].channel;
  if(rows.some(row=>row.channel!==channel))throw new LocalError('SEND_QUEUE_CHANNEL_MIXED');
  if(rows.some(row=>!['WAITING_SWITCH','READY','WAITING_QUOTA','FAILED'].includes(row.state)))throw new LocalError('SEND_QUEUE_NOT_SENDABLE');
  const account=this.db.prepare('SELECT * FROM accounts WHERE id=?').get(accountId);
  if(!account)throw new LocalError('ACCOUNT_NOT_FOUND');
  assertConfiguredSendAccount(this.store,account.id,account.revision,channel);
  const unique=[...new Set(requested)],pool=unique.map(id=>this.template(id,channel));
  const order=shuffle(pool),last=this.db.prepare('SELECT template_id FROM send_attempts WHERE account_id=? AND channel=? ORDER BY created_at DESC,rowid DESC LIMIT 1').get(accountId,channel)?.template_id??null;
  if(order.length>1&&order[0].id===last){const index=order.findIndex(item=>item.id!==last);if(index>0)[order[0],order[index]]=[order[index],order[0]];}
  const now=this.store.clock(),batchId=randomUUID();
  for(const [index,row] of rows.entries()){
   const template=order[index%order.length],plan=JSON.parse(row.plan);
   plan.manualBatchId=batchId;
   plan.accounts=[{id:account.id,version:account.revision,dailyLimit:account.daily_limit}];
   plan.templates=[{channel:template.channel,templateId:template.id,templateVersion:template.revision,content:template.content}];
   this.db.prepare("UPDATE send_queue SET state='READY',priority=1,manual_now=1,plan=?,reason=NULL,account_id=NULL,template_id=NULL,job_id=NULL,scope_hash=NULL,updated_at=?,settled_at=NULL WHERE id=?").run(canonical(plan),now,row.id);
  }
  this.store.audit('LOCAL_USER','SEND_QUEUE_SEND_NOW',ids[0],{count:rows.length,accountId,templateIds:unique,channel});
  return {count:rows.length};
 });}

 /* ---------- 查询 ---------- */
 list({tab='pending',page=1,pageSize=20,query='',channel=''}={}){
  const tabs={queue:ACTIVE,attention:['FAILED','UNKNOWN','EXPIRED'],pending:['WAITING_SWITCH','READY','SENDING'],quota:['WAITING_QUOTA'],sending:['SENDING'],failed:['FAILED'],unknown:['UNKNOWN'],expired:['EXPIRED']};
  if(!tabs[tab])throw new LocalError('INVALID_SEND_QUEUE_TAB');
  if(channel&&channel!=='COMMENT'&&channel!=='DM')throw new LocalError('INVALID_PENDING_FILTER');
  const states=tabs[tab],size=Math.min(100,Math.max(1,Number(pageSize)||20)),current=Math.max(1,Number(page)||1);
  const args=[...states],where='q.state IN('+states.map(()=>'?').join(',')+')';
  let filter=where;
  if(channel){filter+=' AND q.channel=?';args.push(channel);}
  if(typeof query==='string'&&query.trim()){filter+=" AND (c.body LIKE ? OR p.snapshot LIKE ? OR q.recipient_id LIKE ? OR json_extract(c.snapshot,'$.authorNickname') LIKE ?)";const like='%'+query.trim()+'%';args.push(like,like,like,like);}
  const total=this.db.prepare('SELECT count(*) n FROM send_queue q JOIN run_comments c ON c.id=q.comment_id JOIN run_posts p ON p.id=c.post_id WHERE '+filter).get(...args).n;
  const rows=this.db.prepare("SELECT q.*,c.body,c.ordinal,json_extract(c.snapshot,'$.authorNickname') recipient_nickname,p.snapshot post_snapshot,r.score,r.decision,a.name account_name,(SELECT count(*) FROM send_queue x WHERE x.run_id=q.run_id AND x.channel=q.channel AND x.recipient_id=q.recipient_id AND x.state IN('WAITING_SWITCH','READY','WAITING_QUOTA','SENDING','SENT')) same_recipient FROM send_queue q JOIN run_comments c ON c.id=q.comment_id JOIN run_posts p ON p.id=c.post_id JOIN review_results r ON r.id=q.review_id LEFT JOIN accounts a ON a.id=q.account_id WHERE "+filter+' ORDER BY q.priority DESC,q.enqueued_at ASC,q.id ASC LIMIT ? OFFSET ?').all(...args,size,(current-1)*size);
  return {items:rows.map(row=>{const snapshot=JSON.parse(row.post_snapshot||'{}'),plan=JSON.parse(row.plan||'{}');return {id:row.id,runId:row.run_id,reviewId:row.review_id,commentId:row.comment_id,channel:row.channel,origin:row.origin,state:row.state,reason:row.reason,priority:row.priority,accountId:row.account_id,accountName:row.account_name,templateId:row.template_id,batchId:plan.manualBatchId??null,comment:row.body,commentOrdinal:row.ordinal,postTitle:snapshot.title??snapshot.displayTitle??null,score:row.score,decision:row.decision,recipientId:row.recipient_id,recipientNickname:row.recipient_nickname??null,ruleId:plan.ruleId??null,enqueuedAt:row.enqueued_at,expiresAt:row.expires_at,commentPublishedAt:row.comment_published_at,updatedAt:row.updated_at};}),total,page:current,pageSize:size};
 }

 summary(){
  const counts={};for(const row of this.db.prepare('SELECT state,count(*) n FROM send_queue GROUP BY state').all())counts[row.state]=row.n;
  const steps=settings(this.db),now=this.store.clock(),day=currentQuotaDay(this.store);
  let remaining=0;
  for(const accountId of steps.replyAccountIds??[]){
   const account=this.db.prepare('SELECT * FROM accounts WHERE id=?').get(accountId);if(!account)continue;
   if(account.state!=='VERIFIED'||!account.session_ref||!account.platform_user_id)continue;
   const usage=this.db.prepare('SELECT occupied,daily_limit_override FROM account_days WHERE account_id=? AND day=?').get(accountId,day),used=usage?.occupied??0;
   const limit=Math.min(...[usage?.daily_limit_override,account.daily_limit].filter(value=>Number.isFinite(value)&&value>0));
   if(Number.isFinite(limit))remaining+=Math.max(0,limit-used);
  }
  const pause=this.db.prepare("SELECT reason FROM safety_state WHERE id IN('sending','platform') AND reason IS NOT NULL ORDER BY created_at DESC LIMIT 1").get();
  const checking=this.db.prepare("SELECT count(*) n FROM evidence_auto_tasks WHERE state IN('WAITING','RUNNING')").get().n;
  const current=this.db.prepare("SELECT q.state,q.reason,q.channel,q.recipient_id,q.plan,q.updated_at,c.body,json_extract(c.snapshot,'$.authorNickname') recipient_nickname,p.snapshot post_snapshot,a.name account_name,json_extract(q.plan,'$.manualBatchId') batch_id FROM send_queue q JOIN run_comments c ON c.id=q.comment_id JOIN run_posts p ON p.id=c.post_id LEFT JOIN accounts a ON a.id=q.account_id WHERE q.state IN('WAITING_SWITCH','READY','WAITING_QUOTA','SENDING') AND json_extract(q.plan,'$.manualBatchId') IS NOT NULL ORDER BY (q.state='SENDING') DESC,q.enqueued_at,q.id LIMIT 1").get();
  let progress=null;
  if(current){
   const batch=this.db.prepare("SELECT count(*) total,coalesce(sum(state='SENT'),0) done,coalesce(sum(state IN('FAILED','UNKNOWN','EXPIRED')),0) failed FROM send_queue WHERE json_extract(plan,'$.manualBatchId')=?").get(current.batch_id);
   const snapshot=JSON.parse(current.post_snapshot||'{}');
   progress={batchId:current.batch_id,state:current.state,reason:current.reason??null,total:batch.total,done:batch.done,failed:batch.failed,channel:current.channel,comment:current.body,postTitle:snapshot.title??snapshot.displayTitle??null,recipientNickname:current.recipient_nickname??null,accountName:current.account_name??null};
  }
  const pending=(counts.WAITING_SWITCH??0)+(counts.READY??0)+(counts.SENDING??0);
  const quota=counts.WAITING_QUOTA??0;
  return {queue:pending+quota,attention:(counts.FAILED??0)+(counts.UNKNOWN??0)+(counts.EXPIRED??0),pending,quota,failed:counts.FAILED??0,unknown:counts.UNKNOWN??0,expired:counts.EXPIRED??0,sending:counts.SENDING??0,autoReply:!!steps.autoReply,autoComment:steps.autoComment!==false,autoDm:steps.autoDm!==false,refreshTime:steps.refreshTime??'00:00',remaining,paused:!!pause,pauseReason:pause?.reason??null,checking,progress};
 }

 template(id,channel){const row=this.db.prepare('SELECT * FROM configurations WHERE id=?').get(id);if(!row||row.archived||row.kind!==channel+'_TEMPLATE')throw new LocalError('CONTACT_TEMPLATE_CHANGED');const body=JSON.parse(row.body),content=body.text??body.content;if(typeof content!=='string'||!content.trim())throw new LocalError('CONTACT_TEMPLATE_CHANGED');return {id:row.id,revision:row.revision,channel,content};}

 /* ---------- 授权校验 ---------- */
 assertScope(scope,grant){
  if(!scope||!QUEUE_TYPES.includes(scope.basis?.type))return false;
  const row=this.db.prepare('SELECT * FROM send_queue WHERE id=?').get(scope.basis.queueId);
  if(!row||row.state!=='SENDING'||hash(scope)!==row.scope_hash)throw new LocalError('SEND_AUTHORIZATION_ENDED');
  if(grant.issuer!==(scope.basis.type==='MANUAL_QUEUE'?'LOCAL_USER':'AUTOMATION')||grant.parent_proof!==canonical({queueId:row.id,runId:row.run_id}))throw new LocalError('SEND_AUTHORIZATION_ENDED');
  const plan=JSON.parse(row.plan),account=plan.accounts.find(item=>item.id===scope.accountId);
  return account?.dailyLimit??0;
 }

 /* ---------- 恢复 ---------- */
 recover(){return this.store.transaction(()=>{
  const now=this.store.clock();let failed=0;
  for(const row of this.db.prepare("SELECT * FROM send_queue WHERE state='SENDING'").all()){
   const job=row.job_id?this.db.prepare('SELECT state FROM jobs WHERE id=?').get(row.job_id):null;
   if(job&&['QUEUED','RUNNING'].includes(job.state))continue;
   this.db.prepare("UPDATE send_queue SET state='FAILED',reason=?,updated_at=?,settled_at=? WHERE id=?").run(job?.state==='UNKNOWN'?'SUBMISSION_UNKNOWN':'SEND_INTERRUPTED',now,now,row.id);
   failed++;
  }
  return {failed};
 });}

 /* ---------- 内部 ---------- */
 frozenRule(ref){return require('./contact.cjs').LocalContact.prototype.frozen.call({db:this.db},ref);}
 existingIndex(rows){
  const queue=new Set(),attempts=new Set(),key=(recipientId,channel)=>recipientId+'|'+channel;
  const recipients=[...new Set(rows.map(row=>row.user_id))];
  for(let index=0;index<recipients.length;index+=400){
   const chunk=recipients.slice(index,index+400),marks=chunk.map(()=>'?').join(',');
   for(const row of this.db.prepare(`SELECT recipient_id,channel FROM send_queue WHERE recipient_id IN (${marks}) AND state IN('WAITING_SWITCH','READY','WAITING_QUOTA','SENDING','SENT')`).all(...chunk))queue.add(key(row.recipient_id,row.channel));
   for(const row of this.db.prepare(`SELECT recipient_id,channel FROM send_attempts WHERE platform='XHS' AND recipient_id IN (${marks}) AND state IN('RESERVED','DISPATCHED','CONFIRMED','UNKNOWN')`).all(...chunk))attempts.add(key(row.recipient_id,row.channel));
  }
  return {queue,attempts};
 }
 existing(recipientId,channel,index=null){
  const key=recipientId+'|'+channel;
  if(index?index.queue.has(key):this.db.prepare("SELECT 1 FROM send_queue WHERE recipient_id=? AND channel=? AND state IN('WAITING_SWITCH','READY','WAITING_QUOTA','SENDING','SENT')").get(recipientId,channel))return true;
  return !!(index?index.attempts.has(key):this.db.prepare("SELECT 1 FROM send_attempts WHERE platform='XHS' AND channel=? AND recipient_id=? AND state IN('RESERVED','DISPATCHED','CONFIRMED','UNKNOWN')").get(channel,recipientId));
 }
 eligible(row,channel,rule,origin){
  if(row.source_hash!==row.current_source_hash)return false;
  if(origin==='AUTO'&&row.context!=='SUFFICIENT')return false;
  if(origin==='AUTO'){
   if(!row.automatic_contact_allowed||!['PENDING','APPROVED'].includes(row.review_status)||row.decision!=='MATCH'||row.score<rule.threshold)return false;
  }else if(origin==='MANUAL_REVIEW'){
   if(row.review_status!=='APPROVED'||row.manual_decision!=='MATCH')return false;
  }else if(origin!=='MANUAL_SEND'&&row.review_status==='REJECTED'){
   return false;
  }
  if(rule.channels&&!parseChannels(rule.channels).includes(channel))return false;
  const snapshot=JSON.parse(row.comment_snapshot||'{}'),evidence=JSON.parse(row.evidence||'[]');
  if(snapshot.comment!==row.body||snapshot.userId!==row.user_id)return false;
  return evidence.some(item=>item.source==='COMMENT'&&typeof item.quote==='string'&&item.quote.trim()&&row.body.includes(item.quote));
 }
 freezePlan(rule,row,channel,origin,steps,pool=null){
  const templates=pool?pool.templates:this.templatePool(steps,channel),accounts=pool?pool.accounts:this.accountPool(steps);
  return {ruleId:rule.id,policyId:rule.policy_id,ruleVersion:rule.version,ruleHash:hash({id:rule.id,version:rule.version,policyId:rule.policy_id,threshold:rule.threshold,channels:parseChannels(rule.channels)}),threshold:rule.threshold,channel,origin,templates,accounts,eligibilityHash:hash({reviewVersion:row.version,sourceHash:row.source_hash,score:row.score,decision:row.decision,context:row.context,evidence:JSON.parse(row.evidence||'[]')})};
 }
 templatePool(steps,channel){const ids=(channel==='DM'?steps.dmTemplateIds:steps.commentTemplateIds)??[];return ids.map(id=>{try{const item=this.template(id,channel);return {channel,templateId:item.id,templateVersion:item.revision,content:item.content};}catch{return null;}}).filter(Boolean);}
 accountPool(steps){return (steps.replyAccountIds??[]).map(id=>{const row=this.db.prepare('SELECT id,revision,daily_limit FROM accounts WHERE id=?').get(id);return row?{id:row.id,version:row.revision,dailyLimit:row.daily_limit}:null;}).filter(Boolean);}
 refreshAccounts(accounts){
  let changed=false;
  const next=accounts.map(candidate=>{const row=this.db.prepare('SELECT revision,daily_limit FROM accounts WHERE id=?').get(candidate.id);if(!row||(row.revision===candidate.version&&row.daily_limit===candidate.dailyLimit))return candidate;changed=true;return {...candidate,version:row.revision,dailyLimit:row.daily_limit};});
  return {accounts:next,changed};
 }
 enqueueState(channel,steps,published,now){
  if(published!==null&&published+MAX_AGE_MS<=now)return {state:'EXPIRED',reason:'COMMENT_TOO_OLD'};
  return channelOn(steps,channel)?{state:'READY',reason:null}:{state:'WAITING_SWITCH',reason:offReason(steps)};
 }
 resumeState(row,steps){
  if(row.manual_now===1)return {state:'READY',reason:null};
  return channelOn(steps,row.channel)?{state:'READY',reason:null}:{state:'WAITING_SWITCH',reason:offReason(steps)};
 }
 insert({runId,reviewId,commentId,channel,recipientId,origin,state,priority,manualNow,plan,published,expires,now,reason}){
  this.db.prepare('INSERT INTO send_queue(id,platform,run_id,review_id,comment_id,channel,recipient_id,origin,state,priority,manual_now,plan,reason,comment_published_at,enqueued_at,expires_at,created_at,updated_at) VALUES(?,\'XHS\',?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)').run(randomUUID(),runId,reviewId,commentId,channel,recipientId,origin,state,priority,manualNow,canonical(plan),reason,published,now,expires,now,now);
 }
 expire(now){const limit=now-MAX_AGE_MS;this.db.prepare("UPDATE send_queue SET state='EXPIRED',reason=CASE WHEN comment_published_at IS NOT NULL AND comment_published_at<=? THEN 'COMMENT_TOO_OLD' ELSE 'QUEUE_TOO_OLD' END,updated_at=?,settled_at=? WHERE state IN('WAITING_SWITCH','READY','WAITING_QUOTA','FAILED') AND (expires_at<=? OR (comment_published_at IS NOT NULL AND comment_published_at<=?))").run(limit,now,now,now,limit);}
 purge(now){return this.db.prepare("DELETE FROM send_queue WHERE state='EXPIRED' AND settled_at IS NOT NULL AND settled_at<=?").run(now-RETENTION_MS).changes;}
 recoverRows(now){for(const row of this.db.prepare("SELECT * FROM send_queue WHERE state='SENDING'").all()){const job=row.job_id?this.db.prepare('SELECT state FROM jobs WHERE id=?').get(row.job_id):null;if(job&&['QUEUED','RUNNING'].includes(job.state))continue;this.db.prepare("UPDATE send_queue SET state='FAILED',reason=?,updated_at=?,settled_at=? WHERE id=?").run(job?.state==='UNKNOWN'?'SUBMISSION_UNKNOWN':'SEND_INTERRUPTED',now,now,row.id);}}
 require(id){const row=this.db.prepare('SELECT * FROM send_queue WHERE id=?').get(id);if(!row)throw new LocalError('SEND_QUEUE_NOT_FOUND');return row;}
}
function readReason(job,attempt){try{const evidence=JSON.parse(attempt?.evidence||'null');return evidence?.reason??evidence?.code??null;}catch{return null;}}
function hashNumber(text){let value=2166136261;for(const char of String(text)){value^=char.codePointAt(0);value=Math.imul(value,16777619);}return value>>>0;}
module.exports={LocalSendQueue,QUEUE_TYPES,MAX_AGE_MS,dayAt};