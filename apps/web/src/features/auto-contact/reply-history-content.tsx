import type {ReplyHistoryItem} from '@crm/contracts';
import {Badge} from '@/components/ui/badge';
import {Button} from '@/components/ui/button';
import {Table,TableHeader,TableBody,TableRow,TableHead,TableCell,TableCaption} from '@/components/ui/table';
import {Alert,AlertDescription} from '@/components/ui/alert';
import {Disclosure} from '@/components/disclosure';

const labels:Record<string,string>={CONFIRMED:'回复成功',NOT_ATTEMPTED:'未发送',UNKNOWN:'结果未知',FAILED:'历史失败',RESERVED:'已预占',ATTEMPTED:'执行中',CANCELLED:'已取消',SIMULATED_SUCCESS:'模拟完成'};
const notes:Record<string,string>={CONFIRMED:'平台已确认',NOT_ATTEMPTED:'提交前停止',UNKNOWN:'保留占用 · 勿重发',FAILED:'提交情况见原因',RESERVED:'等待执行',ATTEMPTED:'待平台确认',CANCELLED:'已取消',SIMULATED_SUCCESS:'未真实发送'};
const tones:Record<string,string>={CONFIRMED:'success',UNKNOWN:'warning',FAILED:'danger',ATTEMPTED:'active'};
const time=(value:string|null)=>value?new Date(value).toLocaleString('zh-CN',{timeZone:'Asia/Shanghai',hour12:false}):'未记录';
const channel=(item:ReplyHistoryItem)=>item.channel==='COMMENT'?'评论回复':item.channel==='DM'?'私信':'渠道未保存';
const recipient=(item:ReplyHistoryItem)=>item.recipientName??(item.recipientId?`用户 ${item.recipientId}`:'收件人未保存');
function SenderIdentity({item}:{item:ReplyHistoryItem}){return <><strong title={item.senderId??undefined}>{item.senderName??(item.senderId?`账号 · ${item.senderId.slice(-6)}`:'发送账号未记录')}</strong>{!item.senderName&&item.senderId&&<small className="reply-sender-missing">发送时昵称未记录</small>}</>;}
const planned=(item:ReplyHistoryItem)=>!item.attemptedAt&&['NOT_ATTEMPTED','RESERVED','CANCELLED'].includes(item.displayStatus);
function Outcome({item}:{item:ReplyHistoryItem}){return <Badge variant="outline" className="reply-result-badge" data-tone={tones[item.displayStatus]??'neutral'}>{labels[item.displayStatus]??'状态待核查'}</Badge>;}

export function ReplyHistoryTable({items,onOpen}:{items:ReplyHistoryItem[];onOpen:(item:ReplyHistoryItem)=>void}) {
 return <Table className="reply-history-table"><TableCaption className="sr-only">回复历史：发送账号、接收人、原帖评论、正文、渠道、执行开始时间与结果</TableCaption><TableHeader><TableRow><TableHead>发送人</TableHead><TableHead>接收人</TableHead><TableHead>原帖与评论</TableHead><TableHead>回复内容</TableHead><TableHead>渠道</TableHead><TableHead>执行开始</TableHead><TableHead>结果</TableHead><TableHead>详情</TableHead></TableRow></TableHeader><TableBody>{items.map(item=><TableRow key={item.id} aria-label={`回复记录 ${item.id}`}>
  <TableCell className="reply-cell-sender" data-label="发送人"><SenderIdentity item={item}/></TableCell>
  <TableCell className="reply-cell-recipient" data-label="接收人"><span>{recipient(item)}</span></TableCell>
  <TableCell className="reply-cell-source" data-label="原帖与评论"><strong>{item.origin==='CONVERSATION'?'私信会话':item.postTitle??'标题未保存'}</strong><p>{item.origin==='CONVERSATION'?item.inboundMessage??'来信未保存':item.originalComment??'原评论未保存'}</p></TableCell>
  <TableCell className="reply-cell-content" data-label="回复内容"><p>{planned(item)&&<span className="reply-plan-label">计划：</span>}{item.content||'正文未保存'}</p></TableCell>
  <TableCell className="reply-cell-channel" data-label="渠道">{channel(item)}</TableCell>
  <TableCell className="reply-cell-time" data-label="执行开始"><time dateTime={item.attemptedAt??undefined}>{item.attemptedAt?time(item.attemptedAt):'—'}</time></TableCell>
  <TableCell className="reply-cell-result" data-label="结果"><Outcome item={item}/><small>{notes[item.displayStatus]??'查看记录详情'}</small></TableCell>
  <TableCell className="reply-cell-action"><Button variant="outline" size="sm" aria-label={`查看回复详情 ${item.id}`} onClick={()=>onOpen(item)}>查看详情</Button></TableCell>
 </TableRow>)}</TableBody></Table>;
}

export function ReplyHistoryDetail({item:a}:{item:ReplyHistoryItem}) {
 return <div className="reply-history-detail">
  <div className="reply-detail-status"><Outcome item={a}/><span>{notes[a.displayStatus]??a.displayStatus}</span><small>{a.origin==='CONVERSATION'?'会话回复':a.origin==='RULE'?'规则自动任务':'单条受控测试'} · {channel(a)}</small></div>
  {a.displayStatus==='UNKNOWN'&&<Alert role="status" className="reply-unknown-warning"><AlertDescription>结果未知：仍保留额度与去重锁，核查前勿重发，不换号补发。</AlertDescription></Alert>}
  <dl className="reply-detail-facts"><dt>{a.origin==='CONVERSATION'?'来源':'来源帖子'}</dt><dd>{a.origin==='CONVERSATION'?'私信会话':''}{a.origin!=='CONVERSATION'&&(a.postTitle??'标题未保存')}{a.postUrl&&<> · <a href={a.postUrl} target="_blank" rel="noreferrer">查看原帖</a></>}</dd><dt>发送账号</dt><dd><SenderIdentity item={a}/></dd><dt>接收人</dt><dd>{recipient(a)}</dd><dt>{a.origin==='CONVERSATION'?'原来信':'原评论'}</dt><dd className="reply-detail-original">{a.origin==='CONVERSATION'?a.inboundMessage??'来信未保存':a.originalComment??'原评论未保存'}</dd></dl>
  <section className="reply-detail-section"><h3>{planned(a)?'计划回复正文':a.displayStatus==='SIMULATED_SUCCESS'?'模拟回复正文':'记录的回复正文'}</h3><p className="reply-detail-body">{a.content||'正文未保存'}</p>{a.displayStatus==='SIMULATED_SUCCESS'&&<p>模拟记录，未真实发送。</p>}</section>
  <section className="reply-detail-section"><h3>结果与时间</h3>{(a.reason||a.displayStatus==='UNKNOWN')&&<p className="reply-detail-reason">{a.reason||'不能根据日志缺失推断是否提交。'}</p>}<dl className="reply-detail-facts"><dt>记录建立</dt><dd>{time(a.createdAt)}</dd><dt>执行开始</dt><dd>{time(a.attemptedAt)}（不等于提交时间）</dd><dt>平台确认</dt><dd>{time(a.confirmedAt)}</dd><dt>时区</dt><dd>北京时间</dd></dl></section>
  <Disclosure title="记录标识与执行证据" className="reply-detail-evidence"><dl className="reply-detail-facts"><dt>记录 ID</dt><dd>{a.id}</dd><dt>发送身份</dt><dd>{a.senderId??'未保存'} · {a.senderNameSource}</dd><dt>收件人 ID</dt><dd>{a.recipientId??'未保存'}</dd><dt>帖子 ID</dt><dd>{a.postId??'未保存'}</dd><dt>原评论 ID</dt><dd>{a.commentId??'未保存'}</dd><dt>新回复 ID / 回执</dt><dd>{a.platformReceipt??'尚无可靠回执'}</dd><dt>原额度日</dt><dd>{a.day}</dd></dl><p>截图未保存。结果未知保留额度与去重锁，不自动重发或换号补发。</p><Disclosure title={`阶段日志（${a.executionEvidence.length} 条）`}>{a.executionEvidence.length?<pre>{JSON.stringify(a.executionEvidence,null,2)}</pre>:<p>没有持久阶段证据，不能推断实际提交次数。</p>}</Disclosure></Disclosure>
 </div>;
}
