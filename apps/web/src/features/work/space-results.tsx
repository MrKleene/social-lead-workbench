import {InfoSection} from '@/components/information-panel';
import { sourceModeLabel } from '@/features/collection/mode';
import { ChevronLeft, ChevronRight, Search, RefreshCw, ArrowUpRight } from 'lucide-react';
import { Link } from 'react-router-dom';
import { ErrorNotice, Loading } from '@/components/feedback';
import { Button } from '@/components/ui/button';
import { contactLabels } from '@/features/leads/contact-actions';
import { platformLabel } from '@/lib/types';
import type { SpatialState } from './use-spatial-work';
export function SpaceResults({ state:s }: { state:SpatialState }) {
  const {work:w}=s;
  const unavailable=w.leads.isError||(s.view==='follow'&&w.tasks.isError),pending=w.leads.isPending||(s.view==='follow'&&w.tasks.isPending);
  return <section className="space-results" aria-label="当前页评论线索">
    <div className="space-results-heading"><h2>{s.active==='follow'?'销售跟进':'线索池'}</h2><button aria-label="刷新线索" onClick={()=>{void w.leads.refetch();void w.tasks.refetch();}}><RefreshCw size={16}/></button></div>
    <div className="space-filters"><select aria-label="线索队列" value={s.view} onChange={e=>s.setView(e.target.value)}>{[['new','匹配评论',w.fresh.length],['waiting','待联系',w.waiting.length],['contacted','已联系 / 有意向',w.contacted.length],['ignored','已忽略',w.ignored.length],['follow','销售跟进',w.follow.length]].map(([value,label,count])=><option key={value} value={value}>{label} · {w.leads.isError||w.leads.isPending||value==='follow'&&(w.tasks.isError||w.tasks.isPending)?'—':count}</option>)}</select><label className="space-search-small"><Search size={15}/><input aria-label="搜索待处理" placeholder="搜索昵称、需求或原文" value={w.search} onChange={e=>w.setSearch(e.target.value)}/></label>{s.admin&&<label className="space-check"><input type="checkbox" checked={w.unassigned} onChange={e=>w.setUnassigned(e.target.checked)}/>仅未分配</label>}</div>
    {w.sourceUpdates>0&&<button className="source-update" onClick={w.applySources}>{w.sourceUpdates} 条来源已更新 · 点击应用</button>}
    <ErrorNotice error={w.leads.error||w.tasks.error||w.mutation.error||w.users.error}/>{w.feedback&&<p role="status" className="success-note">{w.feedback}</p>}
    {s.admin&&<button className="aurora-archive-link" onClick={()=>s.openModule('archive')}>打开采集信息 · 查看原文 →</button>}
    <div className="space-result-list">
      {pending?<Loading/>:unavailable?<Button variant="outline" onClick={()=>{void w.leads.refetch();void w.tasks.refetch();}}>重试读取线索</Button>:s.rows.length?s.rows.map(lead=>{
        const comment=lead.identity.comments?.find(c=>c.matches?.length);
        return <article data-lead-id={lead.id} className={`space-result${s.id===lead.id?' selected':''}`} key={lead.id}>
          {s.admin&&['contacted','follow'].includes(s.view)&&<input className="result-select" type="checkbox" aria-label={`选择${lead.identity.nickname}`} checked={Object.hasOwn(w.selected,lead.id)} onChange={()=>w.toggle(lead)}/>}
          <button className="result-open" onClick={()=>s.openLead(lead.id)} aria-label={`查看${lead.identity.nickname}来源`} aria-current={s.id===lead.id?'true':undefined}><span className="result-avatar">{lead.identity.nickname.slice(-1)}</span><span className="result-copy"><span className="result-name">{lead.identity.nickname}<small>{platformLabel[lead.identity.platform]}</small></span><span className="result-text">{comment?.originalText||lead.evidence}</span><span className="result-meta">{contactLabels[lead.contactStage||'MATCHED']} · {sourceModeLabel(lead.identity.platformUserId, lead.isDemo)}</span></span><ChevronRight size={18}/></button>
        </article>;
      }):<div className="space-empty"><h3>当前没有符合筛选的线索</h3><p>{s.admin?'调整筛选，或前往采集信息查看已保存的评论。':'调整筛选，或等待管理员分配线索。'}</p></div>}
    </div>
    {!pending&&!unavailable&&<div className="space-pagination"><button aria-label="上一页" disabled={s.page===0} onClick={()=>s.setPage(s.page-1)}><ChevronLeft size={18}/></button><span>{s.page+1} / {s.pages}</span><button aria-label="下一页" disabled={s.page+1>=s.pages} onClick={()=>s.setPage(s.page+1)}><ChevronRight size={18}/></button><small>{w.rows.length} 条 · 每页3条</small></div>}
    {s.admin&&!pending&&!unavailable&&['contacted','follow'].includes(s.view)&&<InfoSection className="space-batch" title={<>批量交给销售 · 已选 {w.chosen.length}</>}><div><Button size="sm" variant="ghost" onClick={w.selectVisible}>选择当前结果（最多50）</Button><Button size="sm" variant="ghost" onClick={w.clearSelection}>清空</Button><select aria-label="批量销售负责人" value={w.owner} onChange={e=>w.setOwner(e.target.value)}><option value="">选择销售负责人</option>{w.sales.map(u=><option value={u.id} key={u.id}>{u.name}</option>)}</select><Button disabled={!w.chosen.length||!w.owner||w.mutation.isPending} onClick={w.assign}>批量分配</Button></div></InfoSection>}
    <Link className="space-all" to="/leads">查看全部线索 <ArrowUpRight size={14}/></Link>
  </section>;
}
