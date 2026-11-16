'use strict';
const {randomUUID}=require('node:crypto');const {LocalError}=require('./database.cjs');const {historicalSendHold}=require('./account-safety.cjs');
/** 主页限制检查里「明确看到就不能回复」的码 → 落成哪种风险记录。
 *  只有这几类：封号、禁言、评论关闭、内容受限。验证码/限流/待审核都是暂时的，不写。 */
const REPLY_BLOCKING={BANNED:'RESTRICTED',MUTED:'REPLY_DISABLED',COMMENT_RESTRICTED:'REPLY_DISABLED',ACCOUNT_CONTENT_RESTRICTED:'REPLY_DISABLED'};
// QR attempts are main-process-only objects. Neither a renderer nor a model can
// supply identity proof, Cookie, session reference or a VERIFIED account state.
class LocalAccounts{
 constructor(store,vault,runtime,inspection){this.store=store;this.db=store.db;this.vault=vault;this.runtime=runtime;this.inspection=inspection;this.attempt=null;}
 overview(){return {runtime:this.runtime.status(),accounts:this.db.prepare('SELECT id,name,nickname,avatar_url,state,daily_limit,revision,platform_user_id,session_ref IS NOT NULL hasSession FROM accounts WHERE state<>\'ARCHIVED\' AND NOT(state=\'UNVERIFIED\' AND platform_user_id IS NULL) ORDER BY name,id').all(),login:this.attempt?{id:this.attempt.id,accountId:this.attempt.accountId,expiresAt:this.attempt.expiresAt}:null};}
 async begin({accountId,revision,name,dailyLimit=10,consent}){
  if(consent!=='login-this-account-on-this-device-v1')throw new LocalError('PLATFORM_LOGIN_CONSENT_REQUIRED');if(this.attempt||this.store.active()||this.db.prepare("SELECT 1 FROM safety_state WHERE id='platform' AND reason IS NOT NULL").get())throw new LocalError('PLATFORM_BUSY_OR_PAUSED');
  if(!this.runtime.available('LOGIN')||!this.vault.protector.available())throw new LocalError('PLATFORM_LOGIN_UNAVAILABLE');if(typeof name!=='string'||!name.trim()||name.length>80||!Number.isInteger(dailyLimit)||dailyLimit<0||dailyLimit>1000)throw new LocalError('INVALID_ACCOUNT');
  const id=randomUUID(),now=this.store.clock(),aid=accountId||randomUUID();let expectedSender,accountRevision,created=false;
  this.store.transaction(()=>{
   const old=this.db.prepare('SELECT * FROM accounts WHERE id=?').get(aid);if(accountId&&(!old||old.state==='ARCHIVED'||old.revision!==revision))throw new LocalError('ACCOUNT_IDENTITY_CHANGED');
   expectedSender=old?.platform_user_id;accountRevision=(old?.revision??0)+1;
   if(old){this.db.prepare("UPDATE accounts SET name=?,daily_limit=?,revision=?,state=CASE WHEN state='RESTRICTED' THEN state ELSE 'UNVERIFIED' END,session_ref=NULL WHERE id=?").run(name.trim(),dailyLimit,accountRevision,aid);this.db.prepare('DELETE FROM account_capabilities WHERE account_id=?').run(aid);this.db.exec('UPDATE contact_rules SET enabled=0,version=version+1,authorization_hash=NULL');}
   else{this.db.prepare("INSERT INTO accounts(id,platform,name,state,daily_limit) VALUES(?,'XHS',?,'UNVERIFIED',?)").run(aid,name.trim(),dailyLimit);created=true;}
   this.db.prepare('INSERT INTO account_leases VALUES(?,?,1,?)').run(aid,'login:'+id,now+300000);this.store.audit('LOCAL_USER','ACCOUNT_LOGIN_AUTHORIZED',aid,{attempt:id,revision:accountRevision});
  });
  // created：这一行是本次扫码新建的。扫码没成功就回滚掉——「添加账号」只有扫码核验通过才算数。
  const attempt=this.attempt={id,accountId:aid,accountRevision,expectedSender,created,verified:false,scannedAt:null,abort:new AbortController(),expiresAt:now+240000,session:null};
  try{attempt.session=await this.runtime.openLogin(attempt.abort.signal);const qr=await attempt.session.qr();attempt.expiresAt=Math.min(attempt.expiresAt,this.store.clock()+qr.seconds*1000);attempt.timer=setTimeout(()=>{void this.cancel({id}).catch(()=>{});},Math.max(1,attempt.expiresAt-this.store.clock()));attempt.timer.unref();return {id,accountId:aid,image:qr.image,expiresAt:attempt.expiresAt};}
  catch{await this.finish(attempt,false);throw new LocalError('PLATFORM_LOGIN_START_FAILED');}
 }
 current(id){const a=this.attempt;if(!a||a.id!==id||a.abort.signal.aborted||this.store.clock()>=a.expiresAt)throw new LocalError('LOGIN_ATTEMPT_EXPIRED');const row=this.db.prepare('SELECT * FROM accounts WHERE id=? AND revision=?').get(a.accountId,a.accountRevision);if(!row||row.state==='ARCHIVED')throw new LocalError('ACCOUNT_IDENTITY_CHANGED');return a;}
 async poll({id}){const a=this.current(id);let observed;try{observed=await a.session.status();this.current(id);}catch{await this.finish(a,false);throw new LocalError('PLATFORM_LOGIN_STATUS_FAILED');}if(!observed.loggedIn){a.scannedAt=null;return {state:'WAITING'};}
  // 换号是致命的：明确的目标身份对不上就结束，不能继续等。
  if(a.expectedSender&&observed.userId&&a.expectedSender!==observed.userId){await this.finish(a,false);throw new LocalError('LOGIN_WRONG_ACCOUNT');}
  // 已扫码但身份还没读出来（缓存没落盘、页面还在加载）：先报 SCANNED 让界面立刻有反馈，
  // 不要把一次正常登录判成失败。超过 60 秒仍拿不到身份才结束尝试。
  if(!/^[a-f0-9]{24}$/.test(observed.userId??'')){a.scannedAt??=this.store.clock();if(this.store.clock()-a.scannedAt>60000){await this.finish(a,false);throw new LocalError('LOGIN_IDENTITY_UNAVAILABLE');}return {state:'SCANNED'};}
  const duplicate=this.db.prepare('SELECT id FROM accounts WHERE platform_user_id=? AND id<>?').get(observed.userId,a.accountId);if(duplicate){await this.finish(a,false);throw new LocalError('PLATFORM_ACCOUNT_ALREADY_EXISTS');}
  const ref=randomUUID();let sealed=false,stopped=false;
  try{stopped=await a.session.saveAfterStop(payload=>{this.current(id);this.vault.put('PLATFORM_SESSION',ref,JSON.stringify({version:1,accountId:a.accountId,senderId:observed.userId,payload}));sealed=true;});if(!sealed||!stopped)throw new LocalError('PLATFORM_STOP_UNCONFIRMED');this.current(id);
   this.store.transaction(()=>{this.db.prepare("UPDATE accounts SET platform_user_id=?,session_ref=?,nickname=?,avatar_url=?,state=CASE WHEN state='RESTRICTED' THEN state ELSE 'VERIFIED' END WHERE id=? AND revision=?").run(observed.userId,ref,observed.nickname??null,observed.avatar??null,a.accountId,a.accountRevision);if(historicalSendHold(observed.userId))this.db.prepare('INSERT INTO account_holds VALUES(?,?,NULL,?,?,?)').run(randomUUID(),a.accountId,'LEGACY_REPLY_RESTRICTION',require('./database.cjs').hash({sender:observed.userId}),this.store.clock());this.store.audit('LOCAL_USER','PLATFORM_IDENTITY_VERIFIED',a.accountId,{revision:a.accountRevision,credentialsSealed:true});});
   a.verified=true;await this.finish(a,true);
   // 登录成功不等于能回复：后台再查一次主页限制，看到封禁/禁言就记一条风险记录。
   // 不 await——扫码后不该为这次探测多等十几秒；账号列表轮询会把它刷出来。
   void this.inspectReplyEligibility(a.accountId,observed.userId).catch(()=>{});
   return {state:'VERIFIED',accountId:a.accountId};
  }catch(error){if(sealed)this.vault.remove('PLATFORM_SESSION',ref);await this.finish(a,stopped);throw new LocalError(error?.code||'LOGIN_SAVE_FAILED');}
 }
 /**
  * 手动重查一次回复权限（账号中心「重新检查」）。只读打开账号主页，唯一副作用是
  * 命中限制时补一条风险记录；不改账号状态、不发送。
  */
 async checkReplyEligibility({id}){
  if(typeof id!=='string'||!id||id.length>200)throw new LocalError('ACCOUNT_IDENTITY_CHANGED');
  const row=this.db.prepare("SELECT id,platform_user_id,session_ref FROM accounts WHERE id=? AND state<>'ARCHIVED'").get(id);
  if(!row||!row.session_ref||!/^[a-f0-9]{24}$/.test(row.platform_user_id??''))throw new LocalError('ACCOUNT_REQUIRES_LOGIN');
  if(!this.inspection||!this.runtime.available('ACCOUNT_CHECK'))throw new LocalError('ACCOUNT_CHECK_UNAVAILABLE');
  const result=await this.inspectReplyEligibility(id,row.platform_user_id);
  if(!result)throw new LocalError('ACCOUNT_CHECK_UNAVAILABLE');
  return {checked:true,restricted:!!result.reason,reason:result.reason??null,code:result.code};
 }
 /**
  * 登录后的一次只读「主页限制检查」。只在明确看到限制提示时落库，看不到什么都不写——
  * 原生结果对「没看到」的结论本身就是 NOT_A_SEND_PERMISSION_CHECK。
  */
 async inspectReplyEligibility(accountId,senderId){
  if(!this.inspection||!this.runtime.available('ACCOUNT_CHECK'))return null;
  const row=this.db.prepare('SELECT session_ref FROM accounts WHERE id=?').get(accountId);if(!row?.session_ref)return null;
  const abort=new AbortController();let session;
  try{
   session=await this.runtime.openSaved({accountId,senderId,sessionRef:row.session_ref,purpose:'ACCOUNT_CHECK'},abort.signal);
   const result=await this.inspection(session,{accountId,senderId});
   const code=[result.code,...result.warnings].find(c=>REPLY_BLOCKING[c]);
   if(!code)return {code:result.code,reason:null};
   const reason=REPLY_BLOCKING[code];
   this.store.transaction(()=>{
    if(this.db.prepare('SELECT 1 FROM account_holds WHERE account_id=? AND reason=?').get(accountId,reason))return;
    this.db.prepare('INSERT INTO account_holds VALUES(?,?,NULL,?,?,?)').run(randomUUID(),accountId,reason,require('./database.cjs').hash({accountId,senderId,code}),this.store.clock());
    this.store.audit('LOCAL_USER','REPLY_ELIGIBILITY_RESTRICTED',accountId,{code,reason});
   });
   return {code,reason};
  }finally{if(session)await session.stop().catch(()=>{});}
 }
 async finish(a,knownStopped){clearTimeout(a.timer);let confirmed=knownStopped,stopError;try{if(!confirmed&&a.session)confirmed=await a.session.stop();else if(!a.session)confirmed=true;}catch(error){stopError=error;if(error?.stopped===true)confirmed=true;}a.abort.abort();this.store.transaction(()=>{this.db.prepare('DELETE FROM account_leases WHERE account_id=? AND owner=?').run(a.accountId,'login:'+a.id);if(a.created&&!a.verified){this.db.prepare('DELETE FROM account_days WHERE account_id=?').run(a.accountId);this.db.prepare("DELETE FROM accounts WHERE id=? AND state='UNVERIFIED' AND platform_user_id IS NULL").run(a.accountId);}if(!confirmed){const e=this.store.audit('RECOVERY','LOGIN_STOP_UNCONFIRMED',a.accountId,{reason:String(stopError?.code||'STOP_NOT_PROVEN')});this.db.prepare("INSERT INTO safety_state VALUES('platform',1,?,'PLATFORM_PROCESS_STOP_UNCONFIRMED',?) ON CONFLICT(id) DO UPDATE SET reason=excluded.reason,event_id=excluded.event_id,version=version+1").run(e,this.store.clock());}});if(this.attempt===a)this.attempt=null;return confirmed;}
 async cancel({id}){const a=this.attempt;if(!a||a.id!==id)throw new LocalError('LOGIN_ATTEMPT_NOT_CURRENT');a.abort.abort();return {stopped:await this.finish(a,false)};}
 async close(){if(this.attempt)await this.cancel({id:this.attempt.id});}
}
module.exports={LocalAccounts};
