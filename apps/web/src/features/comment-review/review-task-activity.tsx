import {Progress} from '@/components/ui/progress';
import {reviewActivityJobs} from './review-scope';
import './graphite-comment-review.css';
import {Table,TableBody,TableRow,TableCell,TableHeader,TableHead} from '@/components/ui/table';
import {Badge} from '@/components/ui/badge';
import {displayReviewFailure} from '@crm/contracts';
import {useRef,useState} from 'react';
import type {ManualReviewTask,ReviewOverview} from '@crm/contracts';
import {Button} from '@/components/ui/button';
import {Sheet,SheetContent,SheetHeader,SheetTitle,SheetDescription} from '@/components/ui/sheet';
import {ErrorNotice} from '@/components/feedback';
import type {useManualPost} from './use-manual-post';
import type {SavedReviewPost} from './post-picker';
const labels:Record<string,string>={PENDING:'等待处理',PROCESSING:'处理中',COMPLETED:'处理结束',FAILED:'处理失败',CANCELLED:'已取消',INVALIDATED:'确认已失效',SKIPPED:'未送审'};
const active=(j:ManualReviewTask)=>['PENDING','PROCESSING'].includes(j.status);
export function ReviewJobSummary({job:j}:{job:ManualReviewTask}){
 const counts=[['已评分',j.success,'已保存有效评分'],['待处理',j.pending,'尚待处理的评论'],['未获评分',j.failed,'需重新选择帖子并确认后才会再次调用'],['未重复发送',j.skipped,'已完成、已人工处理、正在处理或重复内容']];
 return <><div className="graphite-job-heading"><h3>{j.title}</h3><Badge variant="secondary" className="graphite-review-status">{labels[j.status]||j.status}</Badge></div><dl className="graphite-job-facts"><dt>类型</dt><dd>手动测试</dd><dt>审核目标</dt><dd>{j.target||'未记录'}</dd><dt>目标版本</dt><dd>{j.policyRevision??'未记录'}</dd><dt>模型</dt><dd>{j.model||'未记录'}</dd></dl><div className="graphite-job-progress"><span>已评分 <strong>{j.success}</strong> / {j.total}</span><Progress aria-label="已获得有效评分的评论" aria-valuetext={`${j.success} / ${j.total} 条`} value={Math.min(100,Math.max(0,j.success/Math.max(1,j.total)*100))}/></div><Table className="graphite-job-counts" aria-label="作业评论状态"><TableHeader><TableRow><TableHead>状态</TableHead><TableHead>数量</TableHead><TableHead>说明</TableHead></TableRow></TableHeader><TableBody>{counts.map(([label,count,note])=><TableRow key={label}><TableCell>{label}</TableCell><TableCell>{count}</TableCell><TableCell>{note}</TableCell></TableRow>)}</TableBody></Table>{j.reason&&<p className="review-job-reason" role="status">{displayReviewFailure(j.reason)}</p>}</>;
}
export function ReviewTaskActivity({state:s,overview,onResults,scoped=false}:{scoped?:boolean;state:ReturnType<typeof useManualPost>;overview:ReviewOverview;onResults:(p:SavedReviewPost)=>void}){
 const [open,setOpen]=useState(false),trigger=useRef<HTMLButtonElement>(null),jobs=reviewActivityJobs(s.jobs.data||[],scoped),latest=jobs.find(active)||jobs.find(j=>j.id===s.lastJobId)||jobs[0];
 const view=(j:ManualReviewTask)=>{onResults({id:j.postId,title:j.title,comments:j.total,coverage:j.coverage});setOpen(false);};
 return <><ErrorNotice error={s.jobs.error||s.cancel.error}/>{(latest||overview.autoJobs.length>0)&&<section className="review-activity" aria-label="审核任务进度"><div><strong>{scoped&&latest?'全局手动测试 · ':''}{latest?labels[latest.status]||latest.status:'自动识别任务'}</strong>{latest&&<span>已完成 {latest.success} · 待处理 {latest.pending+latest.failed}</span>}</div><div className="review-activity-actions">{latest&&!active(latest)&&<Button size="sm" variant="ghost" onClick={()=>view(latest)}>{latest.status==='COMPLETED'?'查看结果':'查看记录'}</Button>}<Button ref={trigger} size="sm" variant="ghost" onClick={()=>setOpen(true)}>任务记录</Button></div></section>}<Sheet open={open} onOpenChange={setOpen}><SheetContent className="task-settings-sheet review-task-sheet graphite-review-jobs-dialog" onCloseAutoFocus={e=>{e.preventDefault();trigger.current?.focus();}}><SheetHeader><SheetTitle>审核任务记录</SheetTitle><SheetDescription>处理结束不等于全部获得评分。取消只能阻止尚未开始的调用。</SheetDescription></SheetHeader><div className="task-settings-body"><ErrorNotice error={s.cancel.error}/>{jobs.map(j=><article className="review-job" key={j.id}><ReviewJobSummary job={j}/><div className="action-row"><Button variant="outline" onClick={()=>view(j)}>查看该帖记录</Button>{active(j)&&<Button variant="ghost" size="content" disabled={s.cancel.isPending} onClick={()=>s.cancel.mutate(j.id)}>取消剩余处理</Button>}</div></article>)}{overview.autoJobs.map(j=><article className="review-job graphite-job-auto" key={j.id}><div className="graphite-job-heading"><h3>{j.title}</h3><Badge variant="secondary">{labels[j.status]||j.status}</Badge></div><dl className="graphite-job-facts"><dt>类型</dt><dd>自动识别</dd><dt>已评估</dt><dd>{j.processed} 条</dd></dl>{j.reason&&<p className="review-job-reason">{displayReviewFailure(j.reason)}</p>}</article>)}</div></SheetContent></Sheet></>;
}
