import {useEffect,useRef,useState} from 'react';
import {Activity,Check,FileText} from 'lucide-react';
import {Button} from '@/components/ui/button';
import {ErrorNotice} from '@/components/feedback';
import {useArchivePage} from '@/features/collection/archive-data';
import {RunStats} from '@/features/collection/run-stats';
import {reasonLabels,runLabels,type Config,type Run} from '@/features/collection/types';
import {mergeProgress,progressMessages,runFinished,type ProgressMessage} from './collection-progress';
import {useAuroraReduced} from './aurora-motion';
export function CollectionProgressFeed({config,run,runs,history,pending,error,onHistory,onCurrent,onRefresh}:{config:Config;run:Run|undefined;runs:Run[];history:boolean;pending:boolean;error:unknown;onHistory:(id:string)=>void;onCurrent:()=>void;onRefresh:()=>void}){
 const historyRuns=runs.filter(runFinished);
 const archive=useArchivePage(run?config.id:undefined,0,!!run&&['QUEUED','RUNNING'].includes(run.status));
 const [messages,setMessages]=useState<Record<string,ProgressMessage[]>>({});
 const next=run?progressMessages(run,archive.data?.posts||[]):[];
 const signature=JSON.stringify(next);
 useEffect(()=>{if(run)setMessages(old=>{const merged=mergeProgress(old[run.id]||[],next);return old[run.id]===merged?old:{...old,[run.id]:merged};});},[run?.id,signature]);
 useEffect(()=>{if(run)void archive.refetch();},[run?.id,run?.status]);
 const rows=run?messages[run.id]||next:[];
 const reduced=useAuroraReduced(),viewport=useRef<HTMLDivElement>(null),follow=useRef(true),lastRun=useRef<string|undefined>(undefined),[unseen,setUnseen]=useState(false);
 const rowSignature=JSON.stringify(rows);
 useEffect(()=>{
  if(lastRun.current!==run?.id){lastRun.current=run?.id;follow.current=true;setUnseen(false);viewport.current?.scrollTo({top:0,behavior:'instant'});return;}
  if(run&&runFinished(run))return;
  if(!follow.current){setUnseen(true);return;}
  const frame=requestAnimationFrame(()=>{const el=viewport.current;el?.scrollTo({top:el.scrollHeight,behavior:reduced?'instant':'smooth'});});
  return()=>cancelAnimationFrame(frame);
 },[rowSignature,run?.id,reduced]);
 return <section className="task-progress" aria-label="采集进度">
  <div className="task-feed-heading"><span>{history?'历史任务':run?'任务进展':'当前任务'}{run&&!pending&&<strong className="task-state" data-warning={!['QUEUED','RUNNING','COMPLETE'].includes(run.status)}>{runLabels[run.status]||'状态待确认'}</strong>}</span><small>仅显示已返回信息</small></div>
  {run&&!pending&&runFinished(run)&&run.status!=='COMPLETE'&&<p className="task-outcome" role="status">{reasonLabels[run.reason||'']||run.reason||'停止原因未返回，请查看详情'}</p>}
  <ErrorNotice error={archive.error}/>
  {history&&<div className="task-history-label"><span>历史采集 · {run?new Date(run.createdAt).toLocaleString():'正在读取'}</span><Button variant="ghost" onClick={onCurrent}>{config.activeRunId?'返回当前任务':'返回采集'}</Button></div>}
  <div className="task-message-stream" ref={viewport} role="log" aria-label="采集进度消息" aria-live="polite" aria-relevant="additions text" tabIndex={0} onScroll={()=>{const el=viewport.current;if(el){follow.current=el.scrollHeight-el.scrollTop-el.clientHeight<64;if(follow.current)setUnseen(false);}}}>
   {error||pending?<div className="task-feed-empty"><h2>{error?'任务状态读取失败':'正在获取任务记录…'}</h2><Button variant="outline" onClick={onRefresh}>重新读取</Button></div>:run?rows.map(m=><article key={m.id} data-event-id={m.id} data-warning={m.warning} className="task-message"><span className="task-message-icon">{m.kind==='post'?<FileText size={16}/>:m.kind==='count'?<Check size={16}/>:<Activity size={16}/>}</span><div><p>{m.title}</p>{m.detail&&<small>{m.detail}</small>}</div></article>):<div className="task-feed-empty"><Activity size={24}/><h2>尚未开始</h2><p>采集返回的帖子和评论会显示在这里。</p></div>}
  </div>
  {unseen&&<Button variant="ghost" onClick={()=>{follow.current=true;setUnseen(false);const el=viewport.current;el?.scrollTo({top:el.scrollHeight,behavior:reduced?'instant':'smooth'});}}>回到最新进度</Button>}
  {run&&!pending&&<details className="task-details"><summary>运行详情</summary><Button variant="ghost" onClick={onRefresh}>刷新进度</Button><p>{history?'历史采集':'本轮'}：{new Date(run.createdAt).toLocaleString()} · {runLabels[run.status]||run.status}</p><RunStats run={run}/><p>{reasonLabels[run.reason||'']||run.reason}</p><p>没有逐帖实时游标，只显示已归档帖子（最近 20 个版本）。部分或未知覆盖不代表全部完成；停止保留原文，尚不支持精准断点续采。</p></details>}
  {!!historyRuns.length&&<details className="task-details"><summary>{run?'运行历史':'上次采集'} · {new Date(historyRuns[0].createdAt).toLocaleString()} · {runLabels[historyRuns[0].status]||historyRuns[0].status}</summary><div className="task-history">{historyRuns.map(r=><button key={r.id} data-history-run={r.id} aria-pressed={history&&run?.id===r.id} onClick={()=>onHistory(r.id)}>{new Date(r.createdAt).toLocaleString()} · {runLabels[r.status]||r.status}</button>)}</div></details>}

 </section>;
}
