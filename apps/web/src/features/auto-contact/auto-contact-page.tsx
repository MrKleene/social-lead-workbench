import {SelectedReplyAccounts,ContactResultsTable,ContactResultsPagination} from './contact-results';
import {useSearchParams} from 'react-router-dom';
import {PendingReplies} from './pending-replies';
import {PageState} from '@/components/page-state';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {Field,FieldLabel} from '@/components/ui/field';
import {useId} from 'react';
import { SelectField, SelectOption } from '@/components/select-field';
import { Link } from 'react-router-dom';
import { contactStatuses, contactStatusLabel } from '@crm/contracts';
import { Button } from '@/components/ui/button';
import { Sheet as Dialog, SheetContent as DialogContent, SheetHeader as DialogHeader, SheetTitle as DialogTitle, SheetDescription as DialogDescription } from '@/components/ui/sheet';
import { ErrorNotice, Loading } from '@/components/feedback';
import { useAuth } from '@/features/auth/use-auth';
import { useAutoContact } from './use-auto-contact';
import { ContactSettings } from './contact-settings';
import { ContactJobDetail } from './contact-job-detail';
import './auto-contact.css';
export function AutoContactPage({scope,onSettings,readOnly=false}:{readOnly?:boolean;scope?:{runId:string;configId:string;platform?:string};onSettings?:()=>void}={}) {
    const [params]=useSearchParams(),filterId=useId();
    const { user } = useAuth(), s = useAutoContact(user?.role === 'ADMIN',scope?.runId), d = s.overview.data, r = scope?.platform ? d?.rules.find(rule=>rule.platform===scope.platform) : s.rule;
    if (user?.role !== 'ADMIN')
        return <p>自动回复仅由管理员管理。<Link to="/work">返回工作台</Link></p>;
    if(!scope&&params.get('view')==='pending')return <PendingReplies/>;
    if (s.overview.isPending)
        return <PageState title="自动回复" loading/>;
    if (!d)
        return <PageState title="自动回复" error={s.overview.error} onRetry={()=>void s.overview.refetch()}/>;
    return <section className="auto-contact-page contact-results-page"><header className="contact-heading"><div>{scope?<h2>自动回复</h2>:<h1>自动回复</h1>}</div>{!readOnly&&!scope&&<Button variant="outline" onClick={onSettings||s.open}>自动回复设置</Button>}</header>
 {!readOnly&&!scope&&<><section className="contact-panel contact-history-link"><h2>回复记录</h2><Link to="/reply-history">查看已发送的回复与结果 →</Link></section><section className="contact-panel" aria-label="发送状态"><div className="contact-heading"><strong>自动回复：{r?.enabled ? '开启' : '关闭'}</strong>{r?.enabled ? <Button disabled={s.busy} variant="outline" onClick={() => s.toggle.mutate(false)}>关闭自动回复</Button> : <Button disabled={s.busy || !s.canEnable} onClick={() => { s.trigger.current = document.activeElement as HTMLElement; s.setConfirm(true); }}>开启自动回复</Button>}</div>{!d.capability.available && <p role="status">{d.capability.reason}</p>}{r && !s.canEnable && d.capability.available && <p role="status">账号、发送资格或规则尚未就绪，不能开启自动回复。</p>}{r?.pauseReason && <Alert role="alert"><AlertDescription>平台发送已暂停：{r.pauseReason}。核查限制前不换号。</AlertDescription></Alert>}<p>{r ? `相关度 ≥ ${r.threshold} · 明确匹配且上下文充分 · ${r.channel === 'COMMENT' ? '回复匹配评论' : '私信作者'}` : '尚未设置规则。发送内容留空，默认关闭。'}</p><ErrorNotice error={s.toggle.error || s.cancel.error}/>{s.save.isSuccess && <p role="status">设置已保存，自动回复保持关闭。</p>}</section>
 </>}
 {scope&&!readOnly&&!d.capability.available&&d.capability.reason&&<Alert role="status"><AlertDescription>{d.capability.reason}</AlertDescription></Alert>}
 {scope&&!readOnly&&r?.pauseReason&&<Alert role="alert"><AlertDescription>平台发送已暂停：{r.pauseReason}。核查限制前不换号。</AlertDescription></Alert>}
 {!readOnly&&<><ErrorNotice error={s.overview.error}/><SelectedReplyAccounts data={d} rule={r}/></>}
 <section className="contact-panel contact-results-panel"><div className="contact-results-toolbar"><h2>{scope?'本轮回复结果':'回复任务'}</h2><div className="contact-results-controls"><Field className="contact-status-filter"><FieldLabel className="sr-only" htmlFor={filterId}>任务状态</FieldLabel><SelectField id={filterId} aria-label="联系任务状态" value={s.status} onValueChange={e=>s.setStatus(e)}><SelectOption value="">全部状态</SelectOption>{contactStatuses.map(x=><SelectOption key={x} value={x}>{contactStatusLabel[x]}</SelectOption>)}</SelectField></Field>{!readOnly&&<Button asChild variant="outline" size="sm"><Link to="/auto-contact?view=pending">待处理回复</Link></Button>}</div></div>
 <ErrorNotice error={s.jobs.error}/>{s.jobs.isError?<Button variant="outline" size="sm" onClick={()=>void s.jobs.refetch()}>重试读取结果</Button>:s.jobs.isPending?<Loading/>:!s.jobs.data?.items.length?<p className="contact-results-empty">{s.status?'没有符合此状态的回复任务':'暂无回复任务'}</p>:<ContactResultsTable items={s.jobs.data.items} onOpen={j=>{s.trigger.current=document.activeElement as HTMLElement;s.setDetail(j);}}/>}
 <ContactResultsPagination total={s.jobs.isError?undefined:s.jobs.data?.total} offset={s.offset} pending={s.jobs.isFetching} onChange={s.setOffset}/></section>
 {!scope&&!readOnly&&<ContactSettings s={s}/>}<ContactJobDetail job={s.detail} onReturnFocus={() => s.trigger.current?.focus()} onClose={() => s.setDetail(null)} onCancel={readOnly?undefined:id => s.cancel.mutate(id)} busy={s.busy}/><Dialog open={!scope&&!readOnly&&s.confirm} onOpenChange={s.setConfirm}><DialogContent className="auto-contact-sheet" onCloseAutoFocus={e => { e.preventDefault(); s.trigger.current?.focus(); }}><DialogHeader><DialogTitle>确认开启自动回复</DialogTitle><DialogDescription>仅处理开启后新建采集轮次的匹配评论，历史采集和旧结果不补发。高分匹配无需逐条人工审核。</DialogDescription></DialogHeader>{r && <><p>相关度 ≥ {r.threshold}，仅明确匹配、上下文充分；{r.channel === 'COMMENT' ? '回复该条评论' : '私信评论作者'}。</p><p>账号池：{r.accountIds.map(id => `${d.accounts.find(a => a.id === id)?.label ?? id}（${r.accountLimits.find(a => a.id === id)?.dailyLimit ?? 0} 条/日）`).join('、')}。每日共享上限按已保存设置执行。目标版本 {r.policyRevision} · 模型 {r.model}。</p><p className="contact-body">{r.content}</p><p>已联系用户不重复；结果未知保留占用，平台限制暂停流程。开启不保证平台允许发送。</p><ErrorNotice error={s.toggle.error}/><Button disabled={s.busy || !s.canEnable} onClick={() => s.toggle.mutate(true)}>确认此规则并开启</Button></>}</DialogContent></Dialog>
 </section>;
}
