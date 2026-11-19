'use strict';
const {LocalError,canonical}=require('./database.cjs');
const validId=x=>typeof x==='string'&&x.length>0&&x.length<=200;
class LocalPreferences{
 constructor(store){this.store=store;this.db=store.db;}
 configuration(id){return this.db.prepare("SELECT id FROM configurations WHERE id=? AND kind='KEYWORDS' AND archived=0").get(id);}
 selection(){const row=this.db.prepare("SELECT value,revision FROM settings WHERE key='workspace-selection'").get();const saved=row?JSON.parse(row.value):this.legacy('AutomationPreferences')??{};return {version:row?.revision??0,configId:validId(saved.configId)&&this.configuration(saved.configId)?saved.configId:null};}
 select({configId,version}){if(!validId(configId)||!Number.isInteger(version))throw new LocalError('INVALID_LOCAL_PREFERENCE');return this.store.transaction(()=>{if(!this.configuration(configId))throw new LocalError('CONFIGURATION_CHANGED');if(this.selection().version!==version)throw new LocalError('PREFERENCE_CHANGED');this.put('workspace-selection',{configId},version+1);this.store.audit('LOCAL_USER','WORKSPACE_SELECTION_SAVED',configId);return this.selection();});}
 legacy(entity,id){const row=this.db.prepare("SELECT body FROM legacy_records WHERE entity=? AND (? IS NULL OR json_extract(body,'$.id')=?) ORDER BY import_id,ordinal LIMIT 1").get(entity,id??null,id??null);return row?JSON.parse(row.body):null;}
 get({configId}){
  if(!validId(configId)||!this.configuration(configId))throw new LocalError('CONFIGURATION_CHANGED');
  const row=this.db.prepare('SELECT value,revision FROM settings WHERE key=?').get('collection-preference:'+configId),legacy=this.legacy('CollectionConfig',configId),selection=this.legacy('AutomationPreferences');
  const value=row?JSON.parse(row.value):{accountId:typeof legacy?.defaultExecutionAccountId==='string'?legacy.defaultExecutionAccountId:null,batchLimit:Number.isInteger(legacy?.batchLimit)&&legacy.batchLimit>=1&&legacy.batchLimit<=10?legacy.batchLimit:1,policyIds:validId(selection?.policyId)?[selection.policyId]:[]};
  const issues=[];const a=value.accountId?this.db.prepare('SELECT state,session_ref FROM accounts WHERE id=?').get(value.accountId):null;
  if(value.accountId&&(!a||a.state!=='VERIFIED'||!a.session_ref))issues.push('PREFERRED_ACCOUNT_REQUIRES_LOGIN');
  for(const id of value.policyIds)if(!this.db.prepare('SELECT 1 FROM review_policies p WHERE p.id=? AND enabled=1 AND NOT EXISTS(SELECT 1 FROM configurations c WHERE c.id=p.id AND c.archived=1)').get(id))issues.push('PREFERRED_POLICY_REQUIRES_AUTHORIZATION');
  return {configId,version:row?.revision??0,...value,source:row?'LOCAL':legacy?'LEGACY':'DEFAULT',issues:[...new Set(issues)]};
 }
 save({configId,version,accountId,batchLimit,policyIds}){
  if(!validId(configId)||!Number.isInteger(version)||version<0||accountId!==null&&!validId(accountId)||!Number.isInteger(batchLimit)||batchLimit<1||batchLimit>10||!Array.isArray(policyIds)||policyIds.length>100||policyIds.some(x=>!validId(x))||new Set(policyIds).size!==policyIds.length)throw new LocalError('INVALID_LOCAL_PREFERENCE');
  return this.store.transaction(()=>{if(this.get({configId}).version!==version)throw new LocalError('PREFERENCE_CHANGED');if(accountId&&!this.db.prepare("SELECT 1 FROM accounts WHERE id=? AND state<>'ARCHIVED'").get(accountId))throw new LocalError('PREFERRED_ACCOUNT_UNAVAILABLE');for(const id of policyIds)if(!this.db.prepare('SELECT 1 FROM review_policies p WHERE id=? AND NOT EXISTS(SELECT 1 FROM configurations c WHERE c.id=p.id AND c.archived=1)').get(id))throw new LocalError('REVIEW_POLICY_CHANGED');this.put('collection-preference:'+configId,{accountId,batchLimit,policyIds},version+1);this.store.audit('LOCAL_USER','COLLECTION_PREFERENCES_SAVED',configId,{version:version+1});return this.get({configId});});
 }
 put(key,value,revision){this.db.prepare('INSERT INTO settings(key,value,revision) VALUES(?,?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value,revision=excluded.revision').run(key,canonical(value),revision);}
 /**
  * 三步各自的开关与选择（评论匹配 / 自动回复）。
  * 采集这一步的「采集规则」就是 workspace-selection 里的 configId，不在这里重复存。
  */
 steps(){
  const row=this.db.prepare("SELECT value,revision FROM settings WHERE key='automation-steps'").get(),saved=row?JSON.parse(row.value):{};
  return {version:row?.revision??0,
   autoReview:saved.autoReview===true,
   policyId:validId(saved.policyId)&&this.policy(saved.policyId)?saved.policyId:null,
   autoReply:saved.autoReply===true,
   // 模板池：可以选多条，发送时从中挑一条（不与上一条重复）。旧数据只有单条，按单元素池读。
   commentTemplateIds:this.templateIds(saved.commentTemplateIds??(saved.commentTemplateId?[saved.commentTemplateId]:[]),'COMMENT'),
   dmTemplateIds:this.templateIds(saved.dmTemplateIds??(saved.dmTemplateId?[saved.dmTemplateId]:[]),'DM'),
   // 回复账号池：数组顺序即配额耗尽后的取用顺序；账号被删除后自动摘掉，不静默换号。
   replyAccountIds:Array.isArray(saved.replyAccountIds)?saved.replyAccountIds.filter(id=>validId(id)&&this.account(id)):[],
   threshold:Number.isInteger(saved.threshold)&&saved.threshold>=0&&saved.threshold<=100?saved.threshold:80,
   refreshTime:typeof saved.refreshTime==='string'&&/^([01]\d|2[0-3]):[0-5]\d$/.test(saved.refreshTime)?saved.refreshTime:'00:00'};
 }
 saveSteps({version,autoReview,policyId,autoReply,commentTemplateIds,dmTemplateIds,replyAccountIds,threshold,refreshTime='00:00'}){
  const accounts=replyAccountIds??[],comments=commentTemplateIds??[],dms=dmTemplateIds??[];
  const ids=list=>Array.isArray(list)&&list.length<=20&&list.every(id=>validId(id))&&new Set(list).size===list.length;
  if(!Number.isInteger(version)||version<0||typeof autoReview!=='boolean'||typeof autoReply!=='boolean'||policyId!==null&&!validId(policyId)||!ids(comments)||!ids(dms)||!Array.isArray(accounts)||accounts.length>100||accounts.some(x=>!validId(x))||new Set(accounts).size!==accounts.length||!Number.isInteger(threshold)||threshold<0||threshold>100||typeof refreshTime!=='string'||!/^([01]\d|2[0-3]):[0-5]\d$/.test(refreshTime))throw new LocalError('INVALID_AUTOMATION_STEPS');
  return this.store.transaction(()=>{
   if(this.steps().version!==version)throw new LocalError('PREFERENCE_CHANGED');
   if(policyId&&!this.policy(policyId))throw new LocalError('REVIEW_POLICY_CHANGED');
   for(const id of comments)if(!this.template(id,'COMMENT'))throw new LocalError('CONTACT_TEMPLATE_CHANGED');
   for(const id of dms)if(!this.template(id,'DM'))throw new LocalError('CONTACT_TEMPLATE_CHANGED');
   for(const id of accounts)if(!this.account(id))throw new LocalError('PREFERRED_ACCOUNT_UNAVAILABLE');
   this.put('automation-steps',{autoReview,policyId,autoReply,commentTemplateIds:comments,dmTemplateIds:dms,replyAccountIds:accounts,threshold,refreshTime},version+1);
   this.store.audit('LOCAL_USER','AUTOMATION_STEPS_SAVED',policyId??'none',{version:version+1,autoReview,policyId,autoReply,commentTemplateIds:comments,dmTemplateIds:dms,replyAccountIds:accounts,threshold,refreshTime});
   return this.steps();
  });
 }
 account(id){return this.db.prepare("SELECT id FROM accounts WHERE id=? AND state<>'ARCHIVED'").get(id);}
 policy(id){return this.db.prepare('SELECT id FROM review_policies WHERE id=? AND NOT EXISTS(SELECT 1 FROM configurations c WHERE c.id=review_policies.id AND c.archived=1)').get(id);}
 template(id,channel){return this.db.prepare('SELECT id FROM configurations WHERE id=? AND kind=? AND archived=0').get(id,channel+'_TEMPLATE');}
 templateIds(list,channel){return Array.isArray(list)?list.filter(id=>validId(id)&&this.template(id,channel)):[];}
}
module.exports={LocalPreferences};
