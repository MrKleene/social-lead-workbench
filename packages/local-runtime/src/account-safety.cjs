'use strict';
const {createHash,randomUUID}=require('node:crypto');
const {LocalError,canonical}=require('./database.cjs');
const digest=s=>createHash('sha256').update(s).digest('hex');
const historicalHolds=require('@crm/local-runtime/historical-send-holds').sha256;
const loginOnlyReasons=new Set(['登录已验证；真实采集与发送仍禁用','登录已验证；只读采集须逐次确认，发送禁用','等待本人授权']);
const historicalSendHold=id=>typeof id==='string'&&historicalHolds.includes(digest(id));
const legacyAccountRestricted=a=>a.status==='RESTRICTED'||a.status==='PAUSED'&&!loginOnlyReasons.has(a.pauseReason||'');
// 与 send-safety 的 dayAt 同一时区口径（Asia/Shanghai 的自然日）。
function dayAt(timestamp){const f=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit'});return f.format(new Date(timestamp));}
function dayStart(timestamp){const day=dayAt(timestamp);return Date.parse(day+'T00:00:00+08:00');}
const HOLD_DAYS=7;
/** 今天被风控停用的账号：当天额度被钉成 0，或今天留下过风险记录。 */
function restricted(store,accountId){
  const now=store.clock(),day=dayAt(now);
  return !!store.db.prepare('SELECT 1 FROM account_holds WHERE account_id=? AND created_at>=?').get(accountId,dayStart(now));
}
function restrictedToday(store){return store.db.prepare('SELECT DISTINCT account_id id FROM account_holds WHERE created_at>=?').all(dayStart(store.clock())).map(r=>r.id);}
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
/** 轻证据：账号、渠道、原因码、第几条、收件人、平台原话。重证据（页面结构/日志）只在判不了时由调用方追加。 */
function lightEvidence(evidence){
  const keep={};
  for(const key of ['reason','code','platformReason','message','attemptId','jobId','index','recipientId','recipientNickname','accountId','channel'])if(evidence?.[key]!==undefined&&evidence[key]!==null)keep[key]=evidence[key];
  return keep;
}
// Internal adapter boundary only. A renderer/model response must never call this.
function retainAccountRisk(store,accountId,channel,reason,evidence){return store.transaction(()=>retainAccountRiskInTransaction(store,accountId,channel,reason,evidence));}
/**
 * 账号级风控：只停这个账号，不锁全库发送、也不停用所有规则。
 *  - 记一条风险记录（轻证据）；
 *  - 该账号今天不再参与发送（当天额度钉成 0）；
 *  - 撤销该账号的评论能力证明；
 *  - 其余账号照常工作，由编排换号续发。
 */
function retainAccountRiskInTransaction(store,accountId,channel,reason,evidence){
  if(!store.db.isTransaction)throw new LocalError('TRANSACTION_REQUIRED');
  if(!['COMMENT','DM',null].includes(channel)||!['RESTRICTED','VERIFY_REQUIRED','RATE_LIMITED','REPLY_DISABLED','PLATFORM_REFUSED','LEGACY_REPLY_RESTRICTION','LEGACY_ACCOUNT_OBSERVATION'].includes(reason))throw new LocalError('INVALID_ACCOUNT_RISK');
  {
    if(!store.db.prepare('SELECT 1 FROM accounts WHERE id=?').get(accountId))throw new LocalError('ACCOUNT_NOT_FOUND');
    const now=store.clock(),detail=canonical(lightEvidence({...evidence,accountId,channel,reason,at:now})).slice(0,2000),sourceHash=digest(canonical(evidence));
    store.db.prepare("INSERT INTO account_holds(id,account_id,channel,reason,source_hash,created_at,detail) VALUES(?,?,?,?,?,?,?) ON CONFLICT DO NOTHING").run(randomUUID(),accountId,channel,reason,sourceHash,now,detail);
    store.db.prepare('DELETE FROM account_capabilities WHERE account_id=?').run(accountId);
    store.db.prepare('UPDATE accounts SET revision=revision+1 WHERE id=?').run(accountId);
    const event=store.audit('AUTOMATION','ACCOUNT_RISK_RETAINED',accountId,{channel,reason,sourceHash,detail:lightEvidence({...evidence,accountId,channel,reason,at:now})});
    return {event,restrictedToday:restrictedToday(store).length};
  }
}
/** 限制解除：清掉这个账号（该渠道）的风险记录。发送成功、主页复查通过都算解除证据。 */
function releaseAccountRisk(store,accountId,channel,reason){return store.transaction(()=>releaseAccountRiskInTransaction(store,accountId,channel,reason));}
function releaseAccountRiskInTransaction(store,accountId,channel,reason){
  if(!store.db.isTransaction)throw new LocalError('TRANSACTION_REQUIRED');
  // channel 为空 = 整个账号的限制都解除了（主页复查通过）：连同当天的停用一起撤销。
  const removed=channel==null?store.db.prepare('DELETE FROM account_holds WHERE account_id=?').run(accountId).changes:store.db.prepare('DELETE FROM account_holds WHERE account_id=? AND (channel IS NULL OR channel=?)').run(accountId,channel).changes;
  if(removed)store.audit('AUTOMATION','ACCOUNT_RESTRICTION_RELEASED',accountId,{channel,reason,removed});
  return removed;
}
/** 未解决的风控记录 7 天后自动清理（用户明确要求：留证据但不无限期留）。 */
function expireAccountHolds(store,{days=HOLD_DAYS}={}){
  return store.transaction(()=>{
    const cutoff=store.clock()-days*86400000,rows=store.db.prepare('SELECT id,account_id,reason FROM account_holds WHERE created_at<=?').all(cutoff);
    for(const row of rows)store.db.prepare('DELETE FROM account_holds WHERE id=?').run(row.id);
    if(rows.length)store.audit('RECOVERY','ACCOUNT_HOLDS_EXPIRED','installation',{count:rows.length,days});
    return rows.length;
  });
}
module.exports={assertSendAccount,assertConfiguredSendAccount,retainAccountRisk,retainAccountRiskInTransaction,releaseAccountRisk,releaseAccountRiskInTransaction,expireAccountHolds,restricted,restrictedToday,historicalSendHold,legacyAccountRestricted,dayAt,dayStart};
