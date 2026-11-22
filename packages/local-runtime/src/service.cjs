'use strict';
const {randomUUID}=require('node:crypto');
const {LocalError,canonical}=require('./database.cjs');
const {LocalInbox}=require('./inbox.cjs');
const {LocalWorkflow}=require('./workflow.cjs');
const {definitions:builtinDefinitions}=require('./builtin-configurations.cjs');
const KINDS=new Set(['KEYWORDS','MATCHING','COMMENT_TEMPLATE','DM_TEMPLATE']);
function mediaUrl(value){if(typeof value!=='string'||value.length>2048)return null;try{const url=new URL(value);return url.protocol==='https:'?url.href:null;}catch{return null;}}
function textField(value,max){return typeof value==='string'&&value.length<=max?value:null;}
// MATCHING 配置与 review_policies 是 1:1 的：任何内容变更都必须让旧授权失效。
function syncReviewPolicy(store,id,name,target){
 store.db.prepare('INSERT INTO review_policies(id,name,target) VALUES(?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name,target=excluded.target,revision=revision+1,version=version+1,enabled=0,model_version=NULL').run(id,name,target);
 store.db.prepare('UPDATE contact_rules SET enabled=0,version=version+1,authorization_hash=NULL WHERE policy_id=?').run(id);
}
function validateConfiguration(input){
 if(!input||!KINDS.has(input.kind)||typeof input.name!=='string'||!input.name.trim()||input.name.trim().length>100||!input.body||Object.getPrototypeOf(input.body)!==Object.prototype)throw new LocalError('INVALID_CONFIGURATION');
 if(Buffer.byteLength(canonical(input.body))>32768)throw new LocalError('CONFIGURATION_TOO_LARGE');
 if(input.kind==='KEYWORDS'){
  const keywords=input.body.keywords;if(!Array.isArray(keywords)||!keywords.length||keywords.length>100||keywords.some(x=>typeof x!=='string'||!x.trim()||[...x.trim()].length>40))throw new LocalError('INVALID_KEYWORDS');
  if(new Set(keywords.map(x=>x.trim().normalize('NFKC').toLowerCase())).size!==keywords.length)throw new LocalError('DUPLICATE_KEYWORDS');
  if(Object.keys(input.body).some(x=>x!=='keywords'))throw new LocalError('INVALID_CONFIGURATION');
 }else if(typeof input.body.text!=='string'||!input.body.text.trim()||input.body.text.length>4000||Object.keys(input.body).some(x=>x!=='text'))throw new LocalError('INVALID_CONFIGURATION');
 if(input.kind==='MATCHING'&&!require('@crm/local-runtime/policy').reviewPolicySaveSchema.safeParse({version:0,name:input.name,target:input.body.text}).success)throw new LocalError('INVALID_MATCHING_TARGET');
 return {kind:input.kind,name:input.name.trim(),body:input.body};
}
class LocalService {
 constructor(store,vault,options={}){this.store=store;this.vault=vault;this.workflow=new LocalWorkflow(store,vault,options);
  // 有 Key 就有授权：启动时对齐一次，旧版本留下的 authorized=0 也不会把界面卡在灰色开关上。
  try{this.workflow.ensureModelAuthorization();}catch{}
  this.accountService=options.accounts;this.evidence=options.evidence;this.diagnostic=options.diagnostic;this.automation=new (require('./automation.cjs').LocalAutomation)(store,{enabled:()=>!!this.workflow.capabilities().send});}
 checkPostDiagnostic(input){if(!this.diagnostic)throw new LocalError('PLATFORM_COMPONENT_UNAVAILABLE');return this.diagnostic.check(input);}
 cancelPostDiagnostic(){return this.diagnostic?.cancel()??{requested:true};}
 previewRunReview(input){return new(require('./run-review.cjs').RunReview)(this.store).preview(input);}
 authorizeRunReview(input){if(!this.workflow.capabilities().review)throw new LocalError('MODEL_EXECUTOR_UNAVAILABLE');return new(require('./run-review.cjs').RunReview)(this.store).authorize(input);}
 preferences(){return new(require('./preferences.cjs').LocalPreferences)(this.store);}
 collectionPreferences(input){return this.preferences().get(input);}
 saveCollectionPreferences(input){return this.preferences().save(input);}
 workspaceSelection(){return this.preferences().selection();}
 selectWorkspaceConfiguration(input){return this.preferences().select(input);}
 automationSteps(){return this.preferences().steps();}
 saveAutomationSteps(input){return this.preferences().saveSteps(input);}
 reporting(){return new(require('./reporting.cjs').LocalReporting)(this.store);}
 accountDiagnostics(input){return this.reporting().account(input);}
 unreviewedComments(input){return this.reporting().unreviewed(input);}
 modelHistory(input){return this.reporting().model(input);}
 automationReport(input){return this.reporting().automation(input);}
 workspace(){return new(require('./workspace.cjs').LocalWorkspace)(this.store);}
 workspaceOverview(){return this.workspace().dashboard();}
 jobHistory(input){return this.workspace().jobs(input);}
 replyHistory(input){return this.workspace().replies(input);}
 accountDetails(){return this.workspace().accountDetails();}
 updateAccount(input){return this.workspace().updateAccount(input);}
 disconnectAccount(input){const result=this.workspace().disconnectAccount(input);if(result.secretRef)this.vault?.remove('PLATFORM_SESSION',result.secretRef);return {disconnected:true};}
 deleteAccount(input){const result=this.workspace().deleteAccount(input);if(result.secretRef)this.vault?.remove('PLATFORM_SESSION',result.secretRef);return {deleted:true};}
 notices(input){return this.workspace().notices(input);}
 status(){const p=this.vault?.protector,credentialsAvailable=!!(p&&(p.availableHint?p.availableHint():p.available()));const pause=this.store.db.prepare("SELECT reason FROM safety_state WHERE id='platform' AND reason IS NOT NULL").get()?.reason??null;return {storage:'SQLITE',loginRequired:false,queueBusy:!!this.workflow.queue.busy(),platformPause:pause,initialized:!!this.store.db.prepare("SELECT 1 FROM settings WHERE key='initialized'").get(),modelKeyConfigured:!!this.vault?.has('MODEL_KEY','qwen'),credentialsAvailable,platform:{ready:!!this.workflow.capabilities().collect,reason:this.workflow.capabilities().collect?'LOGIN_COLLECTION_REGISTERED':'DESKTOP_PLATFORM_ADAPTER_PENDING'},version:1};}
 initialize(){return this.store.transaction(()=>{this.store.db.prepare("INSERT INTO settings VALUES('initialized','true',1) ON CONFLICT DO NOTHING").run();this.store.audit('LOCAL_USER','INITIALIZED','installation');return {initialized:true};});}
 /** 对账后清除平台暂停。前提由桌面主进程从进程表得出（会话目录里的 .owner.json，
  *  见 DesktopPlatformRuntime.reconcileProcessState），**不再要求用户声明"我已核对"**——
  *  "进程还在不在"是系统能查的事实，不是用户的义务。
  *  这个方法不经 IPC 暴露：渲染层只能触发对账，不能直接把暂停清掉。 */
 reconcilePlatformHold({liveProcesses,sessions}){
  if(liveProcesses!==0)throw new LocalError('PLATFORM_PROCESS_STILL_RUNNING');
  if(this.accountService?.attempt)throw new LocalError('PLATFORM_BUSY_OR_PAUSED');
  if(this.store.active())throw new LocalError('PLATFORM_BUSY_OR_PAUSED');
  return this.store.transaction(()=>{
   const row=this.store.db.prepare("SELECT reason FROM safety_state WHERE id='platform' AND reason IS NOT NULL").get();
   if(!row)return {cleared:false};
   this.store.audit('RECOVERY','PLATFORM_HOLD_RECONCILED','installation',{reason:row.reason,sessions:sessions??0,liveProcesses:0});
   this.store.db.prepare("UPDATE safety_state SET reason=NULL,version=version+1 WHERE id='platform'").run();
   return {cleared:true};
  });
 }
 /** 写入系统内置配置：缺失则补，内容与当前定义不一致则强制覆盖。
  *  内置项对用户只读，内容完全由应用维护，所以这里不需要判断「用户改过」。
  *  内容相同时不写库——否则每次启动都会 bump revision 并连带吊销审核授权。
  *  内容真的变了会走 syncReviewPolicy，使旧的审核/自动化授权失效，需要用户重新确认。
  *  只在桌面装配启动时调用一次，不经 IPC 暴露。 */
 ensureBuiltinConfigurations(){return this.store.transaction(()=>{
  let created=0,updated=0;
  for(const definition of builtinDefinitions){
   const value=validateConfiguration(definition),now=this.store.clock();
   const row=this.store.db.prepare('SELECT * FROM configurations WHERE id=?').get(definition.id);
   if(!row){
    this.store.db.prepare('INSERT INTO configurations(id,kind,name,body,builtin,updated_at) VALUES(?,?,?,?,1,?)').run(definition.id,value.kind,value.name,canonical(value.body),now);
    if(value.kind==='MATCHING')syncReviewPolicy(this.store,definition.id,value.name,value.body.text.trim());
    created++;continue;
   }
   // id 被用户自己的配置占用（理论上不会发生）：不接管、不覆盖。
   if(!row.builtin)continue;
   if(row.kind===value.kind&&row.name===value.name&&canonical(JSON.parse(row.body))===canonical(value.body))continue;
   this.store.db.prepare('UPDATE configurations SET kind=?,name=?,body=?,revision=revision+1,updated_at=? WHERE id=?').run(value.kind,value.name,canonical(value.body),now,definition.id);
   if(value.kind==='MATCHING')syncReviewPolicy(this.store,definition.id,value.name,value.body.text.trim());
   updated++;
  }
  this.ensureDefaultQueueRule('builtin-matching');
  if(created||updated)this.store.audit('LOCAL_USER','BUILTIN_CONFIGURATIONS_SYNCED','installation',{created,updated});
  return {created,updated};
 });}
 ensureDefaultQueueRule(policyId){
  if(!this.store.db.prepare('SELECT 1 FROM configurations WHERE id=? AND builtin=1 AND kind=\'MATCHING\'').get(policyId))return;
  if(this.store.db.prepare('SELECT 1 FROM queue_rules WHERE policy_id=?').get(policyId))return;
  const now=this.store.clock();
  this.store.db.prepare('INSERT INTO queue_rules(id,policy_id,threshold,channels,enabled,system_default,version,created_at,updated_at) VALUES(?,?,80,?,1,1,1,?,?)').run('queue-'+policyId,policyId,canonical(['COMMENT','DM']),now,now);
 }
 configurations(){return this.store.db.prepare('SELECT * FROM configurations WHERE archived=0 ORDER BY updated_at DESC,id').all().map(x=>({...x,body:JSON.parse(x.body)}));}
 saveConfiguration(input){const value=validateConfiguration(input);return this.store.transaction(()=>{
  const id=input.id||randomUUID();if(typeof id!=='string'||!/^[a-zA-Z0-9_-]{1,100}$/.test(id))throw new LocalError('INVALID_CONFIGURATION');
  const old=this.store.db.prepare('SELECT * FROM configurations WHERE id=?').get(id);
  if(old){if(old.builtin)throw new LocalError('BUILTIN_CONFIGURATION_READ_ONLY');if(old.archived||old.kind!==value.kind||old.revision!==input.revision)throw new LocalError('CONFIGURATION_CHANGED');this.store.db.prepare('UPDATE configurations SET name=?,body=?,revision=revision+1,updated_at=? WHERE id=?').run(value.name,canonical(value.body),this.store.clock(),id);}
  else{if(input.id||input.revision!==undefined)throw new LocalError('CONFIGURATION_NOT_FOUND');this.store.db.prepare('INSERT INTO configurations(id,kind,name,body,updated_at) VALUES(?,?,?,?,?)').run(id,value.kind,value.name,canonical(value.body),this.store.clock());}
  if(value.kind==='MATCHING')syncReviewPolicy(this.store,id,value.name,value.body.text.trim());
  this.store.audit('LOCAL_USER','CONFIGURATION_SAVED',id,{kind:value.kind});return {id};
 });}
 deleteConfiguration({id,revision}){return this.store.transaction(()=>{
  if(this.store.db.prepare('SELECT 1 FROM configurations WHERE id=? AND archived=0 AND builtin=1').get(id))throw new LocalError('BUILTIN_CONFIGURATION_READ_ONLY');
  const row=this.store.db.prepare('SELECT * FROM configurations WHERE id=? AND revision=? AND archived=0').get(id,revision);
  if(!row)throw new LocalError('CONFIGURATION_CHANGED');
  const hit=(sql)=>!!this.store.db.prepare(sql).get(id);
  if(row.kind==='KEYWORDS'&&hit('SELECT 1 FROM collection_runs WHERE config_id=? LIMIT 1'))throw new LocalError('CONFIGURATION_HAS_HISTORY');
  if(row.kind==='MATCHING'&&hit('SELECT 1 FROM review_batches WHERE policy_id=? LIMIT 1'))throw new LocalError('CONFIGURATION_HAS_HISTORY');
  if(row.kind==='MATCHING'&&hit('SELECT 1 FROM automation_decisions WHERE rule_id IN(SELECT id FROM contact_rules WHERE policy_id=?) LIMIT 1'))throw new LocalError('CONFIGURATION_HAS_HISTORY');
  if(this.store.db.prepare("SELECT 1 FROM contact_rules r, json_each(r.plans) p WHERE json_extract(p.value,'$.templateId')=? LIMIT 1").get(id))throw new LocalError('CONFIGURATION_IN_USE');
  this.store.db.prepare('DELETE FROM settings WHERE key=?').run('collection-preference:'+id);
  const selection=this.store.db.prepare("SELECT value FROM settings WHERE key='workspace-selection'").get();
  if(selection&&JSON.parse(selection.value).configId===id)this.store.db.prepare("DELETE FROM settings WHERE key='workspace-selection'").run();
  if(row.kind==='MATCHING'){
   this.store.db.prepare('DELETE FROM automatic_review_authorizations WHERE policy_id=?').run(id);
   this.store.db.prepare('DELETE FROM queue_rules WHERE policy_id=?').run(id);
   this.store.db.prepare('DELETE FROM contact_rules WHERE policy_id=?').run(id);
   this.store.db.prepare('DELETE FROM review_policies WHERE id=?').run(id);
  }
  this.store.db.prepare('DELETE FROM configurations WHERE id=?').run(id);
  this.store.audit('LOCAL_USER','CONFIGURATION_DELETED',id,{kind:row.kind});return {deleted:true};
 });}
 deleteTestData(input){return new(require('./reset.cjs').LocalReset)(this.store).delete(input);}
 /** 恢复初始状态：清业务数据与凭据，再把 10 条内置配置写回来。 */
 restoreInitialState(){const result=new(require('./reset.cjs').LocalReset)(this.store).restoreInitialState({vault:this.vault});this.ensureBuiltinConfigurations();return result;}
 review(){return new(require('./review.cjs').LocalReview)(this.store);}
 automationProgress(input){return this.automation.progress(input);}
 unknownModelSubmissions(){return this.review().unknown();}
 discardModelSubmission(input){return this.review().discard(input);}
 saveModelKey({key}){if(typeof key!=='string'||! /^[\x21-\x7e]{16,512}$/.test(key))throw new LocalError('INVALID_MODEL_KEY');if(!this.vault)throw new LocalError('OS_CREDENTIAL_PROTECTION_UNAVAILABLE');
  // 写失败就什么都不变：旧 Key 与既有授权保持原样，不需要先吊销。
  this.vault.put('MODEL_KEY','qwen',key);this.store.audit('LOCAL_USER','MODEL_KEY_SAVED','qwen');this.workflow.ensureModelAuthorization();return {configured:true};}
 jobs(){return this.store.db.prepare('SELECT id,kind,state,created_at,updated_at FROM jobs ORDER BY created_at DESC,id LIMIT 100').all();}
 accounts(){return this.store.db.prepare('SELECT id,platform,name,state,daily_limit FROM accounts ORDER BY name,id').all();}
 inboxAccounts(){return new LocalInbox(this.store).accounts();}
 inboxPage(input){return new LocalInbox(this.store).list(input);}
 conversations(input){return new LocalInbox(this.store).threads(input);}
 conversation(input){return new LocalInbox(this.store).thread(input);}
 unread(){return new LocalInbox(this.store).unread();}
 markRead({id}){return new LocalInbox(this.store).markRead(id);}
 markThreadRead({accountId,senderId}){return new LocalInbox(this.store).markThreadRead(accountId,senderId);}
 runs(input){return this.reporting().runs(input);}
 reviews(input){return this.workspace().reviews(input);}
 reviewPosts(input){return this.workspace().reviewPosts(input);}
 reviewComments(input){return this.workspace().reviewComments(input);}
 reviewCommentList(input){return this.workspace().reviewCommentList(input);}
 runProgress(input){return this.workspace().runProgress(input); }
 decideReview(input){return this.store.transaction(()=>{const result=this.decideReviewInTransaction(input);return {updated:true,queue:result.queue};});}
 decideReviews({items,status}={}){
  if(!Array.isArray(items)||!items.length||items.length>100)throw new LocalError('INVALID_REVIEW_SELECTION');
  const seen=new Set();
  for(const item of items){
   if(!item||typeof item.id!=='string'||!Number.isInteger(item.version)||seen.has(item.id))throw new LocalError('INVALID_REVIEW_SELECTION');
   seen.add(item.id);
  }
  return this.store.transaction(()=>{
   let queued=0,skipped=0;
   for(const item of items){const result=this.decideReviewInTransaction({...item,status});if(result.queue){queued+=result.queue.queued??0;if(result.queue.skipped)skipped++;}}
   this.store.audit('LOCAL_USER','REVIEW_DECISION_BATCH','batch',{status,count:items.length,queued,skipped});
   return {updated:items.length,queued,skipped};
  });
 }
 decideReviewInTransaction({id,version,status}){
  if(typeof id!=='string'||!Number.isInteger(version)||!['APPROVED','REJECTED','PENDING'].includes(status))throw new LocalError('INVALID_REVIEW_DECISION');
  const current=this.store.db.prepare('SELECT review_status FROM review_results WHERE id=? AND version=?').get(id,version);
  if(!current)throw new LocalError('REVIEW_CHANGED');
  if(status==='PENDING'?current.review_status!=='REJECTED':current.review_status!=='PENDING')throw new LocalError('INVALID_REVIEW_DECISION');
  const manual=status==='APPROVED'?'MATCH':status==='REJECTED'?'NO_MATCH':null;
  const changed=this.store.db.prepare('UPDATE review_results SET review_status=?,manual_decision=?,version=version+1 WHERE id=? AND version=? AND review_status=?').run(status,manual,id,version,current.review_status).changes;
  if(changed!==1)throw new LocalError('REVIEW_CHANGED');
  let queue=null;
  if(status==='APPROVED'){
   try{queue=this.sendQueue().enqueueReviewInTransaction(id);}
   catch(error){if(error instanceof LocalError&&error.code==='QUEUE_RULE_CONFIGURATION_MISSING')queue={queued:0,skipped:'QUEUE_RULE_CONFIGURATION_MISSING'};else throw error;}
  }
  this.store.audit('LOCAL_USER','REVIEW_DECISION',id,{status,manualDecision:manual,previousVersion:version,queue});
  return {updated:true,queue};
 }
 sendQueue(){return new(require('./send-queue.cjs').LocalSendQueue)(this.store);}
 sendQueueList(input){return this.sendQueue().list(input);}
 sendQueueSummary(){return this.sendQueue().summary();}
 retrySendQueueItem(input){return this.sendQueue().retry(input.id);}
 cancelSendQueueItem(input){return this.sendQueue().cancel(input.id);}
 requeueSendQueueItem(input){return this.sendQueue().requeue(input.id,{override:input.override===true});}
 dismissSendQueueItem(input){return this.sendQueue().dismiss(input.id);}
 sendNow(input){return this.sendQueue().sendNow(input);}
 queueRules(){return this.sendQueue().rules();}
 saveQueueRule(input){return this.sendQueue().saveRule(input);}
 deleteQueueRule(input){return this.sendQueue().deleteRule(input);}
 generateSendQueue(input){return this.sendQueue().generate(input);}
 page(value){if(!Number.isInteger(value)||value<1||value>100000)throw new LocalError('INVALID_PAGE');}
 evidenceOverview(){return this.evidence.list();}
 previewEvidence(input){return this.evidence.preview(input);}
 verifyEvidence(input){return this.evidence.verify(input);}
 cancelEvidence(){return this.evidence.cancel();}
 comparePostVersions(input){return new(require('./post-versions.cjs').PostVersions)(this.store).compare(input);}
 postHistory({postId,page=1,commentPlatformId=''}){
  this.page(page);
  if(typeof commentPlatformId!=='string'||commentPlatformId.length>200)throw new LocalError('INVALID_POST_HISTORY');
  const p=this.store.db.prepare('SELECT p.*,r.finished_at,r.status run_status FROM run_posts p JOIN collection_runs r ON r.id=p.run_id WHERE p.id=?').get(postId);
  if(!p)throw new LocalError('POST_NOT_FOUND');
  const snapshot=JSON.parse(p.snapshot),policy=require('@crm/local-runtime/policy');
  const comment=c=>({id:c.id,platform_id:c.platform_id,body:c.body,parent_id:c.parent_id,nickname:c.nickname,author_avatar_url:mediaUrl(c.author_avatar_url),published_at:c.published_at,image_diagnostics:policy.safeImageDiagnostics(c.image_diagnostics?JSON.parse(c.image_diagnostics):null)??null});
  const select="SELECT c.id,c.platform_id,c.parent_id,c.body,c.ordinal,json_extract(c.snapshot,'$.authorNickname') nickname,json_extract(c.snapshot,'$.authorAvatarUrl') author_avatar_url,json_extract(c.snapshot,'$.publishedAt') published_at,CASE WHEN json_type(c.snapshot,'$.imageDiagnostics')='object' THEN json_extract(c.snapshot,'$.imageDiagnostics') ELSE NULL END image_diagnostics FROM run_comments c WHERE c.post_id=?";
  let resultPage=page;
  if(commentPlatformId&&page===1){
   const target=this.store.db.prepare('SELECT platform_id,parent_id,ordinal FROM run_comments WHERE post_id=? AND platform_id=?').get(postId,commentPlatformId);
   if(!target)throw new LocalError('COMMENT_NOT_FOUND');
   let root=target;
   for(let guard=0;root.parent_id&&guard<100;guard++){
    const parent=this.store.db.prepare('SELECT platform_id,parent_id,ordinal FROM run_comments WHERE post_id=? AND platform_id=?').get(postId,root.parent_id);
    if(!parent)break;
    root=parent;
   }
   const position=this.store.db.prepare('SELECT count(*) n FROM run_comments WHERE post_id=? AND parent_id IS NULL AND ordinal<?').get(postId,root.ordinal).n;
   resultPage=Math.floor(position/20)+1;
  }
  const roots=this.store.db.prepare(select+' AND c.parent_id IS NULL ORDER BY c.ordinal LIMIT 20 OFFSET ?').all(postId,(resultPage-1)*20).map(comment);
  const total=this.store.db.prepare('SELECT count(*) n FROM run_comments WHERE post_id=?').get(postId).n;
  const rootsTotal=this.store.db.prepare('SELECT count(*) n FROM run_comments WHERE post_id=? AND parent_id IS NULL').get(postId).n;
  const nodes=new Map(roots.map(x=>[x.platform_id,x])),byRoot=new Map(roots.map(x=>[x.platform_id,[]]));
  let frontier=roots;
  while(frontier.length){
   const ids=frontier.map(x=>x.platform_id);
   const rows=this.store.db.prepare(select+' AND c.parent_id IN ('+ids.map(()=>'?').join(',')+') ORDER BY c.ordinal').all(postId,...ids).map(comment);
   if(!rows.length)break;
   for(const row of rows){
    const parent=nodes.get(row.parent_id);
    if(!parent)continue;
    const rootId=parent.root_id||parent.platform_id;
    row.root_id=rootId;
    row.reply_to_nickname=parent.platform_id===rootId?null:parent.nickname;
    nodes.set(row.platform_id,row);
    const list=byRoot.get(rootId);
    if(list)list.push(row);
   }
   frontier=rows;
  }
  const items=roots.map(root=>{
   const list=(byRoot.get(root.platform_id)||[]).sort((a,b)=>a.ordinal-b.ordinal);
   return {...root,reply_to_nickname:null,replies:list,reply_count:list.length};
  });
  return {post:{id:p.id,runId:p.run_id,platformId:p.platform_id,title:snapshot.title||'',body:snapshot.body||'',coverUrl:mediaUrl(snapshot.coverUrl),authorNickname:textField(snapshot.authorNickname,80),authorAvatarUrl:mediaUrl(snapshot.authorAvatarUrl),publishedAt:textField(snapshot.publishedAt,80),coverage:p.coverage,observedAt:p.finished_at,imageDiagnostics:policy.safeImageDiagnostics(snapshot.imageDiagnostics)??null,boundedRead:policy.safeBoundedReadReport(snapshot.boundedRead)??null,boundedReadWindows:Array.isArray(snapshot.boundedReadWindows)?snapshot.boundedReadWindows.slice(0,8).map(policy.safeBoundedReadReport).filter(Boolean):[]},comments:{items,total,roots:rootsTotal,page:resultPage,pageSize:20},versions:this.store.db.prepare('SELECT p.id,p.run_id,p.coverage,r.created_at,r.reason FROM run_posts p JOIN collection_runs r ON r.id=p.run_id WHERE p.platform_id=? ORDER BY r.created_at DESC,p.rowid DESC LIMIT 100').all(p.platform_id)};
 }
 savedPosts(input){return this.workflow.savedPosts(input);}
 collectedPosts(input){return this.workflow.collectedPosts(input);}
 previewSavedPost(input){return this.workflow.previewSavedPost(input);}
 authorizeSavedPost(input){return this.workflow.authorizeSavedPost(input);}
 recoveryPreview(){return new (require('./recovery.cjs').LocalRecovery)(this.store).preview();}
 resumeReviewedCopy(input){return new (require('./recovery.cjs').LocalRecovery)(this.store).resume(input);}
 automationRules(){return this.automation.list();}
 saveAutomationRule(input){return this.automation.save(input);}
 previewAutomationRule(input){return this.automation.preview(input);}
 authorizeAutomationRule(input){return this.automation.authorize(input);}
 revokeAutomationRule(input){return this.automation.revoke(input);}
 automationDecisions(input){return this.automation.decisions(input);}
 pendingContacts(input){return this.automation.pending(input);}
 retryPendingContact(input){return this.automation.retry(input);}
 dismissPendingContact(input){return this.automation.dismiss(input);}
 inboxReceivers(){return this.store.db.prepare('SELECT r.account_id,a.name,r.state,r.reason,r.expires_at,r.updated_at,r.comment_mode,r.dm_mode,j.state job_state FROM inbox_receivers r JOIN accounts a ON a.id=r.account_id JOIN jobs j ON j.id=r.job_id ORDER BY a.name').all();}
 accountOverview(){return this.accountService.overview();}
 checkReplyEligibility(input){return this.accountService.checkReplyEligibility(input);}
 beginLogin(input){return this.accountService.begin(input);}
 pollLogin(input){return this.accountService.poll(input);}
 cancelLogin(input){return this.accountService.cancel(input);}
 previewChat(input){return this.workflow.previewChat(input);}
 authorizeChat(input){return this.workflow.authorizeChat(input);}
 previewCommentReply(input){return this.workflow.previewCommentReply(input);}
 authorizeCommentReply(input){return this.workflow.authorizeCommentReply(input);}
 previewContact(input){return this.workflow.previewContact(input);}
 authorizeContact(input){return this.workflow.authorizeContact(input);}
 previewReply(input){return this.workflow.previewReply(input);}
 authorizeReply(input){return this.workflow.authorizeReply(input);}
 previewInbox(input){return this.workflow.previewInbox(input);}
 authorizeInbox(input){return this.workflow.authorizeInbox(input);}
 previewCollection(input){return this.workflow.previewCollection(input);}
 authorizeCollection(input){return this.workflow.authorizeCollection(input);}
 workflowOverview(){return this.workflow.overview();}
 saveModelProfile(input){return this.workflow.saveModel(input);}
 setAutomaticReviewPolicy(input){return this.workflow.setAutomaticPolicy(input);}
 setReviewPolicy(input){return this.workflow.setPolicy(input);}
 postReviewOptions(input){return this.workflow.postReviewOptions(input);}
 previewReview(input){return this.workflow.previewReview(input);}
 authorizeReview(input){return this.workflow.authorizeReview(input);}
 cancelJob(input){return this.workflow.cancelJob(input);}
}
module.exports={LocalService,validateConfiguration};