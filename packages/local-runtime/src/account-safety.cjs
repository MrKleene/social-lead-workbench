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
/** 账号能力只用当前状态表达；历史 hold 仍保留为证据，但不再单独作为永久拦截。 */
function capabilityAccount(store,id,revision,channel){
 const a=store.db.prepare("SELECT * FROM accounts WHERE id=? AND state='VERIFIED'").get(id);
 if(!a||a.revision!==revision||!a.session_ref||!a.platform_user_id)throw new LocalError('ACCOUNT_IDENTITY_CHANGED');
 if(a.collect_state==='CHECKING'||a.contact_state==='CHECKING')throw new LocalError('ACCOUNT_CHECK_IN_PROGRESS');
 if(a.contact_state!=='ALLOWED')throw new LocalError('ACCOUNT_HAS_RETAINED_RESTRICTION');
 if(store.db.prepare('SELECT 1 FROM account_holds WHERE account_id=? AND (channel IS NULL OR channel=?)').get(id,channel))throw new LocalError('ACCOUNT_HAS_RETAINED_RESTRICTION');
 return a;
}
function sendAccount(store,id,revision,channel,requireCapability){
 const a=capabilityAccount(store,id,revision,channel);
 if(channel==='COMMENT'&&requireCapability){
  const proof=store.db.prepare("SELECT * FROM account_capabilities WHERE account_id=? AND channel='COMMENT'").get(id),now=store.clock();
  if(!proof||proof.account_revision!==revision||proof.sender_id!==a.platform_user_id||proof.session_hash!==digest(a.session_ref)||proof.verified_at>now||proof.expires_at<=now||proof.expires_at-proof.verified_at>300000)throw new LocalError('COMMENT_CAPABILITY_REQUIRED');
 }
 return a;
}
const assertSendAccount=(store,id,revision,channel)=>sendAccount(store,id,revision,channel,true);
const assertConfiguredSendAccount=(store,id,revision,channel)=>sendAccount(store,id,revision,channel,false);
/** 采集能力独立于发送：检测中或已被平台限制时都不允许开新一轮采集。 */
function assertCollectAccount(store,id,revision){
 const a=store.db.prepare("SELECT * FROM accounts WHERE id=? AND state='VERIFIED'").get(id);
 if(!a||a.revision!==revision||!a.session_ref||!a.platform_user_id)throw new LocalError('ACCOUNT_IDENTITY_CHANGED');
 if(a.collect_state==='CHECKING'||a.contact_state==='CHECKING')throw new LocalError('ACCOUNT_CHECK_IN_PROGRESS');
 if(a.collect_state!=='ALLOWED')throw new LocalError('ACCOUNT_HAS_RETAINED_RESTRICTION');
 return a;
}
/** 今天被风控停用的账号：今天留下过风险记录。 */
function restricted(store,accountId){
 const now=store.clock();
 return !!store.db.prepare('SELECT 1 FROM account_holds WHERE account_id=? AND created_at>=?').get(accountId,dayStart(now));
}
function restrictedToday(store){return store.db.prepare('SELECT DISTINCT account_id id FROM account_holds WHERE created_at>=?').all(dayStart(store.clock())).map(r=>r.id);}
/** 轻证据：账号、渠道、原因码、第几条、收件人、平台原话。重证据（页面结构/日志）只由调用方追加。 */
function lightEvidence(evidence){
 const keep={};
 for(const key of ['reason','code','platformReason','message','attemptId','jobId','index','recipientId','recipientNickname','accountId','channel'])if(evidence?.[key]!==undefined&&evidence[key]!==null)keep[key]=evidence[key];
 return keep;
}
// Internal adapter boundary only. A renderer/model response must never call this.
function retainAccountRisk(store,accountId,channel,reason,evidence){return store.transaction(()=>retainAccountRiskInTransaction(store,accountId,channel,reason,evidence));}
/**
 * 账号级风控：只停这个账号，不锁全库发送、也不停用所有规则。
 *  - 记一条风险记录（轻证据），账号联系能力立即变为 BLOCKED；
 *  - 封禁同时停掉采集能力，其余限制只停联系；
 *  - 撤销该账号的评论能力证明；
 *  - 只有重新检测能恢复，不再按天数自动过期。
 */
function retainAccountRiskInTransaction(store,accountId,channel,reason,evidence){
 if(!store.db.isTransaction)throw new LocalError('TRANSACTION_REQUIRED');
 if(!['COMMENT','DM',null].includes(channel)||!['RESTRICTED','VERIFY_REQUIRED','RATE_LIMITED','REPLY_DISABLED','PLATFORM_REFUSED','LEGACY_REPLY_RESTRICTION','LEGACY_ACCOUNT_OBSERVATION'].includes(reason))throw new LocalError('INVALID_ACCOUNT_RISK');
 if(!store.db.prepare('SELECT 1 FROM accounts WHERE id=?').get(accountId))throw new LocalError('ACCOUNT_NOT_FOUND');
 const now=store.clock(),detail=canonical(lightEvidence({...evidence,accountId,channel,reason,at:now})).slice(0,2000),sourceHash=digest(canonical(evidence));
 const duplicate=channel==null?store.db.prepare('SELECT 1 FROM account_holds WHERE account_id=? AND channel IS NULL AND reason=?').get(accountId,reason):store.db.prepare('SELECT 1 FROM account_holds WHERE account_id=? AND channel=? AND source_hash=?').get(accountId,channel,sourceHash);
 if(!duplicate)store.db.prepare("INSERT INTO account_holds(id,account_id,channel,reason,source_hash,created_at,detail) VALUES(?,?,?,?,?,?,?) ON CONFLICT DO NOTHING").run(randomUUID(),accountId,channel,reason,sourceHash,now,detail);
 store.db.prepare("UPDATE accounts SET contact_state='BLOCKED',collect_state=CASE WHEN ?='RESTRICTED' THEN 'BLOCKED' ELSE collect_state END,eligibility_checked_at=? WHERE id=?").run(reason,now,accountId);
 store.db.prepare('DELETE FROM account_capabilities WHERE account_id=?').run(accountId);
 store.db.prepare('UPDATE accounts SET revision=revision+1 WHERE id=?').run(accountId);
 const event=store.audit('AUTOMATION','ACCOUNT_RISK_RETAINED',accountId,{channel,reason,sourceHash,detail:lightEvidence({...evidence,accountId,channel,reason,at:now})});
 return {event,restrictedToday:restrictedToday(store).length};
}
/** 限制解除：清掉这个账号（该渠道）的风险记录。发送成功、主页复查通过都算解除证据。 */
function releaseAccountRisk(store,accountId,channel,reason){return store.transaction(()=>releaseAccountRiskInTransaction(store,accountId,channel,reason));}
function releaseAccountRiskInTransaction(store,accountId,channel,reason){
 if(!store.db.isTransaction)throw new LocalError('TRANSACTION_REQUIRED');
 const removed=channel==null?store.db.prepare('DELETE FROM account_holds WHERE account_id=?').run(accountId).changes:store.db.prepare('DELETE FROM account_holds WHERE account_id=? AND (channel IS NULL OR channel=?)').run(accountId,channel).changes;
 if(channel==null)store.db.prepare("UPDATE accounts SET contact_state='ALLOWED',collect_state='ALLOWED',eligibility_checked_at=? WHERE id=?").run(store.clock(),accountId);
 else store.db.prepare("UPDATE accounts SET contact_state='ALLOWED',eligibility_checked_at=? WHERE id=?").run(store.clock(),accountId);
 if(removed)store.audit('AUTOMATION','ACCOUNT_RESTRICTION_RELEASED',accountId,{channel,reason,removed});
 return removed;
}
module.exports={assertSendAccount,assertConfiguredSendAccount,assertCollectAccount,retainAccountRisk,retainAccountRiskInTransaction,releaseAccountRisk,releaseAccountRiskInTransaction,restricted,restrictedToday,historicalSendHold,legacyAccountRestricted,dayAt,dayStart};
