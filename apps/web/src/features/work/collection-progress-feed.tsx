import {useEffect,useRef,useState} from 'react';
import {Activity,Check,FileText} from 'lucide-react';
import {Button} from '@/components/ui/button';
import {ErrorNotice} from '@/components/feedback';
import {useConfig,useRefreshCollection} from '@/features/collection/use-collection';
import {useArchivePage} from '@/features/collection/archive-data';
import {shouldRefreshRun} from '@/features/collection/mode';
import {RunStats} from '@/features/collection/run-stats';
import {reasonLabels,runLabels,type Config} from '@/features/collection/types';
import {mergeProgress,progressMessages,runFinished,type ProgressMessage} from './collection-progress';
import {useAuroraReduced} from './aurora-motion';
export function CollectionProgressFeed({config}:{config:Config}){
 const refresh=useRefreshCollection();
 const detail=useConfig(config.id),archive=useArchivePage(config.id,0,shouldRefreshRun(config,Date.now()));
 const [history,setHistory]=useState(''),[messages,setMessages]=useState<Record<string,ProgressMessage[]>>({});
 const runs=[...new Map([...(detail.data?.runs||[]),...config.runs].map(r=>[r.id,r])).values()].sort((a,b)=>Date.parse(b.createdAt)-Date.parse(a.createdAt));
 const run=runs.find(r=>r.id===(history||config.activeRunId))||runs[0];
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
  <div className="task-feed-heading"><span>{history?'历史任务':'任务进展'}{run&&<strong className="task-state" data-warning={!['QUEUED','RUNNING','COMPLETE'].includes(run.status)}>{runLabels[run.status]||'状态待确认'}</strong>}</span><small>仅显示已返回信息</small></div>
  {run&&runFinished(run)&&run.status!=='COMPLETE'&&<p className="task-outcome" role="status">{reasonLabels[run.reason||'']||run.reason||'停止原因未返回，请查看详情'}</p>}
  <ErrorNotice error={archive.error||detail.error}/>
  <div className="task-message-stream" ref={viewport} role="log" aria-label="采集进度消息" aria-live="polite" aria-relevant="additions text" tabIndex={0} onScroll={()=>{const el=viewport.current;if(el){follow.current=el.scrollHeight-el.scrollTop-el.clientHeight<64;if(follow.current)setUnseen(false);}}}>
   {run?rows.map(m=><article key={m.id} data-event-id={m.id} data-warning={m.warning} className="task-message"><span className="task-message-icon">{m.kind==='post'?<FileText size={16}/>:m.kind==='count'?<Check size={16}/>:<Activity size={16}/>}</span><div><p>{m.title}</p>{m.detail&&<small>{m.detail}</small>}</div></article>):<div className="task-feed-empty"><Activity size={24}/><h2>准备好了就开始</h2><p>采集返回的帖子和评论会显示在这里。</p></div>}
  </div>
  {unseen&&<Button variant="ghost" onClick={()=>{follow.current=true;setUnseen(false);const el=viewport.current;el?.scrollTo({top:el.scrollHeight,behavior:reduced?'instant':'smooth'});}}>回到最新进度</Button>}
  {run&&<details className="task-details"><summary>运行详情与历史</summary><Button variant="ghost" onClick={()=>void refresh()}>刷新进度</Button><p>本轮：{new Date(run.createdAt).toLocaleString()} · {runLabels[run.status]||run.status}</p><RunStats run={run}/><p>{reasonLabels[run.reason||'']||run.reason}</p><p>自动刷新有时限，可手动刷新进度。没有逐帖实时游标，只显示已归档帖子（最近 20 个版本）。部分或未知覆盖不代表全部完成；停止保留原文，尚不支持精准断点续采。</p><div className="task-history">{runs.map(r=><button key={r.id} aria-pressed={history===r.id} onClick={()=>setHistory(r.id)}>{new Date(r.createdAt).toLocaleString()} · {runLabels[r.status]||r.status}</button>)}{history&&<Button variant="ghost" onClick={()=>setHistory('')}>返回当前任务</Button>}</div></details>}
 </section>;
}
