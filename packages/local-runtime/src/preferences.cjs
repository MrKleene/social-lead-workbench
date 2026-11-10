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
}
module.exports={LocalPreferences};
