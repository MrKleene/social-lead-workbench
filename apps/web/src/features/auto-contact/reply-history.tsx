import {DmHistoryVerification} from './dm-history-verification';
import {useRef,useState} from 'react';
import {Pager} from '@/components/pager';
import {Alert,AlertDescription} from '@/components/ui/alert';
import {FormField} from '@/components/form-field';
import {SelectField,SelectOption} from '@/components/select-field';
import type {ReplyHistoryItem} from '@crm/contracts';
import {Button} from '@/components/ui/button';
import {Sheet,SheetContent,SheetHeader,SheetTitle,SheetDescription,SheetFooter} from '@/components/ui/sheet';
import {ErrorNotice,Loading} from '@/components/feedback';
import {useReplyHistory} from './use-reply-history';
import {ReplyHistoryTable,ReplyHistoryDetail} from './reply-history-content';
import './graphite-reply-history.css';

export function ReplyHistory({enabled}:{enabled:boolean}) {
 const s=useReplyHistory(enabled),d=s.query.data;
 const [selected,setSelected]=useState<ReplyHistoryItem|null>(null);
 const returnFocus=useRef<HTMLElement|null>(null),heading=useRef<HTMLHeadingElement>(null);
 const detail=d?.items.find(item=>item.id===selected?.id)??selected;
 const open=(item:ReplyHistoryItem)=>{returnFocus.current=document.activeElement as HTMLElement;setSelected(item);};
 return <section id="reply-history" className="contact-panel reply-history graphite-reply-history" aria-labelledby="reply-history-title">
  <div className="reply-history-toolbar">
   <div><h2 id="reply-history-title" ref={heading} tabIndex={-1}>发送结果</h2><p>{d?`${d.mode==='REAL'?'真实发送':'模拟记录'}累计 ${d.allTotal} 次尝试 · 平台已确认 ${d.confirmedTotal} 条`:s.query.isError?'历史统计读取失败':'正在读取历史统计'}</p></div>
   <div className="reply-history-controls"><FormField>历史结果<SelectField aria-label="回复历史结果" value={s.outcome} onValueChange={value=>s.filter(value)}><SelectOption value="">全部结果</SelectOption><SelectOption value="CONFIRMED">回复成功</SelectOption><SelectOption value="NOT_ATTEMPTED">未发送（有明确证据）</SelectOption><SelectOption value="FAILED">全部历史失败</SelectOption><SelectOption value="UNKNOWN">结果未知</SelectOption><SelectOption value="RESERVED">已预占</SelectOption><SelectOption value="ATTEMPTED">执行中</SelectOption><SelectOption value="CANCELLED">已取消</SelectOption><SelectOption value="SIMULATED_SUCCESS">模拟完成</SelectOption></SelectField></FormField>{s.query.isError&&<Button variant="outline" onClick={()=>void s.query.refetch()} disabled={s.query.isFetching}>重试读取</Button>}</div>
  </div>
  <ErrorNotice error={s.query.error}/>{s.query.isError&&<Alert role="alert"><AlertDescription>历史读取失败，不能据此判断没有回复记录。{d?'下方保留上次成功读取的数据。':''}</AlertDescription></Alert>}
  {s.query.isPending?<Loading/>:d&&<>
   {d.items.length?<ReplyHistoryTable items={d.items} onOpen={open}/>:<p className="reply-history-empty" role="status">{s.outcome?'当前筛选没有记录。可切换“全部结果”查看其他历史。':'尚无发送尝试记录。'}</p>}
   <div className="reply-history-pagination"><small>符合筛选 {d.total} 条 · 第 {Math.floor(s.offset/20)+1} 页 · 每页20条</small><Pager className="action-row"><Button variant="ghost" size="content" disabled={!s.offset||s.query.isFetching} onClick={()=>s.setOffset(Math.max(0,s.offset-20))}>上一页回复历史</Button><Button variant="ghost" size="content" disabled={s.offset+20>=d.total||s.query.isFetching} onClick={()=>s.setOffset(s.offset+20)}>下一页回复历史</Button></Pager></div>
  </>}
  <Sheet open={!!detail} onOpenChange={open=>{if(!open)setSelected(null);}}><SheetContent className="reply-history-dialog" onCloseAutoFocus={event=>{event.preventDefault();if(returnFocus.current?.isConnected)returnFocus.current.focus();else heading.current?.focus();}}><SheetHeader><SheetTitle>回复记录详情</SheetTitle><SheetDescription className="sr-only">保存的原文、发送结果与执行证据</SheetDescription></SheetHeader>{detail&&<><ReplyHistoryDetail item={detail}/><DmHistoryVerification key={detail.id} item={detail}/></>}<SheetFooter><Button variant="outline" onClick={()=>setSelected(null)}>关闭</Button></SheetFooter></SheetContent></Sheet>
 </section>;
}
