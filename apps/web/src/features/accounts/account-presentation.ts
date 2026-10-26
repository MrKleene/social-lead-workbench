import type {Account} from './types';
export function accountName(a:Account){return a.loginNickname || a.label;}
export function accountState(a:Account){
 if(a.loginProvider==='offline'||a.loginStatus==='OFFLINE_VERIFIED')return '离线演示';
 if(a.status==='RESTRICTED')return '平台受限';
 const states:Record<string,string>={CHECKING:'正在检查登录',CONNECTION_ERROR:'登录连接异常',RATE_LIMITED:'平台限流，稍后再试',RESTRICTED:'平台限制，需人工处理',VERIFIED:'登录已确认',UNVERIFIED:'待检查登录',EXPIRED:'登录已失效',MISSING:'本机会话缺失',NEEDS_REVIEW:'身份或保存状态待核查',DEVICE_MISMATCH:'请在原设备恢复',LEGACY_UNMAPPED:'历史账号待关联'};
 return states[a.loginStatus||'']||'待扫码登录';
}
export function hasSavedLogin(a:Account){return !!(a.loginVerifiedAt||a.sessionReference);}
export function canRecover(a:Account){return !!a.sessionReference&&a.loginStatus!=='DEVICE_MISMATCH'&&a.status!=='RESTRICTED';}
