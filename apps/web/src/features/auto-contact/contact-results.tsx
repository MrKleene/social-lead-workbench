import {Link} from 'react-router-dom';
import {useEffect,useState} from 'react';
import {contactJobStatus} from './contact-job-status';
import {ArrowUpRight,LoaderCircle} from 'lucide-react';
import {type AutoContactJobView,type AutoContactOverview,type AutoContactRule} from '@crm/contracts';
import {Badge} from '@/components/ui/badge';
import {Button} from '@/components/ui/button';
import {Table,TableHeader,TableHead,TableBody,TableRow,TableCell} from '@/components/ui/table';
import {Pager} from '@/components/pager';
import {SavedText} from '@/features/collection/saved-text';
import {displayNickname,readingTime} from '@/features/collection/display-metadata';
import {accountSendSummary,currentQuotaDay} from './account-send-summary';

import {contactPagination,contactPageSize} from './contact-pagination';
export function SelectedReplyAccounts({data,rule}:{data:AutoContactOverview;rule?:AutoContactRule}){
 const current=currentQuotaDay(data.day,data.timezone);
 return <section className="contact-panel selected-reply-accounts"><div className="contact-heading"><div><h2>已选择自动回复账号</h2><small>{current?'今日额度':'额度日期'} · {data.day} · {data.timezone==='Asia/Shanghai'?'北京时间':data.timezone}</small></div><Button asChild variant="ghost" size="sm"><Link to="/work?module=accounts">账号中心<ArrowUpRight data-icon="inline-end"/></Link></Button></div>
 {!rule?.accountIds.length?<p className="contact-results-empty">尚未选择自动回复账号</p>:<Table className="selected-reply-account-table" aria-label="已选择自动回复账号"><TableHeader><TableRow><TableHead>账号</TableHead><TableHead>发送状态</TableHead><TableHead>{current?'今日确认成功':'该日确认成功'}</TableHead><TableHead>日额度 / 可用</TableHead></TableRow></TableHeader><TableBody>{rule.accountIds.map(id=>{const saved=data.accounts.find(a=>a.id===id);const limit=saved?Math.min(saved.todayLimit??saved.dailyLimit,rule.accountLimits.find(l=>l.id===id)?.dailyLimit??0):0;const a=saved?{...saved,authorizedLimit:limit,remaining:Math.max(0,limit-saved.occupied)}:undefined;if(!a)return <TableRow key={id}><TableCell>已选账号不可用</TableCell><TableCell colSpan={3}>账号记录未返回，请在采集设置中核对</TableCell></TableRow>;
 const state=accountSendSummary(a,current);
 return <TableRow key={id}><TableCell data-label="账号"><strong>{a.label}</strong></TableCell><TableCell data-label="发送状态"><Badge variant="outline" data-tone={state.tone}>{state.label}</Badge>{state.reason&&<small>{state.reason}</small>}{a.reserved>0&&<small>预占 / 在途 {a.reserved} 条</small>}{a.unknown>0&&<small>结果未知 {a.unknown} 条</small>}</TableCell><TableCell data-label={current?'今日确认成功':'该日确认成功'}><strong>{a.confirmed} 条</strong>{a.isDemo&&<small>模拟记录</small>}</TableCell><TableCell data-label="日额度 / 可用"><span>{a.authorizedLimit} 条 / 可用 {a.remaining} 条</span></TableCell></TableRow>;
 })}</TableBody></Table>}
 </section>;
}
const object=(x:unknown):Record<string,unknown>=>x&&typeof x==='object'&&!Array.isArray(x)?x as Record<string,unknown>:{};
const text=(x:unknown)=>typeof x==='string'&&x.trim()?x:undefined;
export function jobSource(job:AutoContactJobView){const s=object(job.sourceSnapshot),c=object(s.comment),p=object(s.post);return {name:displayNickname(c.authorNickname),comment:text(c.comment),title:text(p.title)};}
export function ContactResultsTable({items,onOpen,disconnected=false}:{items:AutoContactJobView[];onOpen:(job:AutoContactJobView)=>void;disconnected?:boolean}){
 const [now,setNow]=useState(Date.now);const active=items.some(j=>j.live&&['WAITING_ACCOUNT','MANUAL_READY','RESERVED','ATTEMPTED'].includes(j.status));
 useEffect(()=>{if(!active)return;setNow(Date.now());const timer=setInterval(()=>setNow(Date.now()),2000);return()=>clearInterval(timer);},[active,items]);
 return <Table className="contact-results-table" aria-label="回复结果"><TableHeader><TableRow><TableHead>评论与来源</TableHead><TableHead>回复内容</TableHead><TableHead>发送账号 / 渠道</TableHead><TableHead>相关度</TableHead><TableHead>状态 / 原因</TableHead><TableHead>操作</TableHead></TableRow></TableHeader><TableBody>{items.map(j=>{const source=jobSource(j),name=source.name||'用户昵称未保存',state=contactJobStatus(j,now,disconnected);return <TableRow key={j.id}>
 <TableCell className="contact-result-source" data-label="评论与来源"><strong>{name}</strong>{!source.name&&<small className="contact-recipient-id">{j.recipientId||'用户身份待核查'}</small>}<SavedText key={`${j.id}:comment`} text={source.comment||'评论原文未保存'} limit={110} label="评论"/>{source.title&&<small className="contact-source-title">来源：{source.title}</small>}</TableCell>
 <TableCell className="contact-result-content" data-label="回复内容"><SavedText key={`${j.id}:content`} text={j.content||'回复内容未保存'} limit={110} label="回复内容"/>{!j.attempt?.attemptedAt&&j.status!=='CONFIRMED'&&<small>{j.mode==='SIMULATION'?'模拟内容':'计划内容'}</small>}</TableCell>
 <TableCell data-label="发送账号 / 渠道"><span>{j.attempt?.historySnapshot?.accountLabel||j.accountLabel||'尚未分配'}</span><small>{j.channel==='COMMENT'?'评论回复':j.channel==='DM'?'私信':'渠道未记录'}</small></TableCell>
 <TableCell className="contact-result-score" data-label="相关度">{Number.isFinite(j.evidence.score)?j.evidence.score:'—'}</TableCell>
 <TableCell className="contact-result-state" data-label="状态 / 原因"><Badge variant="outline" data-tone={j.status==='CONFIRMED'?'success':['UNKNOWN','FAILED','BLOCKED_POST'].includes(j.status)?'warning':'neutral'}><span role="status" aria-live="polite" className="contact-live-status">{state.busy&&<LoaderCircle aria-hidden="true" size={13} className="contact-live-spinner"/>}{state.label}</span></Badge>{j.reason&&<SavedText key={`${j.id}:reason`} text={j.reason} limit={140} label="原因"/>}{j.status==='UNKNOWN'&&<small className="contact-result-risk">保留占用 · 勿重发</small>}{j.status==='PENDING_ACTION'&&!j.reason&&<small>选择账号并确认后才会发送</small>}{j.updatedAt&&<small>更新 {readingTime(j.updatedAt)}</small>}</TableCell>
 <TableCell className="contact-result-action"><Button variant="ghost" size="sm" aria-label={`查看回复任务 ${j.id}`} onClick={()=>onOpen(j)}>详情</Button></TableCell>
 </TableRow>;})}</TableBody></Table>;
}
export function ContactResultsPagination({total,offset,pending,onChange}:{total?:number;offset:number;pending:boolean;onChange:(offset:number)=>void}){
 const p=contactPagination(total??0,offset);
 return <div className="contact-results-pagination"><span>{total===undefined?'数量暂不可用':`共 ${total} 条 · 每页 ${contactPageSize} 条 · 第 ${p.page}/${p.pages} 页`}</span><Pager aria-label="回复结果分页"><Button variant="outline" size="sm" disabled={pending||total===undefined||!offset} onClick={()=>onChange(Math.max(0,offset-contactPageSize))}>上一页</Button><Button variant="outline" size="sm" disabled={pending||total===undefined||offset+contactPageSize>=total} onClick={()=>onChange(offset+contactPageSize)}>下一页</Button></Pager></div>;
}
