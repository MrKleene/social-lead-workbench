import './run-history.css';
import {ListEmpty} from '@/components/list-empty';
import {useRef,useState} from 'react';
import {History} from 'lucide-react';
import {Button} from '@/components/ui/button';
import {Sheet,SheetContent,SheetHeader,SheetTitle,SheetDescription,SheetTrigger} from '@/components/ui/sheet';
import {ErrorNotice,Loading} from '@/components/feedback';
import {collectionOutcome} from '@/features/collection/collection-outcome';
import {savedCollectionCounts} from './collection-task-summary';
import {useRunHistory} from './use-run-history';
export function RunHistoryDialog({configId,selectedId,onSelect}:{configId?:string;selectedId?:string;onSelect:(id:string)=>void}){
 const trigger=useRef<HTMLButtonElement>(null);
 const [open,setOpen]=useState(false),[cursors,setCursors]=useState<string[]>(['']);
 const q=useRunHistory(configId,'',cursors.at(-1)||'',open);
 return <Sheet open={open} onOpenChange={value=>{setOpen(value);if(value)setCursors(['']);}}><SheetTrigger asChild><Button ref={trigger} variant="ghost" size="sm" disabled={!configId}><History data-icon="inline-start"/>运行历史</Button></SheetTrigger>
 <SheetContent className="task-settings-sheet task-history-sheet" onCloseAutoFocus={e=>{e.preventDefault();trigger.current?.focus({preventScroll:true});}}><SheetHeader><SheetTitle>运行历史</SheetTitle><SheetDescription className="sr-only">按轮次查看采集、评论匹配与回复记录，不执行任务。</SheetDescription></SheetHeader><div className="task-settings-body">
 <ErrorNotice error={q.error}/>{q.isPending?<Loading/>:q.isError?null:<div className="task-history-list">{q.data?.items.map(r=><Button key={r.id} variant="ghost" size="content" aria-pressed={selectedId===r.id} onClick={()=>{onSelect(r.id);setOpen(false);}}><span className="task-history-row-head"><time dateTime={r.createdAt}>{new Date(r.createdAt).toLocaleString()}</time><strong>{collectionOutcome(r).label}</strong></span><span>{r.snapshot?.name||'采集任务'}</span><small>{savedCollectionCounts(r)}</small></Button>)}{!q.isError&&!q.data?.items.length&&<ListEmpty title="暂无运行历史" description="已有任务的运行记录会显示在这里。"/>}</div>}
 <div className="action-row"><Button variant="outline" disabled={cursors.length===1||q.isFetching} onClick={()=>setCursors(v=>v.slice(0,-1))}>较新记录</Button><Button variant="outline" disabled={!q.data?.nextCursor||q.isFetching} onClick={()=>{if(q.data?.nextCursor)setCursors(v=>[...v,q.data.nextCursor!]);}}>更早记录</Button><Button variant="outline" size="sm" disabled={q.isFetching} onClick={()=>void q.refetch()}>{q.isFetching?'读取中…':q.isError?'重新加载':'刷新记录'}</Button></div>
 </div></SheetContent></Sheet>;
}
