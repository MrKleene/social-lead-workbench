import { useCallback, useState, useRef } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Inbox, Bell, ShieldCheck } from 'lucide-react';
import { useAuth } from '@/features/auth/use-auth';
import { LeadDetail } from '@/features/leads/lead-detail';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ErrorNotice, Loading } from '@/components/feedback';
import { SegmentedControl } from '@/components/segmented-control';
import { reasonLabels, runLabels } from '@/features/collection/types';
import { useWork } from './use-work';
import { WorkRow } from './work-row';
import { WorkModules } from './work-modules';
import { CollectionLauncher } from './collection-launcher';
export function WorkPage() {
    const { user } = useAuth();
    const admin = user?.role === 'ADMIN';
    const [params, setParams] = useSearchParams();
    const view = params.get('view') || 'new';
    const state = useWork(admin, view);
    const { id } = useParams();
    const navigate = useNavigate();
    const close = useCallback(() => navigate(`/work${view === 'new' ? '' : `?view=${view}`}`), [navigate, view]);
    const [allNotices, setAllNotices] = useState(false);
    const [runsOpen, setRunsOpen] = useState(false);
    const queueHeading = useRef<HTMLHeadingElement>(null);
    const [pagination, setPagination] = useState({ key: '', page: 0 });
    const pageKey = `${view}:${state.search}:${state.unassigned}`;
    const page = Math.min(pagination.key === pageKey ? pagination.page : 0, Math.max(0, Math.ceil(state.rows.length / 20) - 1));
    const pageRows = state.rows.slice(page * 20, page * 20 + 20);
    const showQueue = (next: string) => { state.clearSelection(); setParams(next === 'new' ? {} : { view: next }); queueHeading.current?.focus(); queueHeading.current?.scrollIntoView({ block: 'start', behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches || document.documentElement.dataset.crmReduced === 'true' ? 'auto' : 'smooth' }); };
    const unread = (state.notices.data || []).filter(n => !n.reads.length);
    return <><div className="page-heading work-heading"><div><h1>找线索工作台</h1><p>查看原文，保留人的判断。</p></div><span className="simulation-label"><ShieldCheck size={16}/>模拟模式 · 真实采集与发送禁用</span></div>
 {admin && <CollectionLauncher key={params.get('config') || 'default'} configs={state.configs.data || []} loading={state.configs.isPending} initialId={params.get('config')} runsOpen={runsOpen} onRuns={() => setRunsOpen(open => !open)}/>}
 <WorkModules admin={admin} configs={state.configs.data?.filter(c => c.enabled).length || 0} active={state.configs.data?.filter(c => c.activeRunId).length || 0} matches={state.fresh.length} templates={state.templates.data?.length} follow={state.follow.length} runsOpen={runsOpen} onRuns={() => setRunsOpen(open => !open)} onQueue={showQueue}/>
 <details className="first-use-guide"><summary>第一次使用？了解操作流程</summary><p>搜索设置 → 开始找线索 → 查看匹配评论 → 加入待联系或忽略 → 自行在平台联系后记录事实 → 确认意向并交给销售。话术仅预览，LLM 未接入；所有演示用户与数据均为虚构。</p></details>
 <div className="work-layout"><section className="table-panel work-panel"><div className="list-heading"><div><h2 ref={queueHeading} tabIndex={-1}>匹配评论与联系处理</h2><p>仅显示你有权访问的线索；规则命中不代表联系同意。</p></div><Button variant="ghost" onClick={() => { void state.leads.refetch(); void state.tasks.refetch(); void state.notices.refetch(); if (admin) {
        void state.configs.refetch();
        void state.users.refetch();
    } }}>刷新</Button></div>
 <div className="stable-update-bar"><span>{state.sourceUpdates ? `${state.sourceUpdates} 条来源有更新，当前内容保持稳定` : '新线索追加到末尾 · 每页 20 条 · 已有来源不自动展开'}</span><Button size="sm" variant="ghost" disabled={!state.sourceUpdates} onClick={state.applySources}>应用来源更新</Button></div><div className="work-controls"><SegmentedControl label="待处理分类" value={view} onChange={v => { state.clearSelection(); setParams(v === 'new' ? {} : { view: v }); }} options={[{ value: 'new', label: `匹配评论 ${state.fresh.length}` }, { value: 'waiting', label: `待联系 ${state.waiting.length}` }, { value: 'contacted', label: `已联系 / 有意向 ${state.contacted.length}` }, { value: 'ignored', label: `已忽略 ${state.ignored.length}` }, { value: 'follow', label: `销售跟进 ${state.follow.length}` }, ...(admin ? [{ value: 'exceptions', label: `异常任务 ${state.exceptions.length}` }] : [])]}/>{view !== 'exceptions' && <div className="action-row"><Input aria-label="搜索待处理" placeholder="搜索需求、昵称或原文" value={state.search} onChange={e => state.setSearch(e.target.value)}/>{admin && <Button variant={state.unassigned ? 'secondary' : 'ghost'} aria-pressed={state.unassigned} onClick={() => state.setUnassigned(!state.unassigned)}>仅未分配</Button>}</div>}</div>
 <ErrorNotice error={state.leads.error || state.tasks.error || state.configs.error || state.mutation.error || state.users.error}/>{state.feedback && <p role="status" className="success-note">{state.feedback}</p>}
 {view === 'exceptions' ? <div className="exception-list">{state.exceptions.length ? state.exceptions.map(c => <article key={c.id}><div><strong>{c.name}</strong><p>{reasonLabels[c.pauseReason || c.runs[0]?.reason || ''] || runLabels[c.runs[0]?.status] || '待检查'}</p><small>下一步：检查原因后手动恢复；不会自动切换账号。</small></div><Button asChild variant="outline"><Link to={`/work?config=${c.id}`}>查看采集进度</Link></Button></article>) : <div className="empty-state"><h3>暂无异常任务</h3><p>失败和分页不完整会显示在这里。</p></div>}</div> : <>
 {admin && (view === 'contacted' || view === 'follow') && <details className="secondary-actions"><summary>批量交给销售</summary><div className="batch-toolbar"><Button size="sm" variant="ghost" onClick={state.selectVisible} disabled={!state.rows.length}>选择当前结果（最多50）</Button><span>已选 {state.chosen.length}</span>{state.chosen.length > 0 && <Button variant="ghost" size="sm" onClick={state.clearSelection}>清空</Button>}<select aria-label="批量销售负责人" value={state.owner} onChange={e => state.setOwner(e.target.value)}><option value="">选择销售负责人</option>{state.sales.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}</select><Button size="sm" disabled={!state.chosen.length || !state.owner || state.mutation.isPending} onClick={state.assign}>批量分配</Button>{!state.users.isPending && !state.sales.length && <small>尚无销售账号，可先查看来源。</small>}</div></details>}
 {state.leads.isPending ? <Loading /> : pageRows.length ? pageRows.map((lead, index) => <WorkRow index={index} key={lead.id} lead={lead} admin={admin} view={view} tasks={state.pendingTasks.filter(t => t.lead.id === lead.id)} onTaskDone={title => state.setFeedback(`任务已完成：${title}`)} selected={Object.hasOwn(state.selected, lead.id)} onSelect={() => state.toggle(lead)}/>) : <div className="empty-state"><Inbox /><h3>当前队列已处理完毕</h3><p>调整筛选，或开始一轮模拟查找。</p></div>}<div className="table-footer"><div className="queue-pagination"><Button variant="ghost" size="sm" disabled={page === 0} onClick={() => setPagination({ key: pageKey, page: page - 1 })}>上一页</Button><span>{page + 1} / {Math.max(1, Math.ceil(state.rows.length / 20))}</span><Button variant="ghost" size="sm" disabled={(page + 1) * 20 >= state.rows.length} onClick={() => setPagination({ key: pageKey, page: page + 1 })}>下一页</Button></div>{state.rows.length} 条当前结果 · 最多读取 500 条可访问线索 · <Link to="/leads">查看全部线索</Link></div></>}
 </section><aside className="work-aside"><section className="table-panel notice-panel"><h2><Bell size={17}/>新增提醒 <span>{unread.length}</span></h2><ErrorNotice error={state.notices.error}/>{unread.length ? unread.slice(0, allNotices ? 100 : 8).map(n => <article key={n.id}><Link to={`/work/${n.lead.id}`}><strong>{n.lead.identity.nickname}</strong><p>{n.title}</p><span>打开来源与处理 →</span></Link><Button size="sm" variant="ghost" disabled={state.mutation.isPending} onClick={() => state.mutation.mutate({ path: `/notices/${n.id}/read` })}>标为已读</Button></article>) : <p className="helper-text">暂无未读提醒。首次完整读取只建立基线，后续新增才提醒。</p>}{unread.length > 8 && <Button variant="ghost" size="sm" onClick={() => setAllNotices(v => !v)}>{allNotices ? '收起提醒' : '显示全部未读提醒'}</Button>}</section><section className="context-note"><strong>保留人的判断</strong><p>系统按关键词与求助词筛选。来源原文、楼中楼和规则依据在同一详情侧栏查看。</p><p>专业相关 ≠ 明确需求 ≠ 联系同意。</p></section></aside></div>
 {id && <LeadDetail key={id} id={id} onClose={close}/>}</>;
}
