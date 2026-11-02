import {useRef} from 'react';
import {SavedText} from '@/features/collection/saved-text';
import {SavedAvatar} from '@/features/collection/saved-avatar';
import {Button} from '@/components/ui/button';
import {Table,TableHeader,TableHead,TableRow,TableBody,TableCell} from '@/components/ui/table';
import {SelectField,SelectOption} from '@/components/select-field';
import {FormField} from '@/components/form-field';
import {ErrorNotice,Loading} from '@/components/feedback';
import {Sheet,SheetContent,SheetHeader,SheetTitle,SheetDescription} from '@/components/ui/sheet';
import {useAuth} from '@/features/auth/use-auth';
import {usePendingReplies} from './use-pending-replies';
import './pending-replies.css';
export function PendingReplies(){
 const {user}=useAuth(),s=usePendingReplies(user?.role==='ADMIN'),trigger=useRef<HTMLElement|null>(null);
 if(user?.role!=='ADMIN')return <p>待处理回复仅管理员可查看。</p>;
 const pool=new Set(s.overview.data?.rules.flatMap(r=>r.accountIds)||[]),accounts=s.overview.data?.accounts.filter(a=>pool.has(a.id))||[];
 return <section className="auto-contact-page pending-replies"><header className="contact-heading"><h1>待处理回复</h1></header><p className="pending-note">等待手动选择账号并确认发送，不会跨天自动续发。</p>
 <div className="pending-tools"><FormField>发送账号<SelectField aria-label="待处理发送账号" value={s.accountId} onValueChange={s.changeAccount} disabled={s.busy}><SelectOption value="">选择账号</SelectOption>{accounts.map(a=><SelectOption key={a.id} value={a.id} disabled={!!a.systemBlockReason||a.remaining===0}>{a.label} · {a.systemBlockReason?"账号需处理":`今日剩余 ${a.remaining}`}</SelectOption>)}</SelectField></FormField><span>已选 {s.selected.length} 条</span><Button disabled={!s.selected.length||!s.accountId||s.busy} onClick={()=>{trigger.current=document.activeElement as HTMLElement;s.confirm.reset();s.prepare.mutate();}}>{s.prepare.isPending?'正在检查…':'预览所选回复'}</Button>{s.selected.length>0&&<Button variant="ghost" size="sm" disabled={s.busy} onClick={s.clear}>清空选择</Button>}</div>
 <ErrorNotice error={s.list.error||s.overview.error||s.prepare.error}/>{s.accepted&&<p role="status">已提交本次所选回复，可在回复记录或任务队列查看结果。</p>}
 {s.list.isPending?<Loading/>:s.list.isError?<Button variant="outline" onClick={()=>void s.list.refetch()}>重试读取</Button>:!s.list.data?.items.length?<p className="contact-empty">暂无待处理回复</p>:<Table aria-label="待处理回复列表"><TableHeader><TableRow><TableHead>选择</TableHead><TableHead>评论与来源</TableHead><TableHead>相关度</TableHead><TableHead>拟回复内容</TableHead><TableHead>待处理原因</TableHead></TableRow></TableHeader><TableBody>{s.list.data.items.map(j=><TableRow key={j.id}><TableCell><input type="checkbox" aria-label={`选择 ${j.authorNickname||'评论'} 的回复`} checked={s.selected.some(x=>x.id===j.id)} disabled={s.busy||(!s.selected.some(x=>x.id===j.id)&&s.selected.length>=20)} onChange={()=>s.toggle(j)}/></TableCell><TableCell><div className="pending-author"><SavedAvatar url={j.authorAvatarUrl}/><strong>{j.authorNickname||'用户昵称未记录'}</strong></div><small>{j.publishedAt?new Date(j.publishedAt).toLocaleString():'评论时间未记录'}</small><SavedText key={`${j.id}:comment`} text={j.comment||'原评论未记录'} limit={160} label="评论"/><small>来源：{j.postTitle||'帖子标题未记录'}</small></TableCell><TableCell>{j.score??'未评分'}</TableCell><TableCell><SavedText key={`${j.id}:content`} text={j.content} limit={160} label="回复"/></TableCell><TableCell>{j.reason||'等待手动处理'}</TableCell></TableRow>)}</TableBody></Table>}
 <div className="contact-heading"><span>{s.list.data?.total??'—'} 条 · 每页 20 条</span><div className="action-row"><Button variant="ghost" size="sm" disabled={!s.offset||s.list.isFetching} onClick={()=>s.setOffset(Math.max(0,s.offset-20))}>上一页</Button><Button variant="ghost" size="sm" disabled={s.list.isFetching||s.offset+20>=(s.list.data?.total??0)} onClick={()=>s.setOffset(s.offset+20)}>下一页</Button></div></div>
 <Sheet open={!!s.preview} onOpenChange={open=>{if(!open)s.closePreview();}}><SheetContent className="pending-preview" onCloseAutoFocus={e=>{e.preventDefault();trigger.current?.focus();}}><SheetHeader><SheetTitle>确认发送所选回复</SheetTitle><SheetDescription>{s.preview?.accountLabel} · {s.preview?.items.length} 条 · 本次确认 5 分钟内有效，最晚至当日结束</SheetDescription></SheetHeader><div className="pending-preview-items">{s.preview?.items.map(j=><article key={j.id}><h3>{j.postTitle||'来源帖子'}</h3><p>{j.comment||'原评论未记录'}</p><strong>拟回复</strong><p>{j.content}</p></article>)}</div><div className="pending-preview-footer"><p>{s.preview?.notice}</p><ErrorNotice error={s.confirm.error}/><div className="action-row"><Button variant="outline" disabled={s.confirm.isPending} onClick={s.closePreview}>返回</Button><Button disabled={s.confirm.isPending} onClick={()=>s.confirm.mutate()}>{s.confirm.isPending?'正在提交…':'发送所选'}</Button></div></div></SheetContent></Sheet>
 </section>;
}
