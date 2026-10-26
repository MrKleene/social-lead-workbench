import type {Account} from './types';
type NamedAccount={id:string;label:string;loginNickname?:string|null};
const placeholder=/^(?:小红书|抖音)\s*[·・]?\s*待授权账号$/;
export function accountRemark(a:NamedAccount){const label=a.label.trim();return placeholder.test(label)?'':label;}
export function accountTag(a:NamedAccount){return `…${a.id.slice(-6)}`;}
export function accountName(a:NamedAccount){return a.loginNickname?.trim()||accountRemark(a)||'昵称未获取';}
export function accountOptionName(a:NamedAccount){const name=accountName(a),remark=accountRemark(a);return `${name}${remark&&remark!==name?`（${remark}）`:''} · ${accountTag(a)}`;}
export function accountState(a:Account){
 if(a.loginProvider==='offline'||a.loginStatus==='OFFLINE_VERIFIED')return '离线演示';
 if(a.status==='RESTRICTED')return '平台受限';
 const states:Record<string,string>={PREVIOUSLY_VERIFIED:'上次验证通过',CHECKING:'正在检查登录',CONNECTION_ERROR:'登录连接异常',RATE_LIMITED:'平台限流，稍后再试',RESTRICTED:'平台限制，需人工处理',VERIFIED:'上次验证通过',UNVERIFIED:'任务启动前核验',EXPIRED:'登录已失效',MISSING:'本机会话缺失',NEEDS_REVIEW:'身份或保存状态待核查',DEVICE_MISMATCH:'请在原设备恢复',LEGACY_UNMAPPED:'历史账号待关联'};
 return states[a.loginStatus||'']||'待扫码登录';
}
export function hasSavedLogin(a:Account){return !!(a.loginVerifiedAt||a.sessionReference);}
export function canRecover(a:Account){return !!a.sessionReference&&a.loginStatus!=='DEVICE_MISMATCH'&&a.status!=='RESTRICTED';}
