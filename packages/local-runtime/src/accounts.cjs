'use strict';
const {randomUUID}=require('node:crypto');const {LocalError}=require('./database.cjs');const {historicalSendHold}=require('./account-safety.cjs');
// QR attempts are main-process-only objects. Neither a renderer nor a model can
// supply identity proof, Cookie, session reference or a VERIFIED account state.
class LocalAccounts{
 constructor(store,vault,runtime){this.store=store;this.db=store.db;this.vault=vault;this.runtime=runtime;this.attempt=null;}
 overview(){return {runtime:this.runtime.status(),accounts:this.db.prepare('SELECT id,name,state,daily_limit,revision,platform_user_id,session_ref IS NOT NULL hasSession FROM accounts WHERE state<>\'ARCHIVED\' ORDER BY name,id').all(),login:this.attempt?{id:this.attempt.id,accountId:this.attempt.accountId,expiresAt:this.attempt.expiresAt}:null};}
 async begin({accountId,revision,name,dailyLimit=10,consent}){
  if(consent!=='login-this-account-on-this-device-v1')throw new LocalError('PLATFORM_LOGIN_CONSENT_REQUIRED');if(this.attempt||this.store.active()||this.db.prepare("SELECT 1 FROM safety_state WHERE id='platform' AND reason IS NOT NULL").get())throw new LocalError('PLATFORM_BUSY_OR_PAUSED');
  if(!this.runtime.available('LOGIN')||!this.vault.protector.available())throw new LocalError('PLATFORM_LOGIN_UNAVAILABLE');if(typeof name!=='string'||!name.trim()||name.length>80||!Number.isInteger(dailyLimit)||dailyLimit<0||dailyLimit>1000)throw new LocalError('INVALID_ACCOUNT');
  const id=randomUUID(),now=this.store.clock(),aid=accountId||randomUUID();let expectedSender,accountRevision;
  this.store.transaction(()=>{
   const old=this.db.prepare('SELECT * FROM accounts WHERE id=?').get(aid);if(accountId&&(!old||old.state==='ARCHIVED'||old.revision!==revision))throw new LocalError('ACCOUNT_IDENTITY_CHANGED');
   expectedSender=old?.platform_user_id;accountRevision=(old?.revision??0)+1;
   if(old){this.db.prepare("UPDATE accounts SET name=?,daily_limit=?,revision=?,state=CASE WHEN state='RESTRICTED' THEN state ELSE 'UNVERIFIED' END,session_ref=NULL WHERE id=?").run(name.trim(),dailyLimit,accountRevision,aid);this.db.prepare('DELETE FROM account_capabilities WHERE account_id=?').run(aid);this.db.exec('UPDATE contact_rules SET enabled=0,version=version+1,authorization_hash=NULL');}
   else this.db.prepare("INSERT INTO accounts(id,platform,name,state,daily_limit) VALUES(?,'XHS',?,'UNVERIFIED',?)").run(aid,name.trim(),dailyLimit);
   this.db.prepare('INSERT INTO account_leases VALUES(?,?,1,?)').run(aid,'login:'+id,now+300000);this.store.audit('LOCAL_USER','ACCOUNT_LOGIN_AUTHORIZED',aid,{attempt:id,revision:accountRevision});
  });
  const attempt=this.attempt={id,accountId:aid,accountRevision,expectedSender,abort:new AbortController(),expiresAt:now+240000,session:null};
  try{attempt.session=await this.runtime.openLogin(attempt.abort.signal);const qr=await attempt.session.qr();attempt.expiresAt=Math.min(attempt.expiresAt,this.store.clock()+qr.seconds*1000);attempt.timer=setTimeout(()=>{void this.cancel({id}).catch(()=>{});},Math.max(1,attempt.expiresAt-this.store.clock()));attempt.timer.unref();return {id,accountId:aid,image:qr.image,expiresAt:attempt.expiresAt};}
  catch{await this.finish(attempt,false);throw new LocalError('PLATFORM_LOGIN_START_FAILED');}
 }
 current(id){const a=this.attempt;if(!a||a.id!==id||a.abort.signal.aborted||this.store.clock()>=a.expiresAt)throw new LocalError('LOGIN_ATTEMPT_EXPIRED');const row=this.db.prepare('SELECT * FROM accounts WHERE id=? AND revision=?').get(a.accountId,a.accountRevision);if(!row||row.state==='ARCHIVED')throw new LocalError('ACCOUNT_IDENTITY_CHANGED');return a;}
 async poll({id}){const a=this.current(id);let observed;try{observed=await a.session.status();this.current(id);}catch{await this.finish(a,false);throw new LocalError('PLATFORM_LOGIN_STATUS_FAILED');}if(!observed.loggedIn)return {state:'WAITING'};if(!/^[a-f0-9]{24}$/.test(observed.userId??'')||a.expectedSender&&a.expectedSender!==observed.userId){await this.finish(a,false);throw new LocalError('LOGIN_WRONG_ACCOUNT');}
  const duplicate=this.db.prepare('SELECT id FROM accounts WHERE platform_user_id=? AND id<>?').get(observed.userId,a.accountId);if(duplicate){await this.finish(a,false);throw new LocalError('PLATFORM_ACCOUNT_ALREADY_EXISTS');}
  const ref=randomUUID();let sealed=false,stopped=false;
  try{stopped=await a.session.saveAfterStop(payload=>{this.current(id);this.vault.put('PLATFORM_SESSION',ref,JSON.stringify({version:1,accountId:a.accountId,senderId:observed.userId,payload}));sealed=true;});if(!sealed||!stopped)throw new LocalError('PLATFORM_STOP_UNCONFIRMED');this.current(id);
   this.store.transaction(()=>{this.db.prepare("UPDATE accounts SET platform_user_id=?,session_ref=?,state=CASE WHEN state='RESTRICTED' THEN state ELSE 'VERIFIED' END WHERE id=? AND revision=?").run(observed.userId,ref,a.accountId,a.accountRevision);if(historicalSendHold(observed.userId))this.db.prepare('INSERT INTO account_holds VALUES(?,?,NULL,?,?,?)').run(randomUUID(),a.accountId,'LEGACY_REPLY_RESTRICTION',require('./database.cjs').hash({sender:observed.userId}),this.store.clock());this.store.audit('LOCAL_USER','PLATFORM_IDENTITY_VERIFIED',a.accountId,{revision:a.accountRevision,credentialsSealed:true});});
   await this.finish(a,true);return {state:'VERIFIED',accountId:a.accountId};
  }catch(error){if(sealed)this.vault.remove('PLATFORM_SESSION',ref);await this.finish(a,stopped);throw new LocalError(error?.code||'LOGIN_SAVE_FAILED');}
 }
 async finish(a,knownStopped){clearTimeout(a.timer);let confirmed=knownStopped;try{if(!confirmed&&a.session)confirmed=await a.session.stop();else if(!a.session)confirmed=true;}catch{}a.abort.abort();this.store.transaction(()=>{this.db.prepare('DELETE FROM account_leases WHERE account_id=? AND owner=?').run(a.accountId,'login:'+a.id);if(!confirmed){const e=this.store.audit('RECOVERY','LOGIN_STOP_UNCONFIRMED',a.accountId);this.db.prepare("INSERT INTO safety_state VALUES('platform',1,?,'PLATFORM_PROCESS_STOP_UNCONFIRMED',?) ON CONFLICT(id) DO UPDATE SET reason=excluded.reason,event_id=excluded.event_id,version=version+1").run(e,this.store.clock());}});if(this.attempt===a)this.attempt=null;return confirmed;}
 async cancel({id}){const a=this.attempt;if(!a||a.id!==id)throw new LocalError('LOGIN_ATTEMPT_NOT_CURRENT');a.abort.abort();return {stopped:await this.finish(a,false)};}
 async close(){if(this.attempt)await this.cancel({id:this.attempt.id});}
}
module.exports={LocalAccounts};
