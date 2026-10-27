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
        s.setDraft(null); }}><SheetContent className="auto-contact-sheet" onCloseAutoFocus={e => { e.preventDefault(); s.trigger.current?.focus(); }}><SheetHeader><SheetTitle>自动联系设置</SheetTitle><SheetDescription>保存规则不会开启发送。更改后需要重新授权。</SheetDescription></SheetHeader>{d && <form className="auto-contact-form" onSubmit={e => { e.preventDefault(); s.save.mutate(); }}>
 <label>平台<select value={d.platform} onChange={e => s.setDraft({ ...d, platform: e.target.value as 'XHS' | 'DOUYIN', accounts: [] })}><option value="XHS">小红书</option><option value="DOUYIN">抖音</option></select></label>
 <label>审核目标<select value={d.policyId} onChange={e => { const p = data.policies.find(p => p.id === e.target.value); if (p)
            s.setDraft({ ...d, policyId: p.id, policyRevision: p.revision }); }}><option value="" disabled>请选择已保存审核目标</option>{data.policies.map(p => <option key={p.id} value={p.id}>{p.target} · v{p.revision}</option>)}</select></label>
 <label>最低相关度（0–100）<input type="number" min="0" max="100" required value={d.threshold} onChange={e => s.setDraft({ ...d, threshold: Number(e.target.value) })}/></label><p className="helper-text">只接收明确匹配且上下文充分的结果。高分但不确定的评论不会发送。</p>
 <label>联系渠道<select value={d.channel} onChange={e => s.setDraft({ ...d, channel: e.target.value as 'COMMENT' | 'DM' })}><option value="COMMENT">回复匹配评论</option><option value="DM">私信评论作者</option></select></label>
 <label>发送内容<textarea rows={4} maxLength={1000} placeholder="请填写你授权发送的原文" value={d.content} onChange={e => s.setDraft({ ...d, content: e.target.value })}/></label><p className="helper-text">按此文字原样发送，不调用模型生成。留空可保存，但不能开启。</p>
 <fieldset><legend>账号池与共享日额度</legend><p className="helper-text">评论与私信共用；上海零点换日。额度是业务上限，不代表平台允许。</p>{data.accounts.filter(a => a.platform === d.platform).map(a => { const selected = d.accounts.find(x => x.id === a.id); return <div className="contact-pool-row" key={a.id}><label><input type="checkbox" checked={!!selected} onChange={e => s.setDraft({ ...d, accounts: e.target.checked ? [...d.accounts, { id: a.id, version: a.version, dailyLimit: a.dailyLimit }] : d.accounts.filter(x => x.id !== a.id) })}/>{a.label}{a.isDemo ? ' · 模拟账号' : ''}</label><label>每日条数<input aria-label={`${a.label} 每日条数`} type="number" min="0" max="1000" disabled={!selected} value={selected?.dailyLimit ?? a.dailyLimit} onChange={e => s.setDraft({ ...d, accounts: d.accounts.map(x => x.id === a.id ? { ...x, dailyLimit: Number(e.target.value) } : x) })}/></label><small>{a.isDemo ? '仅模拟，不发送' : '发送资格待核验，不会分配'}</small></div>; })}{!data.accounts.some(a => a.platform === d.platform) && <p>此平台尚无账号，请先在账号中心添加。</p>}</fieldset>
 <p className="helper-text">按列表顺序分配有余额的账号，已联系用户跨账号、跨渠道去重。失败不自动重发；平台限制暂停整个发送流程。</p><ErrorNotice error={s.save.error}/><Button type="submit" disabled={s.busy || !d.policyId}>{s.save.isPending ? '保存中…' : '保存设置（保持关闭）'}</Button>
 </form>}</SheetContent></Sheet>;
}
