import type {McpReadiness} from '@/features/collection/types';
const labels:Record<string,string>={PREVIOUSLY_VERIFIED:'上次验证通过；本次任务启动前将再次核验',VERIFIED:'上次验证通过；本次任务启动前将再次核验',UNVERIFIED:'已保存本机会话；任务启动前核验登录',CHECKING:'账号正在检查登录状态',CONNECTION_ERROR:'上次连接异常；重试任务时会重新核验',EXPIRED:'登录已失效，请重新扫码',MISSING:'本机会话缺失，请到账号中心处理',NEEDS_REVIEW:'账号身份或会话需人工核查',DEVICE_MISMATCH:'请在原执行设备检查',RESTRICTED:'平台限制，请先人工处理',RATE_LIMITED:'平台限流，请等待后重试',LOGIN_REQUIRED:'请先在账号中心扫码登录',DEVICE_UNAVAILABLE:'执行设备离线，请恢复连接'};
/** Metadata only: viewing, refreshing and waiting never probe the platform. */
export function useSessionPreflight(readiness:McpReadiness|undefined,_enabled:boolean,defaultAccountId?:string|null){
 const supported=readiness?.sessionCheckVersion===2;
 const candidate=readiness?.accounts?.find(a=>a.id===defaultAccountId);
 const state=readiness?.device?.online===false?'DEVICE_UNAVAILABLE':candidate?.reason;
 const retryAt=state&&['CONNECTION_ERROR','RATE_LIMITED','UNVERIFIED'].includes(state)&&candidate?.retryAt&&Date.parse(candidate.retryAt)>Date.now()?candidate.retryAt:null;
 return {supported,candidate,working:false,error:null,message:!defaultAccountId?'请在采集设置中选择默认执行账号':!candidate?'默认执行账号不可用，请修改采集设置':state?labels[state]||'等待任务启动前核验':'',retryAt,verifiedAt:candidate?.verifiedAt};
}
