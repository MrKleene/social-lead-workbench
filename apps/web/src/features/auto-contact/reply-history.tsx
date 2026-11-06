import {RefreshCw,ArrowLeftRight} from 'lucide-react';
import {Empty,EmptyHeader,EmptyTitle,EmptyDescription,EmptyContent} from '@/components/ui/empty';
import {ResultPagination} from '@/components/result-pagination';
import {DmHistoryVerification} from './dm-history-verification';
import {useRef,useState} from 'react';
import {Alert,AlertDescription} from '@/components/ui/alert';
import {Field,FieldLabel} from '@/components/ui/field';
import {SelectField,SelectOption} from '@/components/select-field';
import type {ReplyHistoryItem} from '@crm/contracts';
import {Button} from '@/components/ui/button';
import {Sheet,SheetContent,SheetHeader,SheetTitle,SheetDescription,SheetFooter} from '@/components/ui/sheet';
import {ErrorNotice,Loading} from '@/components/feedback';
import {useReplyHistory} from './use-reply-history';
import {ReplyHistoryDetail} from './reply-history-content';
import {ReplyHistoryTable} from './reply-history-table';
import './graphite-reply-history.css';

export function ReplyHistory({enabled}:{enabled:boolean}) {
 const s=useReplyHistory(enabled),d=s.query.data;
 const [selected,setSelected]=useState<ReplyHistoryItem|null>(null);
 const returnFocus=useRef<HTMLElement|null>(null),heading=useRef<HTMLHeadingElement>(null);
 const detail=d?.items.find(item=>item.id===selected?.id)??selected;
 const open=(item:ReplyHistoryItem)=>{returnFocus.current=document.activeElement as HTMLElement;setSelected(item);};
 return <section id="reply-history" className="reply-history graphite-reply-history" aria-labelledby="reply-history-title">
  <div className="reply-history-summary"><h2 id="reply-history-title" ref={heading} tabIndex={-1} className="sr-only">发送结果</h2><p>{d?`当前可见${d.mode==='REAL'?'真实发送':'模拟记录'} ${d.allTotal} 次尝试，平台已确认 ${d.confirmedTotal} 条。`:s.query.isError?'历史统计读取失败':'正在读取历史统计…'}</p></div>
  <div className="reply-history-toolbar">
   <div className="reply-history-controls"><Field className="reply-history-filter"><FieldLabel htmlFor="reply-history-outcome">发送结果</FieldLabel><SelectField id="reply-history-outcome" aria-label="回复历史结果" value={s.outcome} onValueChange={value=>s.filter(value)}><SelectOption value="">全部结果</SelectOption><SelectOption value="CONFIRMED">回复成功</SelectOption><SelectOption value="NOT_ATTEMPTED">未发送（有明确证据）</SelectOption><SelectOption value="FAILED">全部历史失败</SelectOption><SelectOption value="UNKNOWN">结果未知</SelectOption><SelectOption value="RESERVED">已预占</SelectOption><SelectOption value="ATTEMPTED">执行中</SelectOption><SelectOption value="CANCELLED">已取消</SelectOption><SelectOption value="SIMULATED_SUCCESS">模拟完成</SelectOption></SelectField></Field>{s.outcome&&<Button variant="ghost" size="sm" onClick={()=>s.filter('')}>清除筛选</Button>}</div>
   <Button variant="outline" size="sm" onClick={()=>void s.query.refetch()} disabled={s.query.isFetching}><RefreshCw data-icon="inline-start"/>{s.query.isFetching?'刷新中…':s.query.isError?'重试读取':'刷新'}</Button>
  </div>
  <ErrorNotice error={s.query.error}/>{s.query.isError&&<Alert role="alert"><AlertDescription>历史读取失败，不能据此判断没有回复记录。{d?'下方保留上次成功读取的数据。':''}</AlertDescription></Alert>}
  {s.query.isPending?<Loading/>:d&&<>
   {d.items.length?<><p className="reply-history-scroll-hint"><ArrowLeftRight aria-hidden="true"/>左右滑动查看完整表格</p><ReplyHistoryTable items={d.items} onOpen={open}/></>:<Empty className="reply-history-empty" role="status"><EmptyHeader><EmptyTitle>{s.outcome?'没有符合筛选的记录':'暂无回复记录'}</EmptyTitle><EmptyDescription>{s.outcome?'尝试清除筛选，查看其他发送结果。':'发送尝试的结果与原文会显示在这里。'}</EmptyDescription></EmptyHeader>{s.outcome&&<EmptyContent><Button variant="outline" size="sm" onClick={()=>s.filter('')}>查看全部结果</Button></EmptyContent>}</Empty>}
   <ResultPagination total={d.total} offset={s.offset} pending={s.query.isFetching} onChange={s.setOffset} label="回复记录分页"/>
  </>}
  <Sheet open={!!detail} onOpenChange={open=>{if(!open)setSelected(null);}}><SheetContent className="reply-history-dialog" onCloseAutoFocus={event=>{event.preventDefault();if(returnFocus.current?.isConnected)returnFocus.current.focus();else heading.current?.focus();}}><SheetHeader><SheetTitle>回复记录详情</SheetTitle><SheetDescription className="sr-only">保存的原文、发送结果与执行证据</SheetDescription></SheetHeader>{detail&&<><ReplyHistoryDetail item={detail}/><DmHistoryVerification key={detail.id} item={detail}/></>}<SheetFooter><Button variant="outline" onClick={()=>setSelected(null)}>关闭</Button></SheetFooter></SheetContent></Sheet>
 </section>;
}
