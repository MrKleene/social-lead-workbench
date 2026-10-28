import {Pager} from '@/components/pager';
import { FormField } from '@/components/form-field';
import { SelectField, SelectOption } from '@/components/select-field';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Empty } from '@/components/ui/empty';
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
    <div className="space-results-heading"><h2>{s.active==='follow'?'销售跟进':'线索池'}</h2><Button variant="ghost" size="content" aria-label="刷新线索" onClick={()=>{void w.leads.refetch();void w.tasks.refetch();}}><RefreshCw size={16}/></Button></div>
    <div className="space-filters"><SelectField aria-label="线索队列" value={s.view} onValueChange={e=>s.setView(e)}>{[['new','匹配评论',w.fresh.length],['waiting','待联系',w.waiting.length],['contacted','已联系 / 有意向',w.contacted.length],['ignored','已忽略',w.ignored.length],['follow','销售跟进',w.follow.length]].map(([value,label,count])=><SelectOption key={value} value={value}>{label} · {w.leads.isError||w.leads.isPending||value==='follow'&&(w.tasks.isError||w.tasks.isPending)?'—':count}</SelectOption>)}</SelectField><FormField className="space-search-small"><Search size={15}/><Input aria-label="搜索待处理" placeholder="搜索昵称、需求或原文" value={w.search} onChange={e=>w.setSearch(e.target.value)}/></FormField>{s.admin&&<FormField className="space-check"><Checkbox  checked={w.unassigned} onCheckedChange={e=>w.setUnassigned((e === true))}/>仅未分配</FormField>}</div>
    {w.sourceUpdates>0&&<Button variant="ghost" size="content" className="source-update" onClick={w.applySources}>{w.sourceUpdates} 条来源已更新 · 点击应用</Button>}
    <ErrorNotice error={w.leads.error||w.tasks.error||w.mutation.error||w.users.error}/>{w.feedback&&<p role="status" className="success-note">{w.feedback}</p>}
    {s.admin&&<Button variant="ghost" size="content" className="aurora-archive-link" onClick={()=>s.openModule('archive')}>打开采集信息 · 查看原文 →</Button>}
    <div className="space-result-list">
      {pending?<Loading/>:unavailable?<Button variant="outline" onClick={()=>{void w.leads.refetch();void w.tasks.refetch();}}>重试读取线索</Button>:s.rows.length?s.rows.map(lead=>{
        const comment=lead.identity.comments?.find(c=>c.matches?.length);
        return <article data-lead-id={lead.id} className={`space-result${s.id===lead.id?' selected':''}`} key={lead.id}>
          {s.admin&&['contacted','follow'].includes(s.view)&&<Checkbox className="result-select"  aria-label={`选择${lead.identity.nickname}`} checked={Object.hasOwn(w.selected,lead.id)} onCheckedChange={()=>w.toggle(lead)}/>}
          <Button variant="ghost" size="content" className="result-open" onClick={()=>s.openLead(lead.id)} aria-label={`查看${lead.identity.nickname}来源`} aria-current={s.id===lead.id?'true':undefined}><span className="result-avatar">{lead.identity.nickname.slice(-1)}</span><span className="result-copy"><span className="result-name">{lead.identity.nickname}<small>{platformLabel[lead.identity.platform]}</small></span><span className="result-text">{comment?.originalText||lead.evidence}</span><span className="result-meta">{contactLabels[lead.contactStage||'MATCHED']} · {sourceModeLabel(lead.identity.platformUserId, lead.isDemo)}</span></span><ChevronRight size={18}/></Button>
        </article>;
      }):<Empty className="space-empty"><h3>当前没有符合筛选的线索</h3><p>{s.admin?'调整筛选，或前往采集信息查看已保存的评论。':'调整筛选，或等待管理员分配线索。'}</p></Empty>}
    </div>
    {!pending&&!unavailable&&<Pager className="space-pagination"><Button variant="ghost" size="content" aria-label="上一页" disabled={s.page===0} onClick={()=>s.setPage(s.page-1)}><ChevronLeft size={18}/></Button><span>{s.page+1} / {s.pages}</span><Button variant="ghost" size="content" aria-label="下一页" disabled={s.page+1>=s.pages} onClick={()=>s.setPage(s.page+1)}><ChevronRight size={18}/></Button><small>{w.rows.length} 条 · 每页3条</small></Pager>}
    {s.admin&&!pending&&!unavailable&&['contacted','follow'].includes(s.view)&&<InfoSection className="space-batch" title={<>批量交给销售 · 已选 {w.chosen.length}</>}><div><Button size="sm" variant="ghost" onClick={w.selectVisible}>选择当前结果（最多50）</Button><Button size="sm" variant="ghost" onClick={w.clearSelection}>清空</Button><SelectField aria-label="批量销售负责人" value={w.owner} onValueChange={e=>w.setOwner(e)}><SelectOption value="">选择销售负责人</SelectOption>{w.sales.map(u=><SelectOption value={u.id} key={u.id}>{u.name}</SelectOption>)}</SelectField><Button disabled={!w.chosen.length||!w.owner||w.mutation.isPending} onClick={w.assign}>批量分配</Button></div></InfoSection>}
    <Link className="space-all" to="/leads">查看全部线索 <ArrowUpRight size={14}/></Link>
  </section>;
}
