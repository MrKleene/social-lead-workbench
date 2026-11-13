'use strict';
const {randomUUID}=require('node:crypto');
const {LocalError,canonical}=require('./database.cjs');
const {LocalInbox}=require('./inbox.cjs');
const {LocalWorkflow}=require('./workflow.cjs');
const KINDS=new Set(['KEYWORDS','MATCHING','COMMENT_TEMPLATE','DM_TEMPLATE']);
function validateConfiguration(input){
 if(!input||!KINDS.has(input.kind)||typeof input.name!=='string'||!input.name.trim()||input.name.trim().length>100||!input.body||Object.getPrototypeOf(input.body)!==Object.prototype)throw new LocalError('INVALID_CONFIGURATION');
 if(Buffer.byteLength(canonical(input.body))>32768)throw new LocalError('CONFIGURATION_TOO_LARGE');
 if(input.kind==='KEYWORDS'){
  const keywords=input.body.keywords;if(!Array.isArray(keywords)||!keywords.length||keywords.length>100||keywords.some(x=>typeof x!=='string'||!x.trim()||[...x.trim()].length>40))throw new LocalError('INVALID_KEYWORDS');
  if(new Set(keywords.map(x=>x.trim().normalize('NFKC').toLowerCase())).size!==keywords.length)throw new LocalError('DUPLICATE_KEYWORDS');
  if(Object.keys(input.body).some(x=>!['keywords','excludeWords'].includes(x)))throw new LocalError('INVALID_CONFIGURATION');
  if(input.body.excludeWords!==undefined&&(!Array.isArray(input.body.excludeWords)||input.body.excludeWords.length>100||input.body.excludeWords.some(x=>typeof x!=='string'||!x.trim()||[...x.trim()].length>40)))throw new LocalError('INVALID_KEYWORDS');
 }else if(typeof input.body.text!=='string'||!input.body.text.trim()||input.body.text.length>4000||Object.keys(input.body).some(x=>x!=='text'))throw new LocalError('INVALID_CONFIGURATION');
 if(input.kind==='MATCHING'&&!require('@crm/local-runtime/policy').reviewPolicySaveSchema.safeParse({version:0,name:input.name,target:input.body.text}).success)throw new LocalError('INVALID_MATCHING_TARGET');
 return {kind:input.kind,name:input.name.trim(),body:input.body};
}
class LocalService {
 constructor(store,vault,options={}){this.store=store;this.vault=vault;this.workflow=new LocalWorkflow(store,vault,options);this.accountService=options.accounts;this.evidence=options.evidence;this.diagnostic=options.diagnostic;this.automation=new (require('./automation.cjs').LocalAutomation)(store,{enabled:()=>!!this.workflow.capabilities().send});}
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
 workspaceOverview(){return this.workspace().overview();}
 jobHistory(input){return this.workspace().jobs(input);}
 replyHistory(input){return this.workspace().replies(input);}
 accountDetails(){return this.workspace().accountDetails();}
 updateAccount(input){return this.workspace().updateAccount(input);}
 disconnectAccount(input){const result=this.workspace().disconnectAccount(input);if(result.secretRef)this.vault?.remove('PLATFORM_SESSION',result.secretRef);return {disconnected:true};}
 deleteAccount(input){const result=this.workspace().deleteAccount(input);if(result.secretRef)this.vault?.remove('PLATFORM_SESSION',result.secretRef);return {deleted:true};}
 notices(input){return this.workspace().notices(input);}
 status(){const p=this.vault?.protector,credentialsAvailable=!!(p&&(p.availableHint?p.availableHint():p.available()));return {storage:'SQLITE',loginRequired:false,initialized:!!this.store.db.prepare("SELECT 1 FROM settings WHERE key='initialized'").get(),modelKeyConfigured:!!this.vault?.has('MODEL_KEY','qwen'),credentialsAvailable,platform:{ready:!!this.workflow.capabilities().collect,reason:this.workflow.capabilities().collect?'LOGIN_COLLECTION_REGISTERED':'DESKTOP_PLATFORM_ADAPTER_PENDING'},version:1};}
 initialize(){return this.store.transaction(()=>{this.store.db.prepare("INSERT INTO settings VALUES('initialized','true',1) ON CONFLICT DO NOTHING").run();this.store.audit('LOCAL_USER','INITIALIZED','installation');return {initialized:true};});}
 configurations(){return this.store.db.prepare('SELECT * FROM configurations WHERE archived=0 ORDER BY updated_at DESC,id').all().map(x=>({...x,body:JSON.parse(x.body)}));}
 saveConfiguration(input){const value=validateConfiguration(input);return this.store.transaction(()=>{
  const id=input.id||randomUUID();if(typeof id!=='string'||!/^[a-zA-Z0-9_-]{1,100}$/.test(id))throw new LocalError('INVALID_CONFIGURATION');
  const old=this.store.db.prepare('SELECT * FROM configurations WHERE id=?').get(id);
  if(old){if(old.archived||old.kind!==value.kind||old.revision!==input.revision)throw new LocalError('CONFIGURATION_CHANGED');this.store.db.prepare('UPDATE configurations SET name=?,body=?,revision=revision+1,updated_at=? WHERE id=?').run(value.name,canonical(value.body),this.store.clock(),id);}
  else{if(input.id||input.revision!==undefined)throw new LocalError('CONFIGURATION_NOT_FOUND');this.store.db.prepare('INSERT INTO configurations(id,kind,name,body,updated_at) VALUES(?,?,?,?,?)').run(id,value.kind,value.name,canonical(value.body),this.store.clock());}
  if(value.kind==='MATCHING'){
   this.store.db.prepare('INSERT INTO review_policies(id,name,target) VALUES(?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name,target=excluded.target,revision=revision+1,version=version+1,enabled=0,model_version=NULL').run(id,value.name,value.body.text.trim());
   this.store.db.prepare('UPDATE contact_rules SET enabled=0,version=version+1,authorization_hash=NULL WHERE policy_id=?').run(id);
  }
  this.store.audit('LOCAL_USER','CONFIGURATION_SAVED',id,{kind:value.kind});return {id};
 });}
 deleteConfiguration({id,revision}){return this.store.transaction(()=>{
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
   this.store.db.prepare('DELETE FROM contact_rules WHERE policy_id=?').run(id);
   this.store.db.prepare('DELETE FROM review_policies WHERE id=?').run(id);
  }
  this.store.db.prepare('DELETE FROM configurations WHERE id=?').run(id);
  this.store.audit('LOCAL_USER','CONFIGURATION_DELETED',id,{kind:row.kind});return {deleted:true};
 });}
 saveModelKey({key}){if(typeof key!=='string'||! /^[\x21-\x7e]{16,512}$/.test(key))throw new LocalError('INVALID_MODEL_KEY');if(!this.vault)throw new LocalError('OS_CREDENTIAL_PROTECTION_UNAVAILABLE');
  // Revoke before replacing the secret: an interrupted write must not leave old
  // grants authorizing a different provider account/workspace.
  this.store.transaction(()=>{this.store.db.exec('UPDATE model_profile SET authorized=0,version=version+1; UPDATE review_policies SET enabled=0,version=version+1; UPDATE contact_rules SET enabled=0,version=version+1,authorization_hash=NULL');this.store.audit('LOCAL_USER','MODEL_AUTHORIZATION_REVOKED_FOR_KEY_CHANGE','qwen');});
  this.vault.put('MODEL_KEY','qwen',key);this.store.audit('LOCAL_USER','MODEL_KEY_SAVED','qwen');return {configured:true};}
 jobs(){return this.store.db.prepare('SELECT id,kind,state,created_at,updated_at FROM jobs ORDER BY created_at DESC,id LIMIT 100').all();}
 accounts(){return this.store.db.prepare('SELECT id,platform,name,state,daily_limit FROM accounts ORDER BY name,id').all();}
 messages(){return new LocalInbox(this.store).list().items;}
 inboxPage(input){return new LocalInbox(this.store).list(input);}
 conversations(input){return new LocalInbox(this.store).threads(input);}
 conversation(input){return new LocalInbox(this.store).thread(input);}
 unread(){return new LocalInbox(this.store).unread();}
 markRead({id}){return new LocalInbox(this.store).markRead(id);}
 runs(input){return this.reporting().runs(input);}
 reviews(input){return this.workspace().reviews(input);}
 runProgress(input){return this.workspace().runProgress(input); }
 decideReview({id,version,status}){if(typeof id!=='string'||!Number.isInteger(version)||!['APPROVED','REJECTED','PENDING'].includes(status))throw new LocalError('INVALID_REVIEW_DECISION');return this.store.transaction(()=>{const n=this.store.db.prepare('UPDATE review_results SET review_status=?,version=version+1 WHERE id=? AND version=?').run(status,id,version).changes;if(n!==1)throw new LocalError('REVIEW_CHANGED');this.store.audit('LOCAL_USER','REVIEW_DECISION',id,{status,previousVersion:version});return {updated:true};});}
 legacyOverview(){return {imports:this.store.db.prepare('SELECT id,counts,created_at FROM legacy_imports ORDER BY created_at DESC').all().map(row=>({...row,counts:JSON.parse(row.counts)})),entities:this.store.db.prepare('SELECT entity,count(*) count FROM legacy_records GROUP BY entity ORDER BY entity').all()};}
 legacyPage({entity,page=1}){this.page(page);if(typeof entity!=='string'||!require('./legacy-import.cjs').legacyEntities.includes(entity))throw new LocalError('INVALID_LEGACY_TABLE');return {items:this.store.db.prepare('SELECT import_id,ordinal,body FROM legacy_records WHERE entity=? ORDER BY import_id,ordinal LIMIT 30 OFFSET ?').all(entity,(page-1)*30).map(row=>({import_id:row.import_id,ordinal:row.ordinal,record:JSON.parse(row.body)})),total:this.store.db.prepare('SELECT count(*) n FROM legacy_records WHERE entity=?').get(entity).n,page};}
 page(value){if(!Number.isInteger(value)||value<1||value>100000)throw new LocalError('INVALID_PAGE');}
 evidenceOverview(){return this.evidence.list();}
 previewEvidence(input){return this.evidence.preview(input);}
 verifyEvidence(input){return this.evidence.verify(input);}
 cancelEvidence(){return this.evidence.cancel();}
 comparePostVersions(input){return new(require('./post-versions.cjs').PostVersions)(this.store).compare(input);}
 postHistory({postId,page=1}){this.page(page);const p=this.store.db.prepare('SELECT p.*,r.finished_at,r.status run_status FROM run_posts p JOIN collection_runs r ON r.id=p.run_id WHERE p.id=?').get(postId);if(!p)throw new LocalError('POST_NOT_FOUND');const snapshot=JSON.parse(p.snapshot),policy=require('@crm/local-runtime/policy');return {post:{id:p.id,runId:p.run_id,platformId:p.platform_id,title:JSON.parse(p.snapshot).title||'',body:JSON.parse(p.snapshot).body||'',coverage:p.coverage,observedAt:p.finished_at,imageDiagnostics:policy.safeImageDiagnostics(snapshot.imageDiagnostics)??null,boundedRead:policy.safeBoundedReadReport(snapshot.boundedRead)??null,boundedReadWindows:Array.isArray(snapshot.boundedReadWindows)?snapshot.boundedReadWindows.slice(0,8).map(policy.safeBoundedReadReport).filter(Boolean):[]},comments:{items:this.store.db.prepare("SELECT c.id,c.body,c.parent_id,json_extract(c.snapshot,'$.authorNickname') nickname,json_extract(c.snapshot,'$.publishedAt') published_at,CASE WHEN json_type(c.snapshot,'$.imageDiagnostics')='object' THEN json_extract(c.snapshot,'$.imageDiagnostics') ELSE NULL END image_diagnostics FROM run_comments c WHERE c.post_id=? ORDER BY ordinal LIMIT 30 OFFSET ?").all(postId,(page-1)*30).map(c=>({...c,image_diagnostics:policy.safeImageDiagnostics(c.image_diagnostics?JSON.parse(c.image_diagnostics):null)??null})),total:this.store.db.prepare('SELECT count(*) n FROM run_comments WHERE post_id=?').get(postId).n,page},versions:this.store.db.prepare('SELECT p.id,p.run_id,p.coverage,r.created_at,r.reason FROM run_posts p JOIN collection_runs r ON r.id=p.run_id WHERE p.platform_id=? ORDER BY r.created_at DESC,p.rowid DESC LIMIT 100').all(p.platform_id)};}
 savedPosts(input){return this.workflow.savedPosts(input);}
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
 inboxReceivers(){return this.store.db.prepare('SELECT r.account_id,a.name,r.state,r.reason,r.expires_at,r.updated_at,r.comment_mode,r.dm_mode,j.state job_state FROM inbox_receivers r JOIN accounts a ON a.id=r.account_id JOIN jobs j ON j.id=r.job_id ORDER BY a.name').all();}
 accountOverview(){return this.accountService.overview();}
 beginLogin(input){return this.accountService.begin(input);}
 pollLogin(input){return this.accountService.poll(input);}
 cancelLogin(input){return this.accountService.cancel(input);}
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
