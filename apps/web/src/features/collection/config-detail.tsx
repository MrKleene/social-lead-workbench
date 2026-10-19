import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { ErrorNotice, Loading } from '@/components/feedback';
import { formatDate } from '@/lib/types';
import { useConfig } from './use-collection';
import { scenarios, runLabels, reasonLabels } from './types';
export function ConfigDetailPanel({ id }: {
    id: string;
}) {
    const query = useConfig(id);
    const c = query.data;
    if (query.isPending)
        return <Loading />;
    if (query.isError || !c)
        return <ErrorNotice error={query.error}/>;
    return <section className="collection-detail table-panel">
  <div className="list-heading"><div><span className="eyebrow">配置版本 {c.revision} · 规则筛选</span><h2>{c.name}</h2><p>命中关键词只代表相关性，可能求助仍需人工核验。</p></div><Button variant="ghost" onClick={() => void query.refetch()}>刷新状态</Button></div>
  <div className="collection-body"><p className="helper-text">首次完整读取只建立基线；后续新评论才提醒。真实发送禁用。</p>
  <h3>最近运行 <span className="muted">最多 20 轮</span></h3>
  {c.runs.length ? <div className="run-list">{c.runs.map(r => <article key={r.id}><div><strong>{runLabels[r.status] || r.status}</strong><span>{scenarios[r.scenario]} · {formatDate(r.createdAt)}</span></div><p>读取 {r.observed} · 命中 {r.matched} · 新线索 {r.added} · 新提醒 {r.notices} · 请求 {r.requests}/32</p>{r.reason && <small>{reasonLabels[r.reason] || r.reason}</small>}</article>)}</div> : <p className="helper-text">尚未运行。先选择“初始评论快照”，再运行一轮。</p>}
  <h3>评论覆盖与基线</h3><p className="helper-text">{c.monitors.length ? c.monitors.map(m => `${m.baselineAt ? '已有基线' : '等待完整基线'} · ${m.coverage === 'COMPLETE' ? '完整读取' : '部分读取'} · 暂缺 ${m.observations.filter(o => o.state === 'MISSING_UNCONFIRMED').length} · 明确删除 ${m.observations.filter(o => o.state === 'DELETED_CONFIRMED').length}`).join('；') : '尚无评论快照'}。暂时缺失不会当作删除，原文证据始终保留。</p>
  <h3>命中来源 <span className="muted">最近 50 条</span></h3><div className="source-list">{c.matches.map(m => <article key={m.id}><div className="source-flags"><span className="soft-tag">规则 · {m.classification === 'POSSIBLE_HELP' ? '可能求助' : '仅专业相关'}</span><span>{m.isBaseline ? '基线记录' : '后续命中'}{m.comment.parentPlatformCommentId ? ' · 楼中楼' : ''}</span></div><p>{m.comment.originalText}</p><small>{m.comment.post.title} · 命中：{m.keywords.join('、')}</small>{m.comment.identity.lead && <Link className="text-link" to={`/work/${m.comment.identity.lead.id}`}>查看来源与处理线索 →</Link>}</article>)}{!c.matches.length && <p className="helper-text">暂无命中来源。</p>}</div>
  </div>
 </section>;
}
