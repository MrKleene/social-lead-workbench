import {contactStatusLabel,type AutoContactJobView} from '@crm/contracts';
const labels:Record<string,string>={PENDING_ACTION:'待处理',MANUAL_READY:'已确认 · 等待执行',CONFIRMED:'已回复',UNKNOWN:'结果未知',ATTEMPTED:'执行中 · 等待详细进度',RESERVED:'已分配账号 · 等待执行',SIMULATED_SUCCESS:'模拟完成'};
const phases:Record<string,string>={CHECKING_ACCOUNT:'正在核验发送账号',PREPARING_SEND:'正在准备发送',LOCATING_TARGET:'正在定位回复对象',FILLING_MESSAGE:'正在准备回复内容',SUBMITTING:'正在自动发送',CONFIRMING:'正在确认发送结果'};
export function contactJobStatus(job:AutoContactJobView,now=Date.now(),disconnected=false){
 const fallback={label:labels[job.status]||contactStatusLabel[job.status as keyof typeof contactStatusLabel]||'状态待核查',busy:false};
 if(!['WAITING_ACCOUNT','MANUAL_READY','RESERVED','ATTEMPTED'].includes(job.status))return fallback;
 const live=job.live;if(!live||live.executionId!==job.id||live.stage!=='contact')return fallback;
 if(disconnected)return {label:'连接中断，正在重连',busy:false};
 const age=now-new Date(live.at).getTime();
 if(live.state==='stale'||!Number.isFinite(age)||age>15000||age< -5000)return {label:'进度更新中断，请核查任务',busy:false};
 if(live.state!=='running'||!phases[live.phase])return {label:'正在更新任务结果',busy:false};
 return {label:phases[live.phase],busy:true};
}
