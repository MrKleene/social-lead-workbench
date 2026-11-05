import {Badge} from '@/components/ui/badge';
import {collectionOutcome} from '@/features/collection/collection-outcome';
import {assessmentLabels} from '@crm/contracts';
import {RunStats} from './run-stats';
import {MatchExplanation} from './match-explanation';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { ErrorNotice, Loading } from '@/components/feedback';
import { formatDate } from '@/lib/types';
import { useConfig } from './use-collection';
import { scenarios, reasonLabels } from './types';
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
  <div className="list-heading"><div><span className="eyebrow">搜索配置版本 {c.revision}</span><h2>{c.name}</h2></div><Button variant="ghost" size="content" onClick={() => void query.refetch()}>刷新状态</Button></div>
  <div className="collection-body">

  <Link to="/comment-review">进入独立评论审核</Link>
  <h3>最近运行 <span className="muted">最多 20 轮</span></h3>
  {c.runs.length ? <div className="run-list">{c.runs.map(r => <article key={r.id}><div><strong>{collectionOutcome(r).label}</strong><span>{scenarios[r.scenario]} · {formatDate(r.createdAt)}</span></div><RunStats run={r}/>{r.reason && <small>{reasonLabels[r.reason] || r.reason}</small>}</article>)}</div> : <p className="helper-text">暂无运行记录。</p>}
  <h3>评论覆盖与基线</h3><p className="helper-text">{c.monitors.length ? c.monitors.map(m => `${m.baselineAt ? '已有完整基线' : c.mode !== 'MOCK' && m.lastRunId ? '已有读窗口起点，未建立完整基线' : '等待基线或窗口起点'} · ${m.coverage === 'COMPLETE' ? '完整读取' : '部分读取'} · 暂缺 ${m.observations.filter(o => o.state === 'MISSING_UNCONFIRMED').length} · 明确删除 ${m.observations.filter(o => o.state === 'DELETED_CONFIRMED').length}`).join('；') : '尚无评论快照'}。暂时缺失不会当作删除，原文证据始终保留。</p>
  <h3>命中来源 <span className="muted">最近 50 条</span></h3><div className="source-list">{c.matches.map(m => <article key={m.id}><div className="source-flags"><Badge variant="secondary" className="soft-tag">规则 · {assessmentLabels[m.classification]||m.classification}</Badge><span>{m.isBaseline ? (c.mode === 'MOCK' ? '基线记录' : '首次窗口记录') : '后续命中'}{m.comment.parentPlatformCommentId ? ' · 楼中楼' : ''}</span></div><p>{m.comment.originalText}</p><small>{m.comment.post.title} · 命中：{m.keywords.join('、')}</small><MatchExplanation assessment={m.assessment}/></article>)}{!c.matches.length && <p className="helper-text">暂无命中来源。</p>}</div>
  </div>
 </section>;
}
