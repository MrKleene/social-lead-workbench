import {Pager} from '@/components/pager';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { FormField } from '@/components/form-field';
import { SelectField, SelectOption } from '@/components/select-field';
import {SendReadiness,AccountSendEvidence} from './send-readiness';
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
export function AutoContactPage({scope}:{scope?:{runId:string;configId:string}}={}) {
    const { user } = useAuth(), s = useAutoContact(user?.role === 'ADMIN',scope?.runId), d = s.overview.data, r = s.rule;
    if (user?.role !== 'ADMIN')
        return <p>自动联系仅由管理员管理。<Link to="/work">返回工作台</Link></p>;
    if (s.overview.isPending)
        return <Loading />;
    if (!d)
        return <ErrorNotice error={s.overview.error}/>;
    return <section className="auto-contact-page"><Link to="/comment-review">返回评论审核</Link><header className="contact-heading"><div><h1>自动联系</h1><p>高相关评论按已授权规则排队，联系记录独立保留。</p></div><Button variant="outline" onClick={s.open}>自动联系设置</Button></header>
 <section className="contact-panel"><h2>回复记录</h2><p>已执行的规则任务和单条测试已统一到独立页面。</p><Link to="/reply-history">查看已发送的回复与结果 →</Link></section><SendReadiness/><section className="contact-panel" aria-label="发送状态"><div className="contact-heading"><strong>自动联系：{r?.enabled ? '开启' : '关闭'}</strong>{r?.enabled ? <Button disabled={s.busy} variant="outline" onClick={() => s.toggle.mutate(false)}>关闭自动联系</Button> : <Button disabled={s.busy || !s.canEnable} onClick={() => { s.trigger.current = document.activeElement as HTMLElement; s.setConfirm(true); }}>开启自动联系</Button>}</div>{!d.capability.available && <p role="status">{d.capability.reason}</p>}{r && !s.canEnable && d.capability.available && <p role="status">账号、发送资格或规则尚未就绪，不能开启自动联系。</p>}{r?.pauseReason && <Alert role="alert"><AlertDescription>平台发送已暂停：{r.pauseReason}。核查限制前不换号。</AlertDescription></Alert>}<p>{r ? `相关度 ≥ ${r.threshold} · 明确匹配且上下文充分 · ${r.channel === 'COMMENT' ? '回复匹配评论' : '私信作者'}` : '尚未设置规则。发送内容留空，默认关闭。'}</p><ErrorNotice error={s.toggle.error || s.cancel.error}/>{s.save.isSuccess && <p role="status">设置已保存，自动联系保持关闭。</p>}</section>
 <section className="contact-panel"><div className="contact-heading"><h2>账号矩阵</h2><Link to="/work?module=accounts">账号中心</Link></div><p>今日额度：{d.day} · {d.timezone} · 仅统计当日，历史累计见“回复记录”。评论与私信共用每日额度。</p><div className="contact-accounts">{d.accounts.filter(a => !r?.accountIds.length || r.accountIds.includes(a.id)).map(a => <article key={a.id}><h3>{a.label}</h3><AccountSendEvidence account={a}/><strong>剩余 {a.remaining} / {a.authorizedLimit}</strong><small>确认 {a.confirmed} · 预占/在途 {a.reserved} · 未知 {a.unknown}</small></article>)}</div>{!r?.accountIds.length && <p>尚未选择账号池。请在自动联系设置中选择账号和每日上限。</p>}</section>
 <section className="contact-panel"><div className="contact-heading"><h2>{scope?'本轮来源的规则任务':'规则任务队列'}</h2><FormField>任务状态<SelectField aria-label="联系任务状态" value={s.status} onValueChange={e => s.setStatus(e)}><SelectOption value="">全部状态</SelectOption>{contactStatuses.map(x => <SelectOption key={x} value={x}>{contactStatusLabel[x]}</SelectOption>)}</SelectField></FormField></div><ErrorNotice error={s.jobs.error}/>{s.jobs.isPending ? <Loading /> : !s.jobs.data?.items.length ? <div className="contact-empty"><h3>暂无规则任务</h3><p>此处只显示持续规则任务。已执行的单条测试请查看独立“回复记录”页面；队列为空不代表没有发送记录。</p></div> : <div className="contact-jobs">{s.jobs.data.items.map(j => <Button variant="ghost" size="content" key={j.id} className="contact-job" onClick={() => { s.trigger.current = document.activeElement as HTMLElement; s.setDetail(j); }}><strong>{contactStatusLabel[j.status] ?? j.status}</strong><span>{j.channel === 'COMMENT' ? '评论回复' : '私信'} · {j.accountLabel ?? '尚未分配账号'}</span><span>用户 {j.recipientId || '待核查'} · 相关度 {j.evidence.score}</span><p>{j.reason || j.content}</p></Button>)}</div>}<div className="contact-heading"><small>{s.jobs.data?.total ?? 0} 条 · 第 {Math.floor(s.offset / 20) + 1} 页</small><Pager className="action-row"><Button variant="ghost" size="content" disabled={!s.offset || s.jobs.isPending} onClick={() => s.setOffset(Math.max(0, s.offset - 20))}>上一页联系记录</Button><Button variant="ghost" size="content" disabled={s.jobs.isPending || s.offset + 20 >= (s.jobs.data?.total ?? 0)} onClick={() => s.setOffset(s.offset + 20)}>下一页联系记录</Button></Pager></div></section>
 <ContactSettings s={s}/><ContactJobDetail job={s.detail} onReturnFocus={() => s.trigger.current?.focus()} onClose={() => s.setDetail(null)} onCancel={id => s.cancel.mutate(id)} busy={s.busy}/><Dialog open={s.confirm} onOpenChange={s.setConfirm}><DialogContent className="auto-contact-sheet" onCloseAutoFocus={e => { e.preventDefault(); s.trigger.current?.focus(); }}><DialogHeader><DialogTitle>确认开启自动联系</DialogTitle><DialogDescription>持续处理开启后更新的审核结果，无需逐条人工审核。保存设置和识别授权不等于发送授权。</DialogDescription></DialogHeader>{r && <><p>相关度 ≥ {r.threshold}，仅明确匹配、上下文充分；{r.channel === 'COMMENT' ? '回复该条评论' : '私信评论作者'}。</p><p>账号池：{r.accountIds.map(id => `${d.accounts.find(a => a.id === id)?.label ?? id}（${r.accountLimits.find(a => a.id === id)?.dailyLimit ?? 0} 条/日）`).join('、')}。每日共享上限按已保存设置执行。目标版本 {r.policyRevision} · 模型 {r.model}。</p><p className="contact-body">{r.content}</p><p>已联系用户不重复；结果未知保留占用，平台限制暂停流程。开启不保证平台允许发送。</p><ErrorNotice error={s.toggle.error}/><Button disabled={s.busy || !s.canEnable} onClick={() => s.toggle.mutate(true)}>确认此规则并开启</Button></>}</DialogContent></Dialog>
 </section>;
}
