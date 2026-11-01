import { Alert, AlertDescription } from '@/components/ui/alert';

import {InfoDrawer} from '@/components/information-panel';
import {collectionOutcome} from '../collection/collection-outcome';
import {TaskRunSummary} from './task-run-summary';
import {RunPostStream} from './run-post-stream';
import {useEffect,useRef,useState} from 'react';
import {History,ArrowLeft} from 'lucide-react';
import {Button} from '@/components/ui/button';
import {Sheet,SheetContent,SheetHeader,SheetTitle,SheetDescription,SheetTrigger} from '@/components/ui/sheet';
import {RunStats} from '@/features/collection/run-stats';
import {type Run} from '@/features/collection/types';
import {collectionTaskHeadline,collectionTaskSummary,savedCollectionCounts} from './collection-task-summary';
export function CollectionProgressFeed({configId,run,runs,pending,error,visible,onRefresh,onSelectRun}:{configId:string;run:Run|undefined;runs:Run[];pending:boolean;error:unknown;visible:boolean;onRefresh:()=>void;onSelectRun?:(id:string)=>void}){
 const [open,setOpen]=useState(false),[selected,setSelected]=useState('');
 const lastSelection=useRef(''),detailHeading=useRef<HTMLHeadingElement>(null),returnFocus=useRef<HTMLButtonElement|null>(null),detailButton=useRef<HTMLButtonElement>(null);
 const historyButton=useRef<HTMLButtonElement>(null),selectedButton=useRef<HTMLButtonElement|null>(null);
 const record=runs.find(r=>r.id===selected)||(run?.id===selected?run:undefined);
 useEffect(()=>{if(!visible)setOpen(false);},[visible]);
 useEffect(()=>{if(open&&selected){const frame=requestAnimationFrame(()=>detailHeading.current?.focus());return()=>cancelAnimationFrame(frame);}},[open,selected]);
 const showDetails=()=>{returnFocus.current=detailButton.current;setSelected(run?.id||'');setOpen(true);};
 return <section className="task-progress" aria-label="采集进度">
  <div className="task-feed-heading"><h2>{run?'采集结果':'采集任务'}</h2><Sheet open={open} onOpenChange={value=>{setOpen(value);if(!value)setSelected('');}}><SheetTrigger asChild><Button ref={historyButton} variant="ghost" onClick={()=>{returnFocus.current=historyButton.current;setSelected('');}}><History size={16}/>运行历史</Button></SheetTrigger>
   <SheetContent className="task-settings-sheet task-history-sheet" onCloseAutoFocus={e=>{e.preventDefault();returnFocus.current?.focus();}}><SheetHeader><SheetTitle>{selected?'任务详情':'运行历史'}</SheetTitle><SheetDescription className={selected?'sr-only':undefined}>{selected?'已保存的任务详情':'最近 20 条记录'}</SheetDescription></SheetHeader>
    <div className="task-settings-body">
     {selected?<><Button variant="ghost" size="content" onClick={()=>{setSelected('');requestAnimationFrame(()=>selectedButton.current?.focus());}}><ArrowLeft size={16}/>返回历史列表</Button>{record?<article className="task-record-detail"><time dateTime={record.createdAt}>{new Date(record.createdAt).toLocaleString()}</time><h3 ref={detailHeading} tabIndex={-1}>{record.snapshot?.name||'采集任务'} · {collectionOutcome(record).label}</h3><p className="task-result-summary" data-warning={collectionOutcome(record).warning}>{collectionTaskSummary(record)}</p>{onSelectRun&&<Button variant="outline" onClick={()=>{onSelectRun(record.id);setOpen(false);}}>在步骤中查看此任务</Button>}<RunPostStream key={record.id} configId={configId} run={record} visible={visible&&open}/><InfoDrawer className="task-details" title={<>诊断与运行详情</>}><RunStats run={record}/></InfoDrawer></article>:<p role="status">这条记录尚未返回，请刷新。</p>}</>:<div className="task-history-list">{runs.length?runs.map(r=><Button variant="ghost" size="content" key={r.id} ref={node=>{if(r.id===lastSelection.current)selectedButton.current=node;}} data-history-run={r.id} onClick={event=>{lastSelection.current=r.id;selectedButton.current=event.currentTarget;setSelected(r.id);}}><span className="task-history-row-head"><time dateTime={r.createdAt}>{new Date(r.createdAt).toLocaleString()}</time><strong>{collectionOutcome(r).label}</strong></span><span>{r.snapshot?.name||'采集任务'}{r.snapshot?.keywords?.length?` · ${r.snapshot.keywords.join(' / ')}`:''}</span><small>{savedCollectionCounts(r)}</small></Button>):<p>暂无运行历史</p>}</div>}
     {!!error&&<Alert role="alert"><AlertDescription>历史读取失败，已有记录可能不是最新状态。</AlertDescription></Alert>}<Button variant="outline" onClick={onRefresh}>刷新记录</Button>
    </div>
   </SheetContent>
  </Sheet></div>
  <div className="mist-task-grid"><div className="mist-task-timeline mist-panel"><div className="mist-timeline-heading"><h2 className="mist-timeline-title">{run?'本轮帖子':'尚未开始'}</h2>{run&&!error&&!pending&&<Button ref={detailButton} variant="ghost" onClick={showDetails}>采集详情</Button>}</div>{error||pending?<div className="task-feed-empty"><h2>{error?'任务状态读取失败':'正在获取任务记录…'}</h2><Button variant="outline" onClick={onRefresh}>重新读取</Button></div>:run?<div className="task-current-result"><p className="task-result-summary" role="status" aria-live="polite" data-run-id={run.id} data-warning={collectionOutcome(run).warning}>{collectionTaskHeadline(run)}</p><RunPostStream key={run.id} configId={configId} run={run} visible={visible&&!open} compact/></div>:<div className="task-feed-empty"><p>开始后，采集结果会显示在这里。</p></div>}</div><TaskRunSummary configId={configId} run={run}/></div>
 </section>;
}
