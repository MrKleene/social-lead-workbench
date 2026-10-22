import {useEffect,useRef,useState} from 'react';
import {History,ArrowLeft} from 'lucide-react';
import {Button} from '@/components/ui/button';
import {Sheet,SheetContent,SheetHeader,SheetTitle,SheetDescription,SheetTrigger} from '@/components/ui/sheet';
import {RunStats} from '@/features/collection/run-stats';
import {runLabels,type Run} from '@/features/collection/types';
import {collectionTaskSummary,savedCollectionCounts} from './collection-task-summary';
export function CollectionProgressFeed({run,runs,pending,error,visible,onRefresh}:{run:Run|undefined;runs:Run[];pending:boolean;error:unknown;visible:boolean;onRefresh:()=>void}){
 const [open,setOpen]=useState(false),[selected,setSelected]=useState('');
 const lastSelection=useRef(''),detailHeading=useRef<HTMLHeadingElement>(null),returnFocus=useRef<HTMLButtonElement|null>(null),detailButton=useRef<HTMLButtonElement>(null);
 const historyButton=useRef<HTMLButtonElement>(null),selectedButton=useRef<HTMLButtonElement|null>(null);
 const record=runs.find(r=>r.id===selected)||(run?.id===selected?run:undefined);
 useEffect(()=>{if(!visible)setOpen(false);},[visible]);
 useEffect(()=>{if(open&&selected){const frame=requestAnimationFrame(()=>detailHeading.current?.focus());return()=>cancelAnimationFrame(frame);}},[open,selected]);
 const showDetails=()=>{returnFocus.current=detailButton.current;setSelected(run?.id||'');setOpen(true);};
 return <section className="task-progress" aria-label="采集进度">
  <div className="task-feed-heading"><span>当前任务</span><Sheet open={open} onOpenChange={value=>{setOpen(value);if(!value)setSelected('');}}><SheetTrigger asChild><Button ref={historyButton} variant="ghost" onClick={()=>{returnFocus.current=historyButton.current;setSelected('');}}><History size={16}/>运行历史</Button></SheetTrigger>
   <SheetContent className="task-settings-sheet task-history-sheet" onCloseAutoFocus={e=>{e.preventDefault();returnFocus.current?.focus();}}><SheetHeader><SheetTitle>{selected?'任务详情':'运行历史'}</SheetTitle><SheetDescription>{selected?'历史与当前任务独立显示。':'当前关键词组的最近 20 条记录。'}</SheetDescription></SheetHeader>
    <div className="task-settings-body">
     {selected?<><Button variant="ghost" onClick={()=>{setSelected('');requestAnimationFrame(()=>selectedButton.current?.focus());}}><ArrowLeft size={16}/>返回历史列表</Button>{record?<article className="task-record-detail"><time dateTime={record.createdAt}>{new Date(record.createdAt).toLocaleString()}</time><h3 ref={detailHeading} tabIndex={-1}>{record.snapshot?.name||'采集任务'} · {runLabels[record.status]||'状态待确认'}</h3><p className="task-result-summary" data-warning={!['COMPLETE','QUEUED','RUNNING'].includes(record.status)}>{collectionTaskSummary(record)}</p><details className="task-details"><summary>诊断与运行详情</summary><RunStats run={record}/></details></article>:<p role="status">这条记录尚未返回，请刷新。</p>}</>:<div className="task-history-list">{runs.length?runs.map(r=><button key={r.id} ref={node=>{if(r.id===lastSelection.current)selectedButton.current=node;}} data-history-run={r.id} onClick={event=>{lastSelection.current=r.id;selectedButton.current=event.currentTarget;setSelected(r.id);}}><span className="task-history-row-head"><time dateTime={r.createdAt}>{new Date(r.createdAt).toLocaleString()}</time><strong>{runLabels[r.status]||'状态待确认'}</strong></span><span>{r.snapshot?.name||'采集任务'}{r.snapshot?.keywords?.length?` · ${r.snapshot.keywords.join(' / ')}`:''}</span><small>{savedCollectionCounts(r)}</small></button>):<p>暂无运行历史</p>}</div>}
     {!!error&&<p role="alert">历史读取失败，已有记录可能不是最新状态。</p>}<Button variant="outline" onClick={onRefresh}>刷新记录</Button>
    </div>
   </SheetContent>
  </Sheet></div>
  {error||pending?<div className="task-feed-empty"><h2>{error?'任务状态读取失败':'正在获取任务记录…'}</h2><Button variant="outline" onClick={onRefresh}>重新读取</Button></div>:run?<div className="task-current-result"><p className="task-result-summary" role="status" aria-live="polite" data-run-id={run.id} data-warning={!['COMPLETE','QUEUED','RUNNING'].includes(run.status)}>{collectionTaskSummary(run)}</p><Button ref={detailButton} variant="ghost" onClick={showDetails}>查看运行详情</Button></div>:<div className="task-feed-empty"><h2>尚未开始</h2><p>准备好后开始采集。</p></div>}
 </section>;
}
