'use strict';
const {randomUUID}=require('node:crypto');
const {LocalError,canonical,hash}=require('./database.cjs');
const {historicalSendHold,legacyAccountRestricted}=require('./account-safety.cjs');
const allowed=new Set(['PlatformAccount','PlatformIdentity','SourcePost','SourceComment','AuditLog','ReplyTemplate','CollectionConfig','CollectionRun','MonitorPost','CommentObservation','SourceMatch','AccountDay','ContactLedger','ContactAttempt','SemanticReview','SemanticModelCall','SemanticControl','CapturedPost','CapturedComment','CommentReadCheckpoint','AutoReviewJob','CommentReviewPolicy','CommentReviewPolicyVersion','ManualReviewJob','AutoContactRule','AutoContactControl','AutoContactJob','PostAvailability','PostAvailabilityEvent','AutomationPreferences','NormalAutomationAcceptance','NormalAcceptancePost','ManualReplyRequest','HistoryArchiveBatch','HistoryArchiveItem','InboxReceiver','InboxMessage','InboxRead']);
const excluded=new Set(['User','Session','RefreshGrant','RefreshToken','LoginBucket','AccountLogin','AccountSessionReference','ExecutionDevice','DeviceExecutionLease','ModelSettings']);
const credentialFields=new Set(['password','leasetoken','sourcereference','sourcereferenceref','passwordhash','encryptedkey','csrftoken','cookies','cookie','authorization','loginSessionKey'.toLowerCase(),'sessionkey','tokenhash','xsec_token','xsectoken','privatekey','secret','accesstoken','refreshtoken','token']);
function clean(value,report){
 if(typeof value==='string'&&/^https?:\/\//i.test(value)){
  try{const url=new URL(value);let changed=false;if(url.username||url.password){url.username='';url.password='';report.omittedFields++;changed=true;}for(const key of [...url.searchParams.keys()])if(['xsec_token','access_token','token','auth','authorization','key','api_key','cookie'].includes(key.toLowerCase())){url.searchParams.delete(key);report.omittedFields++;changed=true;}if(changed)return url.href;}catch{/* Ordinary business text stays unchanged. */}
 }

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
   accounts.set(a.id,a);store.db.prepare('INSERT INTO accounts(id,platform,platform_user_id,name,state,daily_limit,revision) VALUES(?,?,?,?,?,?,?)').run(a.id,'XHS',a.loginPlatformUserId||null,a.label,a.archivedAt?'ARCHIVED':legacyAccountRestricted(a)?'RESTRICTED':'UNVERIFIED',a.dailyLimit,(a.version||0)+1);
   if(legacyAccountRestricted(a)||historicalSendHold(a.loginPlatformUserId))store.db.prepare('INSERT INTO account_holds VALUES(?,?,NULL,?,?,?)').run(randomUUID(),a.id,historicalSendHold(a.loginPlatformUserId)?'LEGACY_REPLY_RESTRICTION':'RESTRICTED',hash({accountId:a.id,status:a.status,source:'LEGACY_ACCOUNT'}),now);
  }
  for(const event of tables.AuditLog||[])if(accounts.has(event.entityId)&&event.action==='ACCOUNT_SEND_OBSERVATION'&&event.metadata?.state&&event.metadata.state!=='UNKNOWN')store.db.prepare('INSERT INTO account_holds VALUES(?,?,NULL,?,?,?)').run(randomUUID(),event.entityId,'LEGACY_ACCOUNT_OBSERVATION',hash(event),now);
  for(const c of tables.CollectionConfig||[]){if(!Array.isArray(c.keywords))throw new LocalError('INVALID_LEGACY_CONFIGURATION');store.db.prepare('INSERT INTO configurations(id,kind,name,body,revision,updated_at) VALUES(?,?,?,?,?,?)').run(c.id,'KEYWORDS',c.name,canonical({keywords:c.keywords}),Math.max(1,c.revision||1),now);if(c.archivedAt)store.db.prepare('UPDATE configurations SET archived=1 WHERE id=?').run(c.id);}
  for(const r of tables.ReplyTemplate||[]){if(!['DM','COMMENT'].includes(r.channel))throw new LocalError('INVALID_LEGACY_TEMPLATE');store.db.prepare('INSERT INTO configurations(id,kind,name,body,revision,updated_at) VALUES(?,?,?,?,?,?)').run(r.id,r.channel==='DM'?'DM_TEMPLATE':'COMMENT_TEMPLATE',r.name,canonical({text:r.body}),Math.max(1,r.version||1),now);}
  for(const p of tables.CommentReviewPolicy||[]){
   if(typeof p.id!=='string'||!require('@crm/local-runtime/policy').reviewPolicySaveSchema.safeParse({version:0,name:p.name,target:p.target}).success)throw new LocalError('INVALID_LEGACY_REVIEW_POLICY');
   const revision=Math.max(1,p.revision||1),version=Math.max(1,p.version||1)+1;
   store.db.prepare('INSERT INTO configurations(id,kind,name,body,revision,updated_at) VALUES(?,?,?,?,?,?)').run(p.id,'MATCHING',p.name,canonical({text:p.target}),revision,now);
   store.db.prepare('INSERT INTO review_policies(id,name,target,revision,version,enabled) VALUES(?,?,?,?,?,0)').run(p.id,p.name,p.target,revision,version);
  }
  const identities=new Map((tables.PlatformIdentity||[]).map(i=>[i.id,i])),ledgers=new Map((tables.ContactLedger||[]).map(l=>[l.id,l]));
  function block(identityId,channels,reason,hard=true){
   const i=identities.get(identityId);if(!i||typeof i.platformUserId!=='string'||!i.platformUserId)throw new LocalError('LEGACY_CONTACT_IDENTITY_MISSING');if(i.platform!=='XHS')return;
   for(const channel of channels)store.db.prepare('INSERT INTO contact_ledger(platform,channel,recipient_id,blocked,first_contact_blocked,reason) VALUES(?,?,?,?,1,?) ON CONFLICT(platform,channel,recipient_id) DO UPDATE SET blocked=max(blocked,excluded.blocked),first_contact_blocked=1,reason=CASE WHEN excluded.blocked=1 OR blocked=0 THEN excluded.reason ELSE reason END').run(i.platform,channel,i.platformUserId,hard?1:0,reason);
  }
  for(const attempt of tables.ContactAttempt||[]){if(attempt.mode!=='REAL'||attempt.outcome==='CANCELLED')continue;const ledger=ledgers.get(attempt.ledgerId);if(!ledger)throw new LocalError('LEGACY_LEDGER_MISSING');const uncertain=['RESERVED','ATTEMPTED','UNKNOWN'].includes(attempt.outcome);block(ledger.identityId,uncertain||!['COMMENT','DM'].includes(attempt.channel)?['COMMENT','DM']:[attempt.channel],'LEGACY_CONTACT_EVIDENCE',uncertain);}
  // Native history is view-only until an exact observation binds its receiver.
  // Per-user read markers remain in the archive; isNew is preserved conservatively.
  const messageRefs=new Map();let nativeMessages=0;
  for(const m of tables.InboxMessage||[]){
   if(!accounts.has(m.accountId)||!['DM','COMMENT'].includes(m.channel)||typeof m.id!=='string'||typeof m.platformId!=='string'||!m.platformId||typeof m.senderId!=='string'||!m.senderId||typeof m.body!=='string'||m.body.length>10000)continue;
   const at=Date.parse(m.receivedAt),published=Date.parse(m.publishedAt);
   store.db.prepare("INSERT INTO received_messages(id,account_id,channel,platform_id,sender_id,receiver_id,sender_name,body,content_type,post_id,post_title,comment_id,published_at,received_at,is_new,source,identity_verified) VALUES(?,?,?,?,?,NULL,?,?,?,?,?,?,?,?,?,'LEGACY',0)").run(m.id,m.accountId,m.channel,m.platformId,m.senderId,typeof m.senderName==='string'?m.senderName:'',m.body,m.contentType==='UNSUPPORTED'?'UNSUPPORTED':'TEXT',m.postId||null,m.postTitle||null,m.commentId||null,Number.isFinite(published)?published:null,Number.isFinite(at)?at:now,m.isNew?1:0);
   messageRefs.set(m.id,{accountId:m.accountId,platformId:m.platformId});nativeMessages++;
  }
  for(const a of tables.ContactAttempt||[]){
   if(a.mode!=='REAL'||!['RESERVED','ATTEMPTED','UNKNOWN','CONFIRMED'].includes(a.outcome)||a.channel!=='DM')continue;
   const saved=a.historySnapshot||{},ref=messageRefs.get(saved.inboxMessageId),accountId=ref?.accountId||a.accountIdSnapshot||ledgers.get(a.ledgerId)?.accountId,platformId=ref?.platformId||saved.inboundPlatformId;
   if(accounts.has(accountId)&&typeof platformId==='string'&&platformId)store.db.prepare('INSERT INTO inbound_history_blocks VALUES(?,?,?) ON CONFLICT(account_id,platform_id) DO NOTHING').run(accountId,platformId,a.outcome);
  }
  for(const usage of tables.AccountDay||[]){if(!accounts.has(usage.accountId)||!/^REAL:Asia\/Shanghai:\d{4}-\d{2}-\d{2}$/.test(usage.day))continue;if(!Number.isInteger(usage.occupied)||usage.occupied<0||usage.dailyLimitOverride!=null&&(!Number.isInteger(usage.dailyLimitOverride)||usage.dailyLimitOverride<0||usage.dailyLimitOverride>1000))throw new LocalError('INVALID_LEGACY_QUOTA');store.db.prepare('INSERT INTO account_days VALUES(?,?,?,?)').run(usage.accountId,usage.day.slice('REAL:Asia/Shanghai:'.length),usage.occupied,usage.dailyLimitOverride??null);}
  const nativeHistory={...require('./legacy-history.cjs').importHistory(store,tables,id),...require('./legacy-evidence.cjs').importUnknownEvidence(store,tables,id)};
  const event=store.audit('IMPORT','LEGACY_BUSINESS_IMPORTED',id,{sourceHash:digest,counts,credentialsImported:false,automaticTasksResumed:false,nativeMessages,nativeHistory});
  store.db.prepare("INSERT INTO safety_state VALUES('sending',1,?,'LEGACY_IMPORT_REQUIRES_REVIEW',?)").run(event,now);
  return {id,counts,reused:false,credentialsImported:false,sendPaused:true,nativeMessages,nativeHistory};
 });
}
module.exports={prepareLegacySnapshot,importLegacySnapshot,legacyEntities:Object.freeze([...allowed]),credentialFields:Object.freeze([...credentialFields])};
