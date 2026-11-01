import type {AutoContactOverview} from '@crm/contracts';
import type {McpReadiness} from '@/features/collection/types';
import type {Account} from './types';
import {loginStatusLabel} from './types';

type Context={admin:boolean;readiness?:McpReadiness;contact?:AutoContactOverview;readError?:boolean;replyError?:boolean;loading?:boolean;now?:number};
export function accountStatusView(a:Account,c:Context){
 const read=c.readiness?.accounts?.find(x=>x.id===a.id),reply=c.contact?.accounts?.find(x=>x.id===a.id),observation=reply?.sendEligibility;
 const demo=a.isDemo||a.loginProvider==='offline',blocked=a.systemBlockReason||reply?.systemBlockReason||(a.status==='RESTRICTED'||read?.reason==='RESTRICTED'?'平台限制待核查':null);
 const restriction=observation&&observation.state!=='UNKNOWN'?({RESTRICTED:'平台限制待核查',VERIFY_REQUIRED:'平台要求验证身份',RATE_LIMITED:'平台限流，暂不可发送',REPLY_DISABLED:'平台限制评论回复'}[observation.state]):null;
 const issue=blocked||restriction;
 const login=demo?'离线演示':['VERIFIED','PREVIOUSLY_VERIFIED'].includes(a.loginStatus||'')?'已保存登录，执行前核验':a.loginStatus==='NOT_CONNECTED'?'未登录':loginStatusLabel[a.loginStatus||'']||'登录状态待核查';
 const fresh=!!observation?.checkedAt&&!observation.stale&&(c.now??Date.now())-Date.parse(observation.checkedAt)>=0&&(c.now??Date.now())-Date.parse(observation.checkedAt)<=300000;
 let collection='尚未获取资格',send='尚未获取资格';
 if(!c.admin){collection=send='管理员可查看';}
 else if(demo){collection=send='仅模拟，不用于真实任务';}
 else{
  collection=issue?'不可采集':c.readError?'资格读取失败':!c.readiness?c.loading?'正在读取资格':'尚未获取资格':!c.readiness.enabled?'采集服务未就绪':c.readiness.device?.online===false?'执行电脑离线':read?.eligible?'可选用，启动时核验':read?loginStatusLabel[read.reason]||'需核查登录或设备':'账号资格未获取';
  send=issue?'不可回复':c.replyError?'资格读取失败':!c.contact?c.loading?'正在读取资格':'尚未获取资格':!c.contact.capabilities?.some(x=>x.platform===a.platform&&x.channel==='COMMENT'&&x.available)?'评论回复未开放':c.readiness?.device?.online===false?'执行电脑离线':c.contact.rules?.some(r=>r.platform===a.platform&&r.mode==='REAL'&&r.pauseReason)?'自动回复暂停，查看回复任务':a.occupied>=a.dailyLimit?'今日额度已用完':reply?.healthy&&observation?.canSend&&fresh?'检查通过，发送前复核':reply?.canCheck?observation?.checkedAt?fresh?'资格待核验，发送前检查':'检查已过期，发送前核验':'尚未检查，发送前核验':'需核查登录或设备';
 }
 const risk=issue?'需处理':demo?'不适用':c.replyError?'状态读取失败':!observation?.checkedAt?'尚未检查':fresh&&observation.canSend?'本次检查未发现限制':fresh?'待重新核验':'检查已过期';
 return {login,risk,collection,reply:send,issue,unknown:reply?.unknown??0,checkedAt:observation?.checkedAt??null};
}
