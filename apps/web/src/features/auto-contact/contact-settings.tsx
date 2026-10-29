import {SettingsDisclosure} from '@/components/settings-disclosure';
import { FieldGroup } from '@/components/ui/field';
import { FormField } from '@/components/form-field';
import { SelectField, SelectOption } from '@/components/select-field';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { FieldSet, FieldLegend } from '@/components/ui/field';
import { Checkbox } from '@/components/ui/checkbox';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { ErrorNotice } from '@/components/feedback';
import type { useAutoContact } from './use-auto-contact';
export function ContactSettings({ s }: {
    s: ReturnType<typeof useAutoContact>;
}) {
    const d = s.draft, data = s.overview.data;
    if (!data)
        return null;
    return <Sheet open={!!d} onOpenChange={open => { if (!open)
        s.setDraft(null); }}><SheetContent className="auto-contact-sheet" onCloseAutoFocus={e => { e.preventDefault(); s.trigger.current?.focus(); }}><SheetHeader><SheetTitle>自动联系设置</SheetTitle><SheetDescription>保存规则不会开启发送。更改后需要重新授权。</SheetDescription></SheetHeader><ContactSettingsForm s={s}/></SheetContent></Sheet>;
}

export function ContactSettingsForm({s}:{s:ReturnType<typeof useAutoContact>}) {
 const d=s.draft,data=s.overview.data;
 if(!d||!data)return null;
 const currentPolicy=data.policies.find(p=>p.id===d.policyId);
 return <form className="auto-contact-form" onSubmit={e => { e.preventDefault(); s.save.mutate(); }}><FieldGroup className="form-fields"><FieldGroup className="contact-rules-grid">
 <FormField>平台<SelectField value={d.platform} onValueChange={e => s.setDraft({ ...d, platform: e as 'XHS' | 'DOUYIN', accounts: [] })}><SelectOption value="XHS">小红书</SelectOption><SelectOption value="DOUYIN">抖音</SelectOption></SelectField></FormField>
 <FormField>审核目标<SelectField value={d.policyId} onValueChange={e => { const p = data.policies.find(p => p.id === e); if (p)
            s.setDraft({ ...d, policyId: p.id, policyRevision: p.revision }); }}><SelectOption value="" disabled>请选择已保存审核目标</SelectOption>{data.policies.map(p => <SelectOption key={p.id} value={p.id}>{p.target} · v{p.revision}</SelectOption>)}</SelectField></FormField>
 {currentPolicy&&currentPolicy.revision!==d.policyRevision&&<div role="alert"><p>审核目标已更新为 v{currentPolicy.revision}，此草稿仍引用 v{d.policyRevision}。确认后更新引用；不会自动启用发送。</p><Button type="button" variant="outline" onClick={()=>s.setDraft({...d,policyRevision:currentPolicy.revision})}>使用当前审核目标版本</Button></div>}
 <FormField>最低相关度（0–100）<Input type="number" min="0" max="100" required value={d.threshold} onChange={e => s.setDraft({ ...d, threshold: Number(e.target.value) })}/></FormField>
 <FormField>联系渠道<SelectField value={d.channel} onValueChange={e => s.setDraft({ ...d, channel: e as 'COMMENT' | 'DM' })}><SelectOption value="COMMENT">回复匹配评论</SelectOption><SelectOption value="DM" disabled>私信评论作者 · 当前未接通</SelectOption></SelectField></FormField>
 </FieldGroup><FormField>发送内容<Textarea rows={4} maxLength={1000} placeholder="请填写你授权发送的原文" value={d.content} onChange={e => s.setDraft({ ...d, content: e.target.value })}/></FormField><p className="helper-text">按此文字原样发送，不调用模型生成。留空可保存，但不能开启。</p>
 <FieldSet><FieldLegend>账号池与共享日额度</FieldLegend><p className="helper-text">评论与私信共用；上海零点换日。额度是业务上限，不代表平台允许。</p>{data.accounts.filter(a => a.platform === d.platform).map(a => { const selected = d.accounts.find(x => x.id === a.id); return <div className="contact-pool-row" key={a.id}><FormField><Checkbox  checked={!!selected} onCheckedChange={e => s.setDraft({ ...d, accounts: (e === true) ? [...d.accounts, { id: a.id, version: a.version, dailyLimit: a.dailyLimit }] : d.accounts.filter(x => x.id !== a.id) })}/>{a.label}{a.isDemo ? ' · 模拟账号' : ''}</FormField><FormField>每日条数<Input aria-label={`${a.label} 每日条数`} type="number" min="0" max="1000" disabled={!selected} value={selected?.dailyLimit ?? a.dailyLimit} onChange={e => s.setDraft({ ...d, accounts: d.accounts.map(x => x.id === a.id ? { ...x, dailyLimit: Number(e.target.value) } : x) })}/></FormField><small>{a.isDemo ? '仅模拟，不发送' : '发送资格待核验，不会分配'}</small></div>; })}{!data.accounts.some(a => a.platform === d.platform) && <p>此平台尚无账号，请先在账号中心添加。</p>}</FieldSet>
 <SettingsDisclosure title="匹配门槛与发送规则"><p>只接收明确匹配且上下文充分的结果；高分但不确定不会发送。按列表顺序分配有余额的账号，跨账号、跨渠道去重。失败不自动重发，平台限制暂停整个发送流程。</p></SettingsDisclosure><ErrorNotice error={s.save.error}/><Button type="submit" disabled={s.busy || !d.policyId}>{s.save.isPending ? '保存中…' : '保存设置（保持关闭）'}</Button>
 </FieldGroup></form>;
}
