import type {JourneySummary} from '@crm/contracts';
import type {Run} from '@/features/collection/types';
import {collectionOutcome} from '@/features/collection/collection-outcome';
import {journeyStages,type JourneyStage} from './journey-model';
export type StepState='idle'|'next'|'running'|'queued'|'complete'|'paused'|'failed'|'unknown'|'skipped'|'partial'|'loading'|'unavailable';
export type JourneyStep={id:JourneyStage;label:string;state:StepState;status:string};
const count=(m:Record<string,number>,keys:string[])=>keys.reduce((n,k)=>n+(m[k]||0),0);
const total=(m:Record<string,number>)=>Object.values(m).reduce((n,x)=>n+x,0);
export function journeyStepState(input:{run?:Run;summary?:JourneySummary;error?:boolean;reviewEnabled:boolean;sendEnabled:boolean;history?:boolean;pauseReason?:string|null;now?:number;loading?:boolean}) {
 const {run,summary:s,reviewEnabled,sendEnabled,history,pauseReason}=input;
 const steps:JourneyStep[]=journeyStages.map(x=>({id:x.id,label:x.label,state:'idle',status:'待开始'}));
 const set=(i:number,state:StepState,status:string)=>Object.assign(steps[i],{state,status});
 if(!run){if(input.loading&&!input.error)steps.forEach(s=>Object.assign(s,{state:'loading',status:'读取任务'}));return {steps,current:null,caption:input.error?'进度读取失败':input.loading?'正在读取任务':'尚未开始',attention:!!input.error};}
 const outcome=collectionOutcome(run);
 if(run.status==='RUNNING')set(0,'running','采集中');
 else if(run.status==='QUEUED')set(0,'queued','等待采集');
 else if(run.status==='FAILED')set(0,'failed','采集失败');
 else if(run.status==='PAUSED')set(0,'paused','已暂停');
 else if(run.status==='CANCELLED')set(0,'paused','已取消');
 else if(['COMPLETE','PARTIAL'].includes(run.status))set(0,outcome.warning?'partial':'complete',outcome.warning?'已结束 · 有异常':'采集已结束');
 else set(0,'unknown','状态待确认');
 if(input.error){if(['running','queued'].includes(steps[0].state))set(0,'unavailable','状态读取失败');set(1,'unavailable','状态读取失败');set(2,'unavailable','状态读取失败');}
 else if(!s){set(1,'loading','读取进度');set(2,'loading','读取进度');}
 else {
  const j=s.reviewJobs,r=s.reviews,c=s.contacts;
  const unexpected=(m:Record<string,number>,keys:string[])=>Object.keys(m).some(k=>m[k]>0&&!keys.includes(k));
  if(unexpected(j,['PENDING','PROCESSING','RUNNING','COMPLETED','FAILED','CANCELLED','SKIPPED'])||unexpected(r,['EVALUATED','FAILED','PROCESSING','UNANALYSED','PENDING','UNCONFIGURED']))set(1,'unknown','匹配状态待核查');
  else if(count(j,['PROCESSING','RUNNING'])||r.PROCESSING)set(1,'running','评论匹配中');
  else if(j.PENDING)set(1,'queued','等待匹配');
  else if(j.FAILED||r.FAILED)set(1,'failed','匹配存在失败');
  else if(j.CANCELLED||j.SKIPPED)set(1,'partial','部分帖子未送审');
  else if(r.UNCONFIGURED||r.UNANALYSED||r.PENDING)set(1,'paused','尚有未匹配评论');
  else if((j.COMPLETED??0)>=(run.capturedPosts||Infinity)||r.EVALUATED&&total(r)>=(run.capturedCommentsCount??Infinity))set(1,'complete','匹配已完成');
  else if(r.EVALUATED||j.COMPLETED)set(1,'unknown','评分覆盖待确认');
  else if(!run.capturedCommentsCount&&!['RUNNING','QUEUED'].includes(run.status))set(1,'skipped','无评论');
  else if(!reviewEnabled&&!history)set(1,'skipped','匹配未启用');
  else set(1,steps[0].state==='complete'?'next':'idle',history?'暂无匹配记录':steps[0].state==='complete'?'下一步 · 评论匹配':'等待采集');
  if(c.UNKNOWN||c.BLOCKED_POST||unexpected(c,['PENDING_ACTION','MANUAL_READY','QUEUED','WAITING_QUOTA','WAITING_ACCOUNT','RESERVED','ATTEMPTED','UNKNOWN','BLOCKED_POST','CONFIRMED','SIMULATED_SUCCESS','FAILED','CANCELLED','SKIPPED']))set(2,'unknown',c.UNKNOWN?`${c.UNKNOWN} 条结果未知`:'发送状态待核查');
  else if(c.ATTEMPTED)set(2,'queued','执行中 · 等待详细进度');
  else if(c.RESERVED)set(2,'queued','已分配账号 · 等待执行');
  else if(c.PENDING_ACTION)set(2,'paused',`${c.PENDING_ACTION} 条待处理`);
  else if(c.WAITING_QUOTA)set(2,'paused','等待额度');
  else if(c.WAITING_ACCOUNT)set(2,'paused','等待可用账号');
  else if(c.QUEUED||c.MANUAL_READY)set(2,pauseReason||!sendEnabled&&!history?'paused':'queued',pauseReason?'发送已暂停':!sendEnabled&&!history?'发送已关闭':'等待回复');
  else if(c.FAILED)set(2,'failed','回复存在失败');
  else if(c.CANCELLED||c.SKIPPED)set(2,'partial','已结束 · 有未发送');
  else if(c.SIMULATED_SUCCESS)set(2,'skipped','模拟处理结束');
  else if(total(c)&&c.CONFIRMED)set(2,'complete',`已确认 ${c.CONFIRMED} 条`);
  else if(steps[1].state==='complete'&&s.matches===0)set(2,'skipped','无匹配对象');
  else if(pauseReason&&!history)set(2,'paused','发送已暂停');
  else if(!sendEnabled&&!history)set(2,'skipped','自动回复未启用');
  else set(2,steps[1].state==='complete'?'next':'idle',history?'暂无回复记录':steps[1].state==='complete'?'下一步 · 自动回复':'等待匹配');
 }
 for(const live of input.error?[]:s?.live?.current??[]){
  const step=steps.find(x=>x.id===live.stage);if(!step)continue;
  const eligible=live.stage==='collect'?['running','queued'].includes(step.state):live.stage==='review'?['running','queued'].includes(step.state):!['unknown','failed','partial','complete','skipped'].includes(step.state)&&!pauseReason;
  if(!eligible)continue;
  const age=(input.now??Date.now())-new Date(live.at).getTime();const stale=live.state==='stale'||!Number.isFinite(age)||age>15000||age< -5000;
  step.state=stale?'unavailable':'running';step.status=(stale?'进度更新中断，请核查任务':live.label)+(live.concurrent>1?` · ${live.concurrent} 项并行`:'');
 }
 const attention=steps.some(x=>['unknown','failed','paused','partial','unavailable'].includes(x.state));
 const active=steps.filter(x=>['running','queued'].includes(x.state));
 const issue=[...steps].reverse().find(x=>['unknown','failed','paused','partial','unavailable'].includes(x.state));
 const next=steps.find(x=>x.state==='next');
 const current=active.at(-1)?.id??issue?.id??next?.id??null;
 const ended=steps.every(x=>['complete','skipped'].includes(x.state));
 const caption=active.length?active.map(x=>`${x.label} · ${x.status}`).join(' / ')+(issue?.id==='contact'&&issue.state==='unknown'?' · 发送结果未知，勿重发':''):issue?`${issue.label} · ${issue.status}${issue.id==='contact'&&issue.state==='unknown'?' · 勿重发':''}`:ended?(steps.every(x=>x.state==='complete')?'本轮已完成':'本轮已结束'):next?`${next.status}`:'正在读取进度';
 return {steps,current,caption,attention};
}
