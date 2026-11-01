import {InfoDrawer} from '@/components/information-panel';
import {collectionOutcome} from '../collection/collection-outcome';
import {TaskRunSummary} from './task-run-summary';
import {RunPostStream} from './run-post-stream';
import {useEffect,useRef,useState} from 'react';
import {Button} from '@/components/ui/button';
import {Sheet,SheetContent,SheetHeader,SheetTitle,SheetDescription} from '@/components/ui/sheet';
import {RunStats} from '@/features/collection/run-stats';
import type {Run} from '@/features/collection/types';
import {collectionTaskHeadline,collectionTaskSummary} from './collection-task-summary';
export function CollectionProgressFeed({configId,run,pending,error,visible,onRefresh}:{configId:string;run:Run|undefined;pending:boolean;error:unknown;visible:boolean;onRefresh:()=>void}){
 const [open,setOpen]=useState(false),detailButton=useRef<HTMLButtonElement>(null);
 useEffect(()=>{setOpen(false);},[visible,run?.id]);
 return <section className="task-progress" aria-label="采集进度">
  <div className="task-feed-heading"><h2>{run?'采集结果':'采集任务'}</h2></div>
  <Sheet open={open} onOpenChange={setOpen}><SheetContent className="task-settings-sheet task-history-sheet" onCloseAutoFocus={e=>{e.preventDefault();detailButton.current?.focus();}}><SheetHeader><SheetTitle>采集详情</SheetTitle><SheetDescription className="sr-only">已保存的本轮任务详情</SheetDescription></SheetHeader><div className="task-settings-body">{run&&<article className="task-record-detail"><time dateTime={run.createdAt}>{new Date(run.createdAt).toLocaleString()}</time><h3>{run.snapshot?.name||'采集任务'} · {collectionOutcome(run).label}</h3><p className="task-result-summary" data-warning={collectionOutcome(run).warning}>{collectionTaskSummary(run)}</p><RunPostStream key={run.id} configId={configId} run={run} visible={visible&&open}/><InfoDrawer className="task-details" title={<>诊断与运行详情</>}><RunStats run={run}/></InfoDrawer></article>}</div></SheetContent></Sheet>
  <div className="mist-task-grid"><div className="mist-task-timeline mist-panel"><div className="mist-timeline-heading"><h2 className="mist-timeline-title">{run?'本轮帖子':'尚未开始'}</h2>{run&&!error&&!pending&&<Button ref={detailButton} variant="ghost" onClick={()=>setOpen(true)}>采集详情</Button>}</div>{error||pending?<div className="task-feed-empty"><h2>{error?'任务状态读取失败':'正在获取任务记录…'}</h2><Button variant="outline" onClick={onRefresh}>重新读取</Button></div>:run?<div className="task-current-result"><p className="task-result-summary" role="status" aria-live="polite" data-run-id={run.id} data-warning={collectionOutcome(run).warning}>{collectionTaskHeadline(run)}</p><RunPostStream key={run.id} configId={configId} run={run} visible={visible&&!open} compact/></div>:<div className="task-feed-empty"><p>开始后，采集结果会显示在这里。</p></div>}</div><TaskRunSummary configId={configId} run={run}/></div>
 </section>;
}
