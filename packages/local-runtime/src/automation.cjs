'use strict';
const {randomUUID}=require('node:crypto'),{LocalError,hash}=require('./database.cjs');
const {LocalContact,definition}=require('./contact.cjs'),{LocalReview}=require('./review.cjs');
const {dayAt}=require('./send-safety.cjs');
const {restricted,restrictedToday}=require('./account-safety.cjs');
/** 额度不足的跳过原因。只有它（或任务夭折）的条目会留在「待处理回复」里等人处理。 */
const QUOTA_EXHAUSTED='ACCOUNT_POOL_QUOTA_EXHAUSTED';
/** 当天有两个账号被平台限制：整个账号池本轮停止，剩余条目进「待处理回复」。 */
const POOL_STOPPED='ACCOUNT_POOL_RESTRICTED';
/** 换号续发：这一条被移到另一个账号上重排。 */
const ACCOUNT_SWITCHED='ACCOUNT_SWITCHED';
const DEAD_JOB="j.state IN('CANCELLED','FAILED','INTERRUPTED')";
const UNRESOLVED=`d.resolved_at IS NULL AND ((d.state='SKIPPED' AND d.reason IN('${QUOTA_EXHAUSTED}','${POOL_STOPPED}')) OR ${DEAD_JOB})`;
/** 账号级失败：换号就能继续，不该让整轮失败。 */
const SWITCHABLE=new Set(['ACCOUNT_HAS_RETAINED_RESTRICTION','ACCOUNT_RESTRICTED_TODAY','ACCOUNT_IDENTITY_CHANGED','COMMENT_CAPABILITY_REQUIRED']);
class LocalAutomation{
 constructor(store,{enabled=()=>false}={}){this.store=store;this.db=store.db;this.contact=new LocalContact(store);this.enabled=enabled;}
 list(){return this.db.prepare('SELECT * FROM contact_rules ORDER BY name,id').all().map(r=>({...definition(r),name:r.name,enabled:!!r.enabled}));}
 save({id=randomUUID(),name,input}){return this.contact.save(id,name,{...input,platform:'XHS'});}
 preview({id,version}){const r=this.db.prepare('SELECT * FROM contact_rules WHERE id=?').get(id);if(!r||r.version!==version)throw new LocalError('CONTACT_RULE_CHANGED');return {...definition(r),name:r.name,previewHash:hash(definition(r))};}
 authorize({id,version,previewHash,consent}){if(!this.enabled())throw new LocalError('SEND_EXECUTOR_UNAVAILABLE');if(consent!=='automatic-contact-frozen-run-v1'||this.preview({id,version}).previewHash!==previewHash)throw new LocalError('AUTOMATION_CONSENT_REQUIRED');return this.contact.authorize(id,version);}
 revoke({id}){return this.store.transaction(()=>{this.contact.revokeInTransaction(id);const rows=this.db.prepare("SELECT id,authorization_id FROM jobs WHERE kind='SEND' AND state IN('QUEUED','RUNNING') AND json_extract(payload,'$.basis.ruleId')=?").all(id);for(const row of rows){this.db.prepare("UPDATE jobs SET cancel_requested=1,state=CASE WHEN state='QUEUED' THEN 'CANCELLED' ELSE state END WHERE id=?").run(row.id);this.db.prepare("UPDATE authorizations SET state='REVOKED' WHERE id=? AND state='ACTIVE'").run(row.authorization_id);}return {disabled:true,cancelled:rows.length};});}
 frozen(ruleIds,policies){
  if(!Array.isArray(ruleIds)||ruleIds.length>100||new Set(ruleIds).size!==ruleIds.length)throw new LocalError('INVALID_AUTOMATION_SELECTION');
  return ruleIds.map(id=>{const r=this.db.prepare('SELECT * FROM contact_rules WHERE id=?').get(id);if(!r?.enabled||!policies.some(p=>p.id===r.policy_id&&p.revision===r.policy_revision))throw new LocalError('AUTOMATION_POLICY_NOT_SELECTED');const ref={id:r.id,version:r.version,hash:r.authorization_hash};this.contact.frozen(ref);return ref;});
 }
 /**
  * 从账号池里挑还放得下的账号：按顺序跳过今天被平台限制、有未解除风控记录、
  * 额度为 0 或已用满的账号。平台限制只停那一个账号，其余账号继续发；
  * 只有「今天已经有两个账号被限制」才判定整池本轮停止。
  */
 allocate(ref,rule,reviewId,channel,{templateId}={}){
  if(restrictedToday(this.store).length>=2)throw new LocalError(POOL_STOPPED);
  let restrictedSeen=false;
  for(const a of JSON.parse(rule.accounts)){
   if(!a.dailyLimit)continue;
   if(restricted(this.store,a.id)){restrictedSeen=true;continue;}
   let candidate;
   try{candidate=this.contact.plan(reviewId,ref.id,channel,a.id,{templateId}).scope;}
   catch(error){if(error instanceof LocalError&&SWITCHABLE.has(error.code)){restrictedSeen=true;continue;}throw error;}
   const day=dayAt(this.store.clock()),account=this.db.prepare('SELECT daily_limit FROM accounts WHERE id=?').get(a.id),usage=this.db.prepare('SELECT occupied,daily_limit_override FROM account_days WHERE account_id=? AND day=?').get(a.id,day);
   const pending=this.db.prepare("SELECT count(*) n FROM jobs j JOIN authorizations g ON g.id=j.authorization_id WHERE j.kind='SEND' AND j.state IN('QUEUED','RUNNING') AND j.cancel_requested=0 AND g.state='ACTIVE' AND g.expires_at>? AND json_extract(j.payload,'$.accountId')=? AND NOT EXISTS(SELECT 1 FROM send_attempts s WHERE s.request_key=j.request_key)").get(this.store.clock(),a.id).n;
   if((usage?.occupied??0)+pending>=Math.min(usage?.daily_limit_override??account.daily_limit,a.dailyLimit))continue;
   return {account:a,scope:candidate};
  }
  throw new LocalError(restrictedSeen?POOL_STOPPED:QUOTA_EXHAUSTED);
 }
 /** 上一条已排期发送的位置：同一账号连续 30-60 秒，换号后 3-5 分钟。间隔靠队列 available_at 实现。 */
 lastScheduled(){const row=this.db.prepare("SELECT available_at,json_extract(payload,'$.accountId') account_id FROM jobs WHERE kind='SEND' AND state IN('QUEUED','RUNNING') ORDER BY available_at DESC,created_at DESC LIMIT 1").get();return row&&row.account_id?{accountId:row.account_id,at:row.available_at}:null;}
 slot(prev,accountId,key){
  const now=this.store.clock();if(!prev)return {at:now,prev:{accountId,at:now}};
  const same=prev.accountId===accountId,base=same?30000:180000,span=same?30000:120000;
  const offset=parseInt(hash(String(key)+':'+accountId).slice(0,8),16)%(span+1),at=Math.max(now,prev.at+base+offset);
  return {at,prev:{accountId,at}};
 }
 afterReview(runId){
  if(!this.enabled()||!new LocalReview(this.store).barrier(runId).ready)return {waiting:true};
  const run=this.db.prepare('SELECT snapshot FROM collection_runs WHERE id=?').get(runId),refs=JSON.parse(run.snapshot).strictStages.contactRules||[];
  let queued=0,skipped=0,prev=this.lastScheduled();
  for(const ref of refs){const rule=this.db.prepare('SELECT * FROM contact_rules WHERE id=?').get(ref.id);if(!rule)continue;
   const rows=this.db.prepare('SELECT r.id FROM review_results r JOIN review_batches b ON b.id=r.batch_id WHERE b.run_id=? AND b.policy_id=? ORDER BY r.created_at,r.id').all(runId,rule.policy_id);
   // 每个渠道只排一次：同一渠道可以有多条模板，发送时从池里选一条。
   const channels=[...new Set(JSON.parse(rule.plans).map(p=>p.channel))];
   for(const row of rows)for(const channel of channels)this.store.transaction(()=>{
    if(this.db.prepare('SELECT 1 FROM automation_decisions WHERE run_id=? AND review_id=? AND rule_id=? AND channel=?').get(runId,row.id,ref.id,channel))return;
    let jobId=null,reason='RULE_JOB_CREATED';
    try{
     if(this.db.prepare("SELECT 1 FROM safety_state WHERE id IN('sending','platform') AND reason IS NOT NULL").get())throw new LocalError('SENDING_PAUSED');
     this.contact.frozen(ref);
     // 账号级失败（限制/掉登录/缺评论能力）换下一个账号；额度不足也换下一个账号。
     const {account:selected,scope}=this.allocate(ref,rule,row.id,channel);
     if(this.db.prepare("SELECT 1 FROM jobs WHERE kind='SEND' AND state IN('QUEUED','RUNNING','UNKNOWN') AND json_extract(payload,'$.recipientId')=? AND (json_extract(payload,'$.channel')=? OR state='UNKNOWN')").get(scope.recipientId,channel)||this.db.prepare("SELECT 1 FROM send_attempts WHERE platform='XHS' AND recipient_id=? AND (state IN('RESERVED','DISPATCHED','UNKNOWN') OR channel=? AND state='CONFIRMED')").get(scope.recipientId,channel))throw new LocalError('RECIPIENT_ALREADY_PLANNED_OR_CONTACTED');
     const next=this.slot(prev,selected.id,runId+':'+row.id+':'+channel);prev=next.prev;
     jobId=this.contact.enqueueInTransaction(row.id,ref.id,channel,selected.id,null,{availableAt:next.at,templateId:scope.basis.templateId});queued++;
    }catch(error){if(!(error instanceof LocalError))throw error;reason=error.code;skipped++;}
    this.db.prepare('INSERT INTO automation_decisions(run_id,review_id,rule_id,channel,job_id,state,reason,created_at) VALUES(?,?,?,?,?,?,?,?)').run(runId,row.id,ref.id,channel,jobId,jobId?'QUEUED':'SKIPPED',reason,this.store.clock());
   });
  }
  return {queued,skipped};
 }
 /**
  * 账号被平台限制后调用：把这一轮里还排在这个账号上的条目挪到下一个可用账号。
  * 同一天已经有第二个账号被限制时不再换号，整池停止，剩余条目进「待处理回复」。
  */
 reallocate({jobId,accountId,runId}){
  const id=this.db.prepare('SELECT run_id FROM automation_decisions WHERE job_id=?').get(jobId)?.run_id??runId;
  if(!id)return {ignored:true};
  if(restrictedToday(this.store).length>=2){const cancelled=this.stopPool(id,accountId);return {stopped:true,cancelled,moved:0};}
  const rows=this.db.prepare(`SELECT j.id job_id,j.payload,j.authorization_id,d.id decision_id,d.review_id,d.rule_id,d.channel FROM jobs j JOIN automation_decisions d ON d.job_id=j.id WHERE j.kind='SEND' AND j.state='QUEUED' AND j.cancel_requested=0 AND d.run_id=? AND json_extract(j.payload,'$.accountId')=?`).all(id,accountId);
  let moved=0,failed=0,prev=this.lastScheduled();
  for(const row of rows)this.store.transaction(()=>{
   const payload=JSON.parse(row.payload),rule=this.db.prepare('SELECT * FROM contact_rules WHERE id=?').get(row.rule_id);
   const cancel=()=>{this.db.prepare("UPDATE jobs SET state='CANCELLED',cancel_requested=1,updated_at=? WHERE id=?").run(this.store.clock(),row.job_id);this.db.prepare("UPDATE authorizations SET state='REVOKED' WHERE id=? AND state='ACTIVE'").run(row.authorization_id);};
   try{
    if(!rule?.enabled)throw new LocalError(POOL_STOPPED);
    const ref={id:rule.id,version:rule.version,hash:rule.authorization_hash};
    this.contact.frozen(ref);
    const {account,scope}=this.allocate(ref,rule,row.review_id,row.channel,{templateId:payload.basis?.templateId??undefined});
    cancel();
    const base=this.contact.autoKey({runId:id,reviewId:row.review_id,ruleId:ref.id,ruleVersion:scope.basis.ruleVersion,channel:row.channel});
    const generation=this.db.prepare('SELECT count(*) n FROM jobs WHERE request_key LIKE ?').get(base+'%').n;
    const next=this.slot(prev,account.id,row.decision_id);prev=next.prev;
    const jobId=this.contact.enqueueInTransaction(row.review_id,ref.id,row.channel,account.id,base+':r'+generation,{availableAt:next.at,templateId:scope.basis.templateId});
    this.db.prepare("UPDATE automation_decisions SET job_id=?,state='QUEUED',reason=?,resolved_at=NULL WHERE id=?").run(jobId,ACCOUNT_SWITCHED,row.decision_id);
    this.store.audit('AUTOMATION','ACCOUNT_SWITCHED',String(row.decision_id),{from:accountId,to:account.id,jobId});
    moved++;
   }catch(error){if(!(error instanceof LocalError))throw error;cancel();this.db.prepare("UPDATE automation_decisions SET reason=?,resolved_at=NULL WHERE id=?").run(POOL_STOPPED,row.decision_id);failed++;}
  });
  return {stopped:false,moved,failed};
 }
 /** 整池本轮停止：取消这一轮所有还在排队的发送，原因标成池停，保留进「待处理回复」。 */
 stopPool(runId,accountId){
  const rows=this.db.prepare("SELECT j.id job_id,j.authorization_id,d.id decision_id FROM jobs j JOIN automation_decisions d ON d.job_id=j.id WHERE j.kind='SEND' AND j.state='QUEUED' AND d.run_id=?").all(runId);
  for(const row of rows){this.db.prepare("UPDATE jobs SET state='CANCELLED',cancel_requested=1,updated_at=? WHERE id=?").run(this.store.clock(),row.job_id);this.db.prepare("UPDATE authorizations SET state='REVOKED' WHERE id=? AND state='ACTIVE'").run(row.authorization_id);this.db.prepare("UPDATE automation_decisions SET reason=? WHERE id=?").run(POOL_STOPPED,row.decision_id);}
  this.store.audit('AUTOMATION','ACCOUNT_POOL_STOPPED',runId,{accountId,cancelled:rows.length});
  return rows.length;
 }
 decisions({page=1}={}){if(!Number.isInteger(page)||page<1||page>100000)throw new LocalError('INVALID_PAGE');return {items:this.db.prepare('SELECT d.*,r.name rule_name FROM automation_decisions d JOIN contact_rules r ON r.id=d.rule_id ORDER BY d.id DESC LIMIT 30 OFFSET ?').all((page-1)*30),total:this.db.prepare('SELECT count(*) n FROM automation_decisions').get().n,page};}
 /**
  * 「待处理回复」：额度不足没发出去的、整池停止的，以及任务在发出前就夭折（取消/失败/中断）的。
  * 只读聚合，不带任何发送权限；处理动作另走 retry / dismiss。
  * 规则已被关闭（revoke）的不列：关掉自动回复就等于这批不发了。
  */
 pending({page=1,query='',channel='',reason='',days=0}={}){
  if(!Number.isInteger(page)||page<1||page>100000)throw new LocalError('INVALID_PAGE');
  if(typeof query!=='string'||query.length>200)throw new LocalError('INVALID_PENDING_FILTER');
  query=query.trim();
  if(channel&&!['COMMENT','DM'].includes(channel))throw new LocalError('INVALID_PENDING_FILTER');
  if(reason&&!['QUOTA','POOL','STOPPED'].includes(reason))throw new LocalError('INVALID_PENDING_FILTER');
  if(!Number.isInteger(days)||days<0||days>365)throw new LocalError('INVALID_PENDING_FILTER');
  const where=[UNRESOLVED,'r.enabled=1'],args=[];
  if(query){where.push(`(instr(lower(coalesce(json_extract(p.snapshot,'$.title'),'')),lower(?))>0 OR instr(lower(c.body),lower(?))>0 OR instr(lower(coalesce(json_extract(j.payload,'$.content'),'')),lower(?))>0)`);args.push(query,query,query);}
  if(channel){where.push('d.channel=?');args.push(channel);}
  if(reason==='QUOTA'){where.push('d.state=? AND d.reason=?');args.push('SKIPPED',QUOTA_EXHAUSTED);}
  else if(reason==='POOL'){where.push('d.state=? AND d.reason=?');args.push('SKIPPED',POOL_STOPPED);}
  else if(reason==='STOPPED')where.push(DEAD_JOB);
  if(days){where.push('d.created_at>=?');args.push(this.store.clock()-days*86400000);}
  const from=`FROM automation_decisions d LEFT JOIN jobs j ON j.id=d.job_id JOIN review_results v ON v.id=d.review_id JOIN run_comments c ON c.id=v.comment_id JOIN run_posts p ON p.id=c.post_id JOIN contact_rules r ON r.id=d.rule_id WHERE ${where.join(' AND ')}`;
  const items=this.db.prepare(`SELECT d.id,d.run_id,d.review_id,d.rule_id,d.channel,d.reason,d.created_at,j.state job_state,j.payload job_payload,r.name rule_name,r.plans,r.accounts,json_extract(p.snapshot,'$.title') post_title,c.body comment_body,c.user_id recipient_id ${from} ORDER BY d.id DESC LIMIT 30 OFFSET ?`).all(...args,(page-1)*30)
   .map(row=>({id:row.id,runId:row.run_id,reviewId:row.review_id,ruleId:row.rule_id,channel:row.channel,reason:row.reason,ruleName:row.rule_name,jobState:row.job_state??null,postTitle:row.post_title??'',comment:row.comment_body,recipientId:row.recipient_id,content:row.job_payload?JSON.parse(row.job_payload).content??'':this.contact.pick(JSON.parse(row.plans)?{plans:row.plans}:{plans:'[]'},row.channel,row.recipient_id)?.content??'',createdAt:row.created_at}));
  return {items,total:this.db.prepare(`SELECT count(*) n ${from}`).get(...args).n,page,remaining:this.remaining()};
 }
 /** 今日还能发多少条：给定账号池（缺省为全部在用账号）的剩余额度合计，供界面判断「现在能不能重排」。 */
 remaining(ids=[]){
  const day=dayAt(this.store.clock()),filter=ids.length?`AND a.id IN (${ids.map(()=>'?').join(',')})`:'';
  return this.db.prepare(`SELECT a.daily_limit,COALESCE(d.occupied,0) occupied,d.daily_limit_override FROM accounts a LEFT JOIN account_days d ON d.account_id=a.id AND d.day=? WHERE a.state<>'ARCHIVED' ${filter}`).all(day,...ids).reduce((n,r)=>n+Math.max(0,Math.min(r.daily_limit_override??r.daily_limit,r.daily_limit)-r.occupied),0);
 }
 /**
  * 本轮逐条进度：每条待发/已发/失败记录一行，带账号名、收件人昵称、用的模板和状态。
  * 只读展示，不触发发送。
  */
 progress({runId}={}){
  if(typeof runId!=='string'||!runId||runId.length>200)throw new LocalError('INVALID_RUN_ID');
  const rows=this.db.prepare(`SELECT d.id,d.channel,d.reason decision_reason,d.job_id,j.state job_state,j.available_at,
    json_extract(j.payload,'$.accountId') account_id,json_extract(j.payload,'$.basis.templateId') template_id,
    a.name account_name,c.user_id recipient_id,json_extract(c.snapshot,'$.authorNickname') recipient_nickname,
    s.state attempt_state,s.evidence attempt_evidence
   FROM automation_decisions d LEFT JOIN jobs j ON j.id=d.job_id LEFT JOIN accounts a ON a.id=json_extract(j.payload,'$.accountId')
   JOIN review_results v ON v.id=d.review_id JOIN run_comments c ON c.id=v.comment_id
   LEFT JOIN send_attempts s ON s.request_key=j.request_key WHERE d.run_id=? ORDER BY d.id`).all(runId);
  const now=this.store.clock(),items=rows.map((row,index)=>{
   const attempt=row.attempt_state,state=attempt==='CONFIRMED'?'SENT':attempt==='UNKNOWN'?'UNKNOWN':attempt==='DISPATCHED'?'SENDING':attempt==='RESERVED'?'QUEUED':!row.job_id?'FAILED':['SUCCEEDED'].includes(row.job_state)?'SENT':row.job_state==='RUNNING'?'SENDING':['FAILED','CANCELLED','INTERRUPTED'].includes(row.job_state)?'FAILED':row.job_state==='UNKNOWN'?'UNKNOWN':row.available_at>now?'WAITING':'QUEUED';
   return {index:index+1,decisionId:row.id,jobId:row.job_id??null,channel:row.channel,accountId:row.account_id??null,accountName:row.account_name??null,recipientId:row.recipient_id,recipientNickname:row.recipient_nickname??null,templateId:row.template_id??null,availableAt:row.available_at??null,state,reason:state==='FAILED'?row.decision_reason??null:null};
  });
  const count=state=>items.filter(item=>item.state===state).length;
  return {runId,items,summary:{total:items.length,sent:count('SENT'),pending:count('QUEUED')+count('WAITING')+count('SENDING'),failed:count('FAILED'),unknown:count('UNKNOWN')}};
 }
 /** 把一条待处理回复重新排进队列：重新按当前账号池分配账号并签发新的单次授权。 */
 retry({id}){
  if(!this.enabled())throw new LocalError('SEND_EXECUTOR_UNAVAILABLE');
  if(!Number.isInteger(id)||id<1)throw new LocalError('PENDING_CONTACT_CHANGED');
  return this.store.transaction(()=>{
   const d=this.db.prepare(`SELECT d.*,j.state job_state,j.payload job_payload FROM automation_decisions d LEFT JOIN jobs j ON j.id=d.job_id WHERE d.id=? AND ${UNRESOLVED}`).get(id);
   if(!d)throw new LocalError('PENDING_CONTACT_CHANGED');
   if(this.db.prepare("SELECT 1 FROM safety_state WHERE id IN('sending','platform') AND reason IS NOT NULL").get())throw new LocalError('SENDING_PAUSED');
   const rule=this.db.prepare('SELECT * FROM contact_rules WHERE id=?').get(d.rule_id);
   if(!rule?.enabled)throw new LocalError('CONTACT_RULE_AUTHORIZATION_CHANGED');
   const ref={id:rule.id,version:rule.version,hash:rule.authorization_hash};this.contact.frozen(ref);
   const previous=d.job_payload?JSON.parse(d.job_payload).basis?.templateId??undefined:undefined;
   const {account,scope}=this.allocate(ref,rule,d.review_id,d.channel,{templateId:previous});
   if(this.db.prepare("SELECT 1 FROM jobs WHERE kind='SEND' AND state IN('QUEUED','RUNNING','UNKNOWN') AND json_extract(payload,'$.recipientId')=? AND (json_extract(payload,'$.channel')=? OR state='UNKNOWN')").get(scope.recipientId,d.channel)||this.db.prepare("SELECT 1 FROM send_attempts WHERE platform='XHS' AND recipient_id=? AND (state IN('RESERVED','DISPATCHED','UNKNOWN') OR channel=? AND state='CONFIRMED')").get(scope.recipientId,d.channel))throw new LocalError('RECIPIENT_ALREADY_PLANNED_OR_CONTACTED');
   // 同一对象只排一次；每次重排用新代次，避免旧 key 直接返回已作废的 job。
   const base=this.contact.autoKey({runId:d.run_id,reviewId:d.review_id,ruleId:ref.id,ruleVersion:scope.basis.ruleVersion,channel:d.channel});
   const generation=this.db.prepare('SELECT count(*) n FROM jobs WHERE request_key LIKE ?').get(base+'%').n;
   const next=this.slot(this.lastScheduled(),account.id,String(id));
   const jobId=this.contact.enqueueInTransaction(d.review_id,ref.id,d.channel,account.id,base+':r'+generation,{availableAt:next.at,templateId:scope.basis.templateId});
   this.db.prepare("UPDATE automation_decisions SET job_id=?,state='QUEUED',reason='RULE_JOB_CREATED',resolved_at=? WHERE id=?").run(jobId,this.store.clock(),id);
   this.store.audit('LOCAL_USER','PENDING_CONTACT_REQUEUED',String(id),{jobId,ruleId:ref.id,accountId:account.id,generation});
   return {queued:true,jobId};
  });
 }
 /** 用户明确不发了。保留记录与原因，只标记已处理。 */
 dismiss({id}){
  if(!Number.isInteger(id)||id<1)throw new LocalError('PENDING_CONTACT_CHANGED');
  return this.store.transaction(()=>{
   const n=this.db.prepare("UPDATE automation_decisions SET resolved_at=? WHERE id=? AND resolved_at IS NULL").run(this.store.clock(),id).changes;
   if(n!==1)throw new LocalError('PENDING_CONTACT_CHANGED');
   this.store.audit('LOCAL_USER','PENDING_CONTACT_DISMISSED',String(id));
   return {dismissed:true};
  });
 }
}
module.exports={LocalAutomation,QUOTA_EXHAUSTED,POOL_STOPPED,ACCOUNT_SWITCHED};
