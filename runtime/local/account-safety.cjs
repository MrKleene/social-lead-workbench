'use strict';
const {createHash,randomUUID}=require('node:crypto');
const {LocalError,canonical}=require('./database.cjs');
const digest=s=>createHash('sha256').update(s).digest('hex');
const historicalHolds=require('./historical-send-holds.json').sha256;
const loginOnlyReasons=new Set(['登录已验证；真实采集与发送仍禁用','登录已验证；只读采集须逐次确认，发送禁用','等待本人授权']);
const historicalSendHold=id=>typeof id==='string'&&historicalHolds.includes(digest(id));
const legacyAccountRestricted=a=>a.status==='RESTRICTED'||a.status==='PAUSED'&&!loginOnlyReasons.has(a.pauseReason||'');
function sendAccount(store,id,revision,channel,requireCapability){
  const a=store.db.prepare("SELECT * FROM accounts WHERE id=? AND state='VERIFIED'").get(id);
  if(!a||a.revision!==revision||!a.session_ref||!a.platform_user_id)throw new LocalError('ACCOUNT_IDENTITY_CHANGED');
  if(historicalSendHold(a.platform_user_id)||store.db.prepare('SELECT 1 FROM account_holds WHERE account_id=? AND (channel IS NULL OR channel=?)').get(id,channel))throw new LocalError('ACCOUNT_HAS_RETAINED_RESTRICTION');
  if(channel==='COMMENT'&&requireCapability){
    const proof=store.db.prepare("SELECT * FROM account_capabilities WHERE account_id=? AND channel='COMMENT'").get(id),now=store.clock();
    if(!proof||proof.account_revision!==revision||proof.sender_id!==a.platform_user_id||proof.session_hash!==digest(a.session_ref)||proof.verified_at>now||proof.expires_at<=now||proof.expires_at-proof.verified_at>300000)throw new LocalError('COMMENT_CAPABILITY_REQUIRED');
  }
  return a;
}
const assertSendAccount=(store,id,revision,channel)=>sendAccount(store,id,revision,channel,true);
const assertConfiguredSendAccount=(store,id,revision,channel)=>sendAccount(store,id,revision,channel,false);
// Internal adapter boundary only. A renderer/model response must never call this.
function retainAccountRisk(store,accountId,channel,reason,evidence){return store.transaction(()=>retainAccountRiskInTransaction(store,accountId,channel,reason,evidence));}
function retainAccountRiskInTransaction(store,accountId,channel,reason,evidence){
  if(!store.db.isTransaction)throw new LocalError('TRANSACTION_REQUIRED');
  if(!['COMMENT','DM',null].includes(channel)||!['RESTRICTED','VERIFY_REQUIRED','RATE_LIMITED','REPLY_DISABLED','PLATFORM_REFUSED','LEGACY_REPLY_RESTRICTION','LEGACY_ACCOUNT_OBSERVATION'].includes(reason))throw new LocalError('INVALID_ACCOUNT_RISK');
  {
    if(!store.db.prepare('SELECT 1 FROM accounts WHERE id=?').get(accountId))throw new LocalError('ACCOUNT_NOT_FOUND');
    const sourceHash=digest(canonical(evidence));
    store.db.prepare('INSERT INTO account_holds VALUES(?,?,?,?,?,?) ON CONFLICT DO NOTHING').run(randomUUID(),accountId,channel,reason,sourceHash,store.clock());
    store.db.prepare('DELETE FROM account_capabilities WHERE account_id=?').run(accountId);
    store.db.prepare('UPDATE accounts SET revision=revision+1 WHERE id=?').run(accountId);
    store.db.exec('UPDATE contact_rules SET enabled=0,version=version+1,authorization_hash=NULL');
    const event=store.audit('AUTOMATION','ACCOUNT_RISK_RETAINED',accountId,{channel,reason,sourceHash});
    store.db.prepare("INSERT INTO safety_state VALUES('sending',1,?,'ACCOUNT_RESTRICTED',?) ON CONFLICT(id) DO UPDATE SET version=version+1,event_id=excluded.event_id,reason=excluded.reason,created_at=excluded.created_at").run(event,store.clock());
  }
}
module.exports={assertSendAccount,assertConfiguredSendAccount,retainAccountRisk,retainAccountRiskInTransaction,historicalSendHold,legacyAccountRestricted};
