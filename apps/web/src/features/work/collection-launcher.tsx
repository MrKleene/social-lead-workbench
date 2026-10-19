import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { ErrorNotice } from '@/components/feedback';
import { Config, reasonLabels, runLabels, scenarios } from '@/features/collection/types';
import { useWorkspaceMutation } from '@/features/collection/use-collection';
import { ConfigDetailPanel } from '@/features/collection/config-detail';
export function CollectionLauncher({ configs, loading, initialId }: { configs: Config[]; loading: boolean; initialId?: string | null }) {
    const [choice, setChoice] = useState(initialId || ''), [scenario, setScenario] = useState('BASELINE'), [feedback, setFeedback] = useState('');
    const selected = configs.find(c => c.id === choice) || configs.find(c => c.enabled) || configs[0];
    const mutation = useWorkspaceMutation();
    if (loading) return <p>正在读取搜索设置…</p>;
    if (!selected) return <section className="table-panel collection-launcher"><h2>先设置要找什么</h2><p>添加关键词和排除词，再回到这里开始找线索。</p><Button asChild><Link to="/collection">去搜索设置</Link></Button></section>;
    const backoff = !!selected.nextAllowedAt && new Date(selected.nextAllowedAt) > new Date();
    return <section className="table-panel collection-launcher"><div className="list-heading"><div><h2>开始找线索</h2><p>手动运行一轮有限模拟，真实平台未连接。</p></div><Button asChild variant="ghost"><Link to="/collection">编辑搜索设置</Link></Button></div><div className="collection-body"><div className="collection-runbar"><label>本次使用的搜索设置<select aria-label="本次使用的搜索设置" value={selected.id} onChange={e => { setChoice(e.target.value); setFeedback(''); }}>{configs.map(c => <option key={c.id} value={c.id}>{c.name}{!c.enabled ? '（已暂停）' : ''}</option>)}</select></label><Button disabled={!selected.enabled || !!selected.activeRunId || backoff || mutation.isPending} onClick={() => mutation.mutate({ path: `/collection/configs/${selected.id}/runs`, body: { mode: 'MOCK', scenario, requestKey: crypto.randomUUID() } }, { onSuccess: () => setFeedback(`已提交「${selected.name}」的一轮模拟；下方集中查看进度。`) })}>开始找线索（模拟）</Button>{selected.activeRunId && <Button variant="outline" onClick={() => mutation.mutate({ path: `/collection/runs/${selected.activeRunId}/pause` })}>暂停本轮</Button>}</div><p>搜索：{selected.keywords.join(' / ')} · 排除：{selected.excludeWords.join('、') || '无'} · 最多 {selected.batchLimit} 帖</p><details><summary>模拟验收选项</summary><label>模拟场景<select aria-label="模拟场景" value={scenario} onChange={e => setScenario(e.target.value)}>{Object.entries(scenarios).map(([k,v]) => <option key={k} value={k}>{v}</option>)}</select></label></details><ErrorNotice error={mutation.error}/>{feedback && <p role="status">{feedback}</p>}{backoff && <p>正在退避，请稍后手动刷新重试。</p>}
      <h3>集中采集进度</h3><div className="run-list">{configs.filter(c => c.runs.length).map(c => { const r = c.runs[0]; return <article key={c.id}><strong>{c.name} · {runLabels[r.status]}</strong><p>读取 {r.observed} · 匹配 {r.matched} · 新线索 {r.added} · 新提醒 {r.notices} · 请求 {r.requests}/32</p>{r.reason && <small>{reasonLabels[r.reason] || r.reason}</small>}</article>; })}</div>{!configs.some(c => c.runs.length) && <p>尚未运行。点击上方按钮后，结果出现在下面的匹配评论。</p>}<details><summary>所选设置的运行记录与覆盖范围</summary><ConfigDetailPanel key={selected.id} id={selected.id}/></details></div></section>;
}
