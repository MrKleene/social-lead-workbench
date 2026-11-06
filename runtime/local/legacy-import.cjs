'use strict';
const {randomUUID}=require('node:crypto');
const {LocalError,canonical,hash}=require('./database.cjs');
const allowed=new Set(['PlatformAccount','PlatformIdentity','SourcePost','SourceComment','Lead','FollowUp','Task','AuditLog','ReplyTemplate','CollectionConfig','CollectionRun','MonitorPost','CommentObservation','SourceMatch','CollectionNotice','NoticeRead','AccountDay','ContactLedger','ContactAttempt','SemanticReview','SemanticModelCall','SemanticControl','CapturedPost','CapturedComment','CommentReadCheckpoint','AutoReviewJob','CommentReviewPolicy','CommentReviewPolicyVersion','ManualReviewJob','AutoContactRule','AutoContactControl','AutoContactJob','PostAvailability','PostAvailabilityEvent','AutomationPreferences','NormalAutomationAcceptance','NormalAcceptancePost','ManualReplyRequest','HistoryArchiveBatch','HistoryArchiveItem','InboxReceiver','InboxMessage','InboxRead']);
const excluded=new Set(['User','Session','RefreshGrant','RefreshToken','LoginBucket','AccountLogin','AccountSessionReference','ExecutionDevice','DeviceExecutionLease','ModelSettings']);
const credentialFields=new Set(['passwordhash','encryptedkey','csrftoken','cookies','cookie','authorization','loginSessionKey'.toLowerCase(),'sessionkey','tokenhash','xsec_token','xsectoken','privatekey','secret','accesstoken','refreshtoken','token']);
function clean(value,report){
 if(Array.isArray(value))return value.map(v=>clean(v,report));
 if(value&&typeof value==='object'){const out={};for(const [key,v] of Object.entries(value)){if(credentialFields.has(key.toLowerCase())){report.omittedFields++;continue;}Object.defineProperty(out,key,{value:clean(v,report),enumerable:true,writable:true,configurable:true});}return out;}
 return value;
}
// Converts an explicitly supplied offline JSON export. Never connects to the old
// database, reads a Cookie file, decrypts a key, or changes the source instance.
function prepareLegacySnapshot(tables){
 if(!tables||Object.getPrototypeOf(tables)!==Object.prototype)throw new LocalError('INVALID_LEGACY_EXPORT');
 const report={omittedTables:[],omittedFields:0},result={};
 for(const [entity,rows] of Object.entries(tables)){
  if(excluded.has(entity)){report.omittedTables.push(entity);continue;}
  if(!allowed.has(entity)||!Array.isArray(rows)||rows.some(r=>!r||Object.getPrototypeOf(r)!==Object.prototype))throw new LocalError('INVALID_LEGACY_TABLE');
  result[entity]=clean(rows,report);
 }
 return {format:'social-lead-business-export-v1',tables:result,redaction:report};
}
function importLegacySnapshot(store,snapshot){
 if(snapshot?.format!=='social-lead-business-export-v1')throw new LocalError('INVALID_LEGACY_FORMAT');
 const prepared=prepareLegacySnapshot(snapshot.tables);
 if(prepared.redaction.omittedFields||prepared.redaction.omittedTables.length)throw new LocalError('UNREDACTED_LEGACY_EXPORT');
 const tables=prepared.tables,digest=hash(tables),counts=Object.fromEntries(Object.entries(tables).map(([name,rows])=>[name,rows.length]));
 if(Object.values(counts).reduce((n,x)=>n+x,0)>2000000)throw new LocalError('IMPORT_TOO_LARGE');
 return store.transaction(()=>{
  const existing=store.db.prepare('SELECT id,counts FROM legacy_imports WHERE source_hash=?').get(digest);if(existing)return {id:existing.id,counts:JSON.parse(existing.counts),reused:true};
  if(store.active()||store.db.prepare('SELECT (SELECT count(*) FROM configurations)+(SELECT count(*) FROM accounts)+(SELECT count(*) FROM contact_ledger)+(SELECT count(*) FROM legacy_imports)+(SELECT count(*) FROM jobs) n').get().n)throw new LocalError('IMPORT_REQUIRES_EMPTY_DATABASE');
  const id=randomUUID(),now=store.clock();store.db.prepare('INSERT INTO legacy_imports VALUES(?,?,?,?)').run(id,digest,canonical(counts),now);
  const insert=store.db.prepare('INSERT INTO legacy_records VALUES(?,?,?,?)');for(const [entity,rows] of Object.entries(tables))rows.forEach((row,i)=>insert.run(id,entity,i,canonical(row)));
  const accounts=new Map();for(const a of tables.PlatformAccount||[]){
   if(a.isDemo||a.platform!=='XHS'||a.loginProvider&&a.loginProvider!=='real')continue;
   if(typeof a.id!=='string'||typeof a.label!=='string'||!Number.isInteger(a.dailyLimit)||a.dailyLimit<0||a.dailyLimit>1000)throw new LocalError('INVALID_LEGACY_ACCOUNT');
   accounts.set(a.id,a);store.db.prepare('INSERT INTO accounts(id,platform,platform_user_id,name,state,daily_limit,revision) VALUES(?,?,?,?,?,?,?)').run(a.id,'XHS',a.loginPlatformUserId||null,a.label,a.archivedAt?'ARCHIVED':['RESTRICTED','PAUSED'].includes(a.status)?'RESTRICTED':'UNVERIFIED',a.dailyLimit,(a.version||0)+1);
  }
  for(const c of tables.CollectionConfig||[]){if(c.archivedAt)continue;if(!Array.isArray(c.keywords)||!Array.isArray(c.excludeWords))throw new LocalError('INVALID_LEGACY_CONFIGURATION');store.db.prepare('INSERT INTO configurations(id,kind,name,body,revision,updated_at) VALUES(?,?,?,?,?,?)').run(c.id,'KEYWORDS',c.name,canonical({keywords:c.keywords,excludeWords:c.excludeWords}),Math.max(1,c.revision||1),now);}
  for(const r of tables.ReplyTemplate||[]){if(!['DM','COMMENT'].includes(r.channel))throw new LocalError('INVALID_LEGACY_TEMPLATE');store.db.prepare('INSERT INTO configurations(id,kind,name,body,revision,updated_at) VALUES(?,?,?,?,?,?)').run(r.id,r.channel==='DM'?'DM_TEMPLATE':'COMMENT_TEMPLATE',r.name,canonical({text:r.body}),Math.max(1,r.version||1),now);}
  const identities=new Map((tables.PlatformIdentity||[]).map(i=>[i.id,i])),ledgers=new Map((tables.ContactLedger||[]).map(l=>[l.id,l]));
  function block(identityId,channels,reason){const i=identities.get(identityId);if(!i||typeof i.platformUserId!=='string'||!i.platformUserId)throw new LocalError('LEGACY_CONTACT_IDENTITY_MISSING');if(i.platform!=='XHS')return;for(const channel of channels)store.db.prepare('INSERT INTO contact_ledger(platform,channel,recipient_id,blocked,reason) VALUES(?,?,?,1,?) ON CONFLICT(platform,channel,recipient_id) DO UPDATE SET blocked=1,reason=excluded.reason').run(i.platform,channel,i.platformUserId,reason);}
  for(const lead of tables.Lead||[])if(lead.doNotContact||(!lead.isDemo&&(lead.contactedAt||['CONTACTED','INTERESTED'].includes(lead.contactStage))))block(lead.identityId,['COMMENT','DM'],lead.doNotContact?'LEGACY_DO_NOT_CONTACT':'LEGACY_CONTACT_EVIDENCE');
  for(const attempt of tables.ContactAttempt||[]){if(attempt.mode!=='REAL'||attempt.outcome==='CANCELLED')continue;const ledger=ledgers.get(attempt.ledgerId);if(!ledger)throw new LocalError('LEGACY_LEDGER_MISSING');block(ledger.identityId,['RESERVED','ATTEMPTED','UNKNOWN'].includes(attempt.outcome)||!['COMMENT','DM'].includes(attempt.channel)?['COMMENT','DM']:[attempt.channel],'LEGACY_CONTACT_EVIDENCE');}
  for(const usage of tables.AccountDay||[]){if(!accounts.has(usage.accountId)||!/^REAL:Asia\/Shanghai:\d{4}-\d{2}-\d{2}$/.test(usage.day))continue;if(!Number.isInteger(usage.occupied)||usage.occupied<0||usage.dailyLimitOverride!=null&&(!Number.isInteger(usage.dailyLimitOverride)||usage.dailyLimitOverride<0||usage.dailyLimitOverride>1000))throw new LocalError('INVALID_LEGACY_QUOTA');store.db.prepare('INSERT INTO account_days VALUES(?,?,?,?)').run(usage.accountId,usage.day.slice('REAL:Asia/Shanghai:'.length),usage.occupied,usage.dailyLimitOverride??null);}
  const event=store.audit('IMPORT','LEGACY_BUSINESS_IMPORTED',id,{sourceHash:digest,counts,credentialsImported:false,automaticTasksResumed:false});
  store.db.prepare("INSERT INTO safety_state VALUES('sending',1,?,'LEGACY_IMPORT_REQUIRES_REVIEW',?)").run(event,now);
  return {id,counts,reused:false,credentialsImported:false,sendPaused:true};
 });
}
module.exports={prepareLegacySnapshot,importLegacySnapshot};
