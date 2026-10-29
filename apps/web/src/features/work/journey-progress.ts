import type {JourneySummary} from '@crm/contracts';
const total=(v:Record<string,number>)=>Object.values(v).reduce((n,x)=>n+x,0);
const count=(v:Record<string,number>,keys:string[])=>keys.reduce((n,k)=>n+(v[k]||0),0);
export function journeyProgress(s:JourneySummary,reviewEnabled:boolean,sendEnabled:boolean){
 const r=s.reviews,j=s.reviewJobs,c=s.contacts;
 const reviewPending=count(r,['PROCESSING','UNANALYSED','PENDING'])+count(j,['PENDING','PROCESSING','RUNNING']);
 const reviewFailed=(r.FAILED||0)+(j.FAILED||0),reviewOther=!!(j.CANCELLED||j.SKIPPED)||Object.keys(j).some(k=>!['COMPLETED','FAILED','PENDING','PROCESSING','RUNNING','CANCELLED','SKIPPED'].includes(k))||Object.keys(r).some(k=>!['EVALUATED','FAILED','PROCESSING','UNANALYSED','PENDING'].includes(k));
 const review=reviewPending?'匹配待处理':reviewFailed?'匹配存在失败':reviewOther?'匹配状态待核查':total(r)?`已评分 ${r.EVALUATED||0} 条`:reviewEnabled?'暂无本轮匹配记录':'LLM 匹配关闭';
 const pending=count(c,['QUEUED','WAITING_QUOTA','WAITING_ACCOUNT','RESERVED','ATTEMPTED']);
 const unknown=count(c,['UNKNOWN','BLOCKED_POST']);
 const other=Object.keys(c).some(k=>!['QUEUED','WAITING_QUOTA','WAITING_ACCOUNT','RESERVED','ATTEMPTED','UNKNOWN','BLOCKED_POST','CONFIRMED','SIMULATED_SUCCESS','FAILED','CANCELLED','SKIPPED'].includes(k));
 const ended=total(c)>0&&!pending&&!unknown&&!other;
 const contact=unknown?`${unknown} 条需核查 / 未知`:pending?`${pending} 条待处理${sendEnabled?'':' · 发送关闭'}`:other?'发送状态待核查':ended?`发送处理已结束${c.CONFIRMED?` · 已确认 ${c.CONFIRMED} 条`:""}${c.FAILED?` · ${c.FAILED} 条失败`:c.SIMULATED_SUCCESS?' · 含模拟结果':''}`:!sendEnabled?'发送关闭 · 未执行':reviewPending?'等待匹配处理':total(r)>0&&!s.matches&&!reviewFailed&&!reviewOther?'无匹配对象 · 未发送':'暂无本轮发送任务';
 const settled=ended&&!reviewPending&&!reviewFailed&&!reviewOther;
 const conclusion=unknown||other?'本轮仍有结果待核查，不标记完成；未知发送保留额度与去重锁。':pending?'本轮仍有待处理发送，请查看账号、额度或执行状态。':settled?'本轮发送处理已结束，不等待对方回复。失败、取消、跳过与模拟结果仍按实际记录展示。':reviewPending||reviewFailed||reviewOther?'本轮匹配尚有待处理或异常，请查看匹配记录。':!sendEnabled?'自动回复关闭，本轮未继续发送；这不代表三步全部成功。':total(r)>0&&!s.matches?'本轮没有匹配对象，未产生发送；后续跟进独立处理。':'本轮暂无发送任务，不据此推断自动化已全部完成。';
 return {review,contact,conclusion,settled};
}
