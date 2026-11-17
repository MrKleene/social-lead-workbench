'use strict';
const {randomUUID,randomInt}=require('node:crypto');
const {LocalError,canonical,hash}=require('./database.cjs');
const {LocalReview}=require('./review.cjs');
const {assertConfiguredSendAccount}=require('./account-safety.cjs');
const policy=require('@crm/local-runtime/policy');
function definition(r){return {id:r.id,version:r.version,policyId:r.policy_id,policyRevision:r.policy_revision,model:r.model,threshold:r.threshold,plans:JSON.parse(r.plans),accounts:JSON.parse(r.accounts)};}
class LocalContact {
 constructor(store){this.store=store;this.db=store.db;}
 templates(plans){for(const p of plans){
  if(!p.content.trim()||p.channel==='DM'&&(/[\r\n\0]/.test(p.content)||p.content.length>1000))throw new LocalError('INVALID_CONTACT_CONTENT');
  if(p.templateId){const t=this.db.prepare('SELECT * FROM configurations WHERE id=?').get(p.templateId);if(!t||t.archived||t.kind!==p.channel+'_TEMPLATE'||t.revision!==p.templateVersion||(JSON.parse(t.body).text??JSON.parse(t.body).content)!==p.content)throw new LocalError('CONTACT_TEMPLATE_CHANGED');}
  else if(p.templateVersion!==null&&p.templateVersion!==undefined)throw new LocalError('INVALID_CONTACT_TEMPLATE');
 }}
 save(id,name,input){return this.store.transaction(()=>{
  const s=policy.autoContactRuleInput.parse(input),old=this.db.prepare('SELECT * FROM contact_rules WHERE id=?').get(id);
  if(typeof id!=='string'||!/^[-a-zA-Z0-9_:]{1,100}$/.test(id)||typeof name!=='string'||!name.trim()||name.length>100||s.platform!=='XHS'||s.version!==(old?.version??0))throw new LocalError('CONTACT_RULE_CHANGED');
  const selected=this.db.prepare('SELECT * FROM review_policies WHERE id=?').get(s.policyId),model=this.db.prepare("SELECT * FROM model_profile WHERE id='qwen'").get();
  if(!selected?.enabled||selected.revision!==s.policyRevision||!model?.authorized||selected.model_version!==model.version)throw new LocalError('REVIEW_POLICY_CHANGED');
  const plans=s.channelPlans??(s.channels??[s.channel]).map(channel=>({channel,content:s.content,templateId:s.templateId??null,templateVersion:s.templateVersion??null}));
  if(!plans.length||!s.accounts.length)throw new LocalError('CONTACT_CONFIGURATION_INCOMPLETE');this.templates(plans);
  for(const a of s.accounts){const current=this.db.prepare('SELECT revision FROM accounts WHERE id=?').get(a.id);if(!current||current.revision!==a.version)throw new LocalError('ACCOUNT_IDENTITY_CHANGED');}
  const version=s.version+1;
  this.db.prepare('INSERT INTO contact_rules(id,name,policy_id,policy_revision,model,threshold,plans,accounts,version) VALUES(?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name,policy_id=excluded.policy_id,policy_revision=excluded.policy_revision,model=excluded.model,threshold=excluded.threshold,plans=excluded.plans,accounts=excluded.accounts,version=excluded.version,enabled=0,authorization_hash=NULL,authorized_at=NULL')
   .run(id,name.trim(),s.policyId,s.policyRevision,model.model,s.threshold,canonical(plans),canonical(s.accounts),version);
  this.store.audit('LOCAL_USER','CONTACT_RULE_SAVED',id,{version});return {id,version};
 });}
 authorize(id,version){return this.store.transaction(()=>{
  const r=this.db.prepare('SELECT * FROM contact_rules WHERE id=?').get(id);if(!r||r.version!==version)throw new LocalError('CONTACT_RULE_CHANGED');
  this.templates(JSON.parse(r.plans));
  for(const a of JSON.parse(r.accounts))for(const p of JSON.parse(r.plans))assertConfiguredSendAccount(this.store,a.id,a.version,p.channel);
  const p=this.db.prepare('SELECT * FROM review_policies WHERE id=?').get(r.policy_id),model=this.db.prepare("SELECT * FROM model_profile WHERE id='qwen'").get();
  if(!p?.enabled||p.revision!==r.policy_revision||!model?.authorized||p.model_version!==model.version||model.model!==r.model)throw new LocalError('REVIEW_POLICY_CHANGED');
  const digest=hash(definition(r));this.db.prepare('UPDATE contact_rules SET enabled=1,authorization_hash=?,authorized_at=? WHERE id=?').run(digest,this.store.clock(),id);
  this.store.audit('LOCAL_USER','CONTACT_RULE_AUTHORIZED',id,{version,scopeHash:digest});return {id,version,hash:digest};
 });}
 revoke(id){return this.store.transaction(()=>this.revokeInTransaction(id));}
 revokeInTransaction(id){if(!this.db.isTransaction)throw new LocalError('TRANSACTION_REQUIRED');this.db.prepare('UPDATE contact_rules SET enabled=0,version=version+1,authorization_hash=NULL,authorized_at=NULL WHERE id=?').run(id);this.store.audit('LOCAL_USER','CONTACT_RULE_REVOKED',id);}
 frozen(ref){
  if(!ref||typeof ref.id!=='string'||typeof ref.hash!=='string'||!Number.isInteger(ref.version))throw new LocalError('CONTACT_RULE_AUTHORIZATION_CHANGED');
  const r=this.db.prepare('SELECT * FROM contact_rules WHERE id=?').get(ref?.id);
  if(!r?.enabled||r.version!==ref.version||r.authorization_hash!==ref.hash||hash(definition(r))!==ref.hash)throw new LocalError('CONTACT_RULE_AUTHORIZATION_CHANGED');return r;
 }
 /**
  * 选这一条要用的模板。同一渠道可以配多条模板，发送时从冻结模板池里随机取一条，
  * 且不与这个账号上一条重复（轮换）。池里只有一条时就是它。
  */
 pick(rule,channel,accountId){const pool=JSON.parse(rule.plans).filter(p=>p.channel===channel);if(!pool.length)return null;const last=this.lastTemplate(accountId,channel),fresh=pool.length>1?pool.filter(p=>p.templateId!==last):pool,list=fresh.length?fresh:pool;return list[randomInt(list.length)];}
 lastTemplate(accountId,channel){const row=this.db.prepare('SELECT template_id FROM send_attempts WHERE account_id=? AND channel=? ORDER BY created_at DESC,rowid DESC LIMIT 1').get(accountId,channel);return row?.template_id??null;}
 plan(reviewId,ruleId,channel,accountId,{templateId}={}){
  const row=this.db.prepare('SELECT r.*,b.run_id,b.policy_id,b.policy_revision,b.model,c.platform_id,c.user_id,c.body,c.post_id,c.source_hash current_source_hash,p.platform_id post_platform_id FROM review_results r JOIN review_batches b ON b.id=r.batch_id JOIN run_comments c ON c.id=r.comment_id JOIN run_posts p ON p.id=c.post_id WHERE r.id=?').get(reviewId);
  if(!row||!row.automatic_contact_allowed||!['PENDING','APPROVED'].includes(row.review_status)||row.context!=='SUFFICIENT'||row.decision!=='MATCH'||row.source_hash!==row.current_source_hash)throw new LocalError('AUTOMATIC_CONTACT_INELIGIBLE');
  if(!new LocalReview(this.store).barrier(row.run_id).ready)throw new LocalError('REVIEW_BARRIER_NOT_READY');
  const run=this.db.prepare('SELECT * FROM collection_runs WHERE id=?').get(row.run_id),ref=JSON.parse(run.snapshot).strictStages.contactRules?.find(x=>x.id===ruleId),r=this.frozen(ref);
  if(row.policy_id!==r.policy_id||row.policy_revision!==r.policy_revision||row.model!==r.model||row.score<r.threshold)throw new LocalError('AUTOMATIC_CONTACT_INELIGIBLE');
  const snapshot=JSON.parse(row.snapshot),evidence=JSON.parse(row.evidence);
  if(!evidence.some(e=>e.source==='COMMENT'&&typeof e.quote==='string'&&e.quote.trim()&&row.body.includes(e.quote))||snapshot.comment!==row.body||snapshot.userId!==row.user_id)throw new LocalError('CONTACT_EVIDENCE_CHANGED');
  const pool=JSON.parse(r.plans).filter(p=>p.channel===channel);
  if(templateId!==undefined&&templateId!==null&&!pool.some(p=>p.templateId===templateId))throw new LocalError('CONTACT_TEMPLATE_CHANGED');
  const plan=templateId?pool.find(p=>p.templateId===templateId):this.pick(r,channel,accountId),a=JSON.parse(r.accounts).find(a=>a.id===accountId);
  if(!plan||!a||!a.dailyLimit)throw new LocalError('CONTACT_ACCOUNT_OR_CHANNEL_NOT_AUTHORIZED');this.templates([plan]);assertConfiguredSendAccount(this.store,a.id,a.version,channel);
  // basis 里记下这一条用了哪个模板：授权绑定它，发送记录也按它落库。
  const basis={type:'AUTOMATIC',reviewId,ruleId,ruleVersion:r.version,templateId:plan.templateId??null,templateVersion:plan.templateVersion??null,eligibilityHash:hash({ruleHash:ref.hash,reviewVersion:row.version,sourceHash:row.source_hash,score:row.score,decision:row.decision,context:row.context,evidence})};
  return {scope:{platform:'XHS',channel,accountId,accountRevision:a.version,recipientId:row.user_id,content:plan.content,target:channel==='DM'?{recipientId:row.user_id}:{postId:row.post_platform_id,commentId:row.platform_id,recipientId:row.user_id},basis},dailyLimit:a.dailyLimit,parent:{runId:row.run_id,ruleId,ruleVersion:r.version,ruleHash:ref.hash}};
 }
 assertScope(s,grant){
  if(s.basis?.type!=='AUTOMATIC')throw new LocalError('INVALID_AUTOMATIC_SCOPE');
  const plan=this.plan(s.basis.reviewId,s.basis.ruleId,s.channel,s.accountId,{templateId:s.basis.templateId});
  if(hash(plan.scope)!==hash(s)||grant?.issuer!=='AUTOMATION'||grant.parent_proof!==canonical(plan.parent))throw new LocalError('AUTOMATIC_AUTHORIZATION_CHANGED');return plan;
 }
 enqueue(reviewId,ruleId,channel,accountId,options){return this.store.transaction(()=>this.enqueueInTransaction(reviewId,ruleId,channel,accountId,null,options));}
 /** 自动任务的 request_key。额度不足重排时要在同一前缀下加代次后缀，所以单独暴露。 */
 autoKey({runId,reviewId,ruleId,ruleVersion,channel}){return 'auto:'+hash({runId,reviewId,ruleId,version:ruleVersion,channel});}
 enqueueInTransaction(reviewId,ruleId,channel,accountId,requestKey,{availableAt,templateId}={}){if(!this.db.isTransaction)throw new LocalError('TRANSACTION_REQUIRED');
  const plan=this.plan(reviewId,ruleId,channel,accountId,{templateId}),s=plan.scope,key=requestKey??this.autoKey({runId:plan.parent.runId,reviewId,ruleId,ruleVersion:s.basis.ruleVersion,channel});
  // An attempt cannot silently switch account or be recreated after failure/UNKNOWN.
  const existing=this.db.prepare('SELECT id FROM jobs WHERE request_key=?').get(key);if(existing)return existing.id;
  const now=this.store.clock(),at=Math.max(now,Number.isInteger(availableAt)?availableAt:now),expires=Math.min(now+900000,Math.floor((now+28800000)/86400000)*86400000+86400000-28800000),grant=randomUUID(),id=randomUUID();
  this.db.prepare("INSERT INTO authorizations(id,purpose,scope,scope_hash,state,created_at,expires_at,issuer,parent_proof) VALUES(?,'SEND',?,?,'ACTIVE',?,?,'AUTOMATION',?)").run(grant,canonical(s),hash(s),now,expires,canonical(plan.parent));
  this.db.prepare("INSERT INTO jobs(id,request_key,kind,payload,payload_hash,authorization_id,state,available_at,created_at,updated_at) VALUES(?,?,'SEND',?,?,?,'QUEUED',?,?,?)").run(id,key,canonical(s),hash(s),grant,at,now,now);
  this.store.audit('AUTOMATION','CONTACT_RULE_JOB_DERIVED',id,{...plan.parent,scopeHash:hash(s)});return id;
 }
}
module.exports={LocalContact,definition};
