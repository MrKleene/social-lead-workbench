import type {ReplyHistoryItem} from '@crm/contracts';
import {Badge} from '@/components/ui/badge';
import {Button} from '@/components/ui/button';
import {Table,TableHeader,TableBody,TableRow,TableHead,TableCell,TableCaption} from '@/components/ui/table';

const labels:Record<string,string>={CONFIRMED:'回复成功',NOT_ATTEMPTED:'未发送',UNKNOWN:'结果未知',FAILED:'历史失败',RESERVED:'已预占',ATTEMPTED:'执行中',CANCELLED:'已取消',SIMULATED_SUCCESS:'模拟完成'};
const notes:Record<string,string>={CONFIRMED:'平台已确认',NOT_ATTEMPTED:'提交前停止',UNKNOWN:'保留占用 · 勿重发',FAILED:'提交情况见原因',RESERVED:'等待执行',ATTEMPTED:'待平台确认',CANCELLED:'已取消',SIMULATED_SUCCESS:'未真实发送'};
const tones:Record<string,string>={CONFIRMED:'success',UNKNOWN:'warning',FAILED:'danger',ATTEMPTED:'active'};
const channel=(item:ReplyHistoryItem)=>item.channel==='COMMENT'?'评论回复':item.channel==='DM'?'私信':'渠道未保存';
const recipient=(item:ReplyHistoryItem)=>item.recipientName??(item.recipientId?`用户 ${item.recipientId}`:'收件人未保存');
function SenderIdentity({item}:{item:ReplyHistoryItem}){return <><strong title={item.senderId??undefined}>{item.senderName??(item.senderId?`账号 · ${item.senderId.slice(-6)}`:'发送账号未记录')}</strong>{!item.senderName&&item.senderId&&<small className="reply-sender-missing">发送时昵称未记录</small>}</>;}
const planned=(item:ReplyHistoryItem)=>!item.attemptedAt&&['NOT_ATTEMPTED','RESERVED','CANCELLED'].includes(item.displayStatus);
function Outcome({item}:{item:ReplyHistoryItem}){return <Badge variant="outline" className="reply-result-badge" data-tone={tones[item.displayStatus]??'neutral'}>{labels[item.displayStatus]??'状态待核查'}</Badge>;}

export function ReplyHistoryTable({items,onOpen}:{items:ReplyHistoryItem[];onOpen:(item:ReplyHistoryItem)=>void}) {
 return <div className="reply-history-table-frame"><Table className="reply-history-table" aria-label="回复记录">
  <TableCaption className="sr-only">回复历史：接收人、发送账号与渠道、原帖评论、回复正文、结果与执行开始时间（北京时间）</TableCaption>
  <TableHeader><TableRow>
   <TableHead scope="col">收件人 / 发送账号</TableHead><TableHead scope="col">原帖与评论</TableHead><TableHead scope="col">回复内容</TableHead>
   <TableHead scope="col">结果</TableHead><TableHead scope="col">执行开始<span className="reply-time-zone">北京时间</span></TableHead><TableHead scope="col"><span className="sr-only">详情</span></TableHead>
  </TableRow></TableHeader>
  <TableBody>{items.map(item=><TableRow key={item.id} aria-label={`回复记录 ${item.id}`}>
   <TableCell className="reply-cell-identity"><div className="reply-identity-heading"><strong className="reply-text-clamp">{recipient(item)}</strong><Badge variant="outline" className="reply-identity-channel">{channel(item)}</Badge></div><div className="reply-identity-sender"><span>发送：</span><SenderIdentity item={item}/></div></TableCell>
   <TableCell className="reply-cell-source"><strong className="reply-text-clamp">{item.origin==='CONVERSATION'?'私信会话':item.postTitle??'标题未保存'}</strong><p className="reply-text-clamp">{item.origin==='CONVERSATION'?item.inboundMessage??'来信未保存':item.originalComment??'原评论未保存'}</p></TableCell>
   <TableCell className="reply-cell-content"><p className="reply-text-clamp">{planned(item)&&<span className="reply-plan-label">计划：</span>}{item.content||'正文未保存'}</p></TableCell>
   <TableCell className="reply-cell-result"><Outcome item={item}/><small>{notes[item.displayStatus]??'查看记录详情'}</small></TableCell>
   <TableCell className="reply-cell-time"><time dateTime={item.attemptedAt??undefined}>{item.attemptedAt?<><span>{new Date(item.attemptedAt).toLocaleDateString('zh-CN',{timeZone:'Asia/Shanghai'})}</span><span>{new Date(item.attemptedAt).toLocaleTimeString('zh-CN',{timeZone:'Asia/Shanghai',hour12:false})}</span></>:'—'}</time></TableCell>
   <TableCell className="reply-cell-action"><Button variant="ghost" size="sm" aria-label={`查看回复详情 ${item.id}`} onClick={()=>onOpen(item)}>详情</Button></TableCell>
  </TableRow>)}</TableBody>
 </Table></div>;
}

