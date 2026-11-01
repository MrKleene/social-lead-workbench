import type {AutoContactOverview} from '@crm/contracts';
import type {McpReadiness} from '@/features/collection/types';
import type {Account} from './types';
import {loginStatusLabel} from './types';
import {collectionAccountReason} from './account-presentation';

type Context={admin:boolean;readiness?:McpReadiness;contact?:AutoContactOverview;readError?:boolean;replyError?:boolean;loading?:boolean;now?:number};
export function accountStatusView(a:Account,c:Context){
 const read=c.readiness?.accounts?.find(x=>x.id===a.id),reply=c.contact?.accounts?.find(x=>x.id===a.id),observation=reply?.sendEligibility;
 const demo=a.isDemo||a.loginProvider==='offline',blocked=a.systemBlockReason||reply?.systemBlockReason||(a.status==='RESTRICTED'||read?.reason==='RESTRICTED'?'平台限制待核查':null);
 const restriction=observation&&observation.state!=='UNKNOWN'?({RESTRICTED:'平台限制待核查',VERIFY_REQUIRED:'平台要求验证身份',RATE_LIMITED:'平台限流，暂不可发送',REPLY_DISABLED:'平台限制评论回复'}[observation.state]):null;
 const issue=blocked==='历史平台限制报告，待复核'?'历史平台限制，待复核':blocked||restriction;
 const loginProblem:Record<string,string>={EXPIRED:'登录已失效，需处理',MISSING:'本机会话缺失，需处理',NEEDS_REVIEW:'身份或会话待核查',DEVICE_MISMATCH:'需在原设备核验',LEGACY_UNMAPPED:'历史账号待关联',NOT_CONNECTED:'需先扫码登录',LOGIN_REQUIRED:'需先扫码登录',RESTRICTED:'平台限制，需处理',RATE_LIMITED:'平台限流，稍后再试'};
 const loginBlock=loginProblem[a.loginStatus||''];
 const checking=a.loginStatus==='CHECKING';
 const login=demo?'离线演示':['VERIFIED','PREVIOUSLY_VERIFIED'].includes(a.loginStatus||'')?'登录已保存':a.loginStatus==='NOT_CONNECTED'?'未登录':loginStatusLabel[a.loginStatus||'']||'登录状态待核查';
 const fresh=!!observation?.checkedAt&&!observation.stale&&(c.now??Date.now())-Date.parse(observation.checkedAt)>=0&&(c.now??Date.now())-Date.parse(observation.checkedAt)<=300000;
 let collection='尚未获取资格',send='尚未获取资格';
 if(!c.admin){collection=send='管理员可查看';}
 else if(demo){collection=send='仅模拟，不用于真实任务';}
 else{
  collection=c.readError?'资格读取失败':loginBlock?loginBlock:checking?'正在检查登录':!c.readiness?c.loading?'正在读取资格':'尚未获取资格':!c.readiness.enabled?'采集服务未就绪':c.readiness.device?.online===false?'执行电脑离线':read?.eligible?'启动时自动核验':read?collectionAccountReason(read):'账号资格未获取';
  send=issue?'不可回复':c.replyError?'资格读取失败':loginBlock?loginBlock:checking?'正在检查登录':!c.contact?c.loading?'正在读取资格':'尚未获取资格':!c.contact.capabilities?.some(x=>x.platform===a.platform&&x.channel==='COMMENT'&&x.available)?'评论回复未开放':c.readiness?.device?.online===false?'执行电脑离线':c.contact.rules?.some(r=>r.platform===a.platform&&r.mode==='REAL'&&r.pauseReason)?'自动回复暂停，查看回复任务':a.occupied>=a.dailyLimit?'今日额度已用完':reply?.healthy&&observation?.canSend&&fresh?'发送前自动复核':reply?.canCheck?'执行前自动检查':'需核查登录或设备';
 }
 const risk=issue?(issue==='历史回复限制，禁止回复'?'历史回复受限':issue.includes('历史')?'历史限制待复核':issue):demo?'不适用':c.replyError?'状态读取失败':loginBlock?loginBlock:checking?'等待登录检查':fresh&&observation?.canSend?'本次未发现限制':reply?.canCheck?'执行前自动检查':!observation?.checkedAt?'尚无检查记录':'资格待核查';
 return {login,risk,collection,reply:send,issue,unknown:reply?.unknown??0,checkedAt:observation?.checkedAt??null};
}
