import type {Account} from './types';
type NamedAccount={id:string;label:string;loginNickname?:string|null};
const placeholder=/^(?:小红书|抖音)\s*[·・]?\s*(?:待授权账号|待扫码)$/;
export function accountRemark(a:NamedAccount){const label=a.label.trim();return placeholder.test(label)?'':label;}
export function accountName(a:NamedAccount){return a.loginNickname?.trim()||accountRemark(a)||'昵称未获取';}
function optionLabel(a:NamedAccount){const name=accountName(a),remark=accountRemark(a);return `${name}${remark&&remark!==name?`（${remark}）`:''}`;}
export function accountOptionName(a:NamedAccount,peers:NamedAccount[]=[]){
 const label=optionLabel(a),duplicates=peers.filter(item=>optionLabel(item)===label),index=duplicates.findIndex(item=>item.id===a.id);
 return duplicates.length>1&&index>=0?`${label}（同名账号 ${index+1}）`:label;
}
/** Display the collection service's own decision; reply restrictions are separate. */
export function collectionAccountReason(a:{eligible:boolean;reason:string}){
 if(a.eligible)return '';
 const reasons:Record<string,string>={RESTRICTED:'采集受限，待复核',EXPIRED:'登录已失效',LOGIN_EXPIRED:'登录已失效',MISSING:'本机会话缺失',LOGIN_REQUIRED:'需先扫码登录',NOT_CONNECTED:'需先扫码登录',NEEDS_REVIEW:'身份或会话待核查',IDENTITY_MISMATCH:'账号身份不符',DEVICE_MISMATCH:'需在原设备核验',DEVICE_UNAVAILABLE:'执行电脑离线',CHECKING:'正在检查登录',RATE_LIMITED:'平台限流，稍后再试',CONNECTION_ERROR:'连接异常，稍后重试',UNVERIFIED:'等待登录核验',LEGACY_UNMAPPED:'历史账号待关联'};
 return reasons[a.reason]||'采集条件未满足';
}
export function accountState(a:Account){
 if(a.loginProvider==='offline'||a.loginStatus==='OFFLINE_VERIFIED')return '离线演示';
 if(a.systemBlockReason)return a.systemBlockReason;
 if(a.status==='RESTRICTED')return '平台受限';
 const states:Record<string,string>={PREVIOUSLY_VERIFIED:'上次验证通过',CHECKING:'正在检查登录',CONNECTION_ERROR:'登录连接异常',RATE_LIMITED:'平台限流，稍后再试',RESTRICTED:'平台限制，需人工处理',VERIFIED:'上次验证通过',UNVERIFIED:'任务启动前核验',EXPIRED:'登录已失效',MISSING:'本机会话缺失',NEEDS_REVIEW:'身份或保存状态待核查',DEVICE_MISMATCH:'请在原设备恢复',LEGACY_UNMAPPED:'历史账号待关联'};
 return states[a.loginStatus||'']||'待扫码登录';
}
export function hasSavedLogin(a:Account){return !!(a.loginVerifiedAt||a.sessionReference);}
export function canRecover(a:Account){return !!a.sessionReference&&a.loginStatus!=='DEVICE_MISMATCH'&&a.status!=='RESTRICTED';}
