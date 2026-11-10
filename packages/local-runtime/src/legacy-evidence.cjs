'use strict';
const {randomUUID}=require('node:crypto'),{LocalError,canonical,hash}=require('./database.cjs');
const pid=s=>typeof s==='string'&&/^[a-f0-9]{24}$/.test(s);
function importUnknownEvidence(store,tables,importId){
 if(!store.db.isTransaction)throw new LocalError('TRANSACTION_REQUIRED');const db=store.db,ledgers=new Map((tables.ContactLedger||[]).map(l=>[l.id,l])),identities=new Map((tables.PlatformIdentity||[]).map(i=>[i.id,i])),candidates=[];let uncertain=0;
 for(const [ordinal,a] of (tables.ContactAttempt||[]).entries()){
  if(a.mode!=='REAL'||!['UNKNOWN','ATTEMPTED','RESERVED'].includes(a.outcome))continue;uncertain++;const ledger=ledgers.get(a.ledgerId),identity=identities.get(ledger?.identityId),h=a.historySnapshot||{},accountId=a.accountIdSnapshot,account=db.prepare('SELECT * FROM accounts WHERE id=?').get(accountId??'');
  if(!account||identity?.platform!=='XHS'||!pid(identity.platformUserId)||h.recipientId!==identity.platformUserId||!pid(h.senderPlatformId)||h.senderPlatformId!==account.platform_user_id||h.accountId!==accountId||ledger.accountId!==accountId||!['DM','COMMENT'].includes(a.channel)||typeof a.content!=='string'||!a.content.trim()||a.content.length>1000||/[\r\n\0]/.test(a.content)||!/^(?:REAL:Asia\/Shanghai:)?\d{4}-\d{2}-\d{2}$/.test(a.day||'')||!Number.isFinite(Date.parse(a.createdAt))||!Number.isFinite(Date.parse(a.updatedAt)))continue;
  if(a.channel==='COMMENT'&&(!pid(h.postId)||!pid(h.commentId)))continue;
  candidates.push({ordinal,a,account,recipient:identity.platformUserId,sender:h.senderPlatformId,target:a.channel==='DM'?{recipientId:identity.platformUserId}:{postId:h.postId,commentId:h.commentId,recipientId:identity.platformUserId}});
 }
 let mapped=0;
 for(const c of candidates){
  // Several unresolved originals for one identity cannot be collapsed to one result.
  if(candidates.filter(x=>x.recipient===c.recipient).length!==1)continue;
  const {a,account}=c,id=randomUUID(),grant=randomUUID(),job=randomUUID(),requestKey='legacy-evidence:'+hash({importId,ordinal:c.ordinal}),now=store.clock(),scope={legacyEvidenceOnly:true,sourceHash:hash(a),senderId:c.sender,recipientId:c.recipient,accountId:account.id},body=canonical(scope),scopeHash=hash(scope),day=a.day.slice(-10);
  db.prepare("INSERT INTO authorizations(id,purpose,scope,scope_hash,state,created_at,expires_at) VALUES(?,'SEND',?,?,'REVOKED',?,?)").run(grant,body,scopeHash,now,now);
  db.prepare("INSERT INTO jobs(id,request_key,kind,payload,payload_hash,authorization_id,state,available_at,created_at,updated_at,dispatch_started,cancel_requested) VALUES(?,?,'SEND',?,?,?,'UNKNOWN',?,?,?,1,1)").run(job,requestKey,body,scopeHash,grant,now,Date.parse(a.createdAt),Date.parse(a.updatedAt));
  db.prepare("INSERT INTO send_attempts(id,request_key,platform,channel,recipient_id,account_id,account_revision,authorization_id,scope_hash,content,target,quota_day,state,created_at,updated_at,sender_id) VALUES(?,?,'XHS',?,?,?,?,?,?,?,?,?,'UNKNOWN',?,?,?)").run(id,requestKey,a.channel,c.recipient,account.id,account.revision,grant,scopeHash,a.content,canonical(c.target),day,Date.parse(a.createdAt),Date.parse(a.updatedAt),c.sender);
  db.prepare('INSERT INTO legacy_evidence_links VALUES(?,?,?)').run(importId,c.ordinal,id);mapped++;
 }
 return {mappedUnknown: mapped,unmappedUnknown:uncertain-mapped};
}
module.exports={importUnknownEvidence};
