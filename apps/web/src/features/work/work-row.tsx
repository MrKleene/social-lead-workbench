import {assessmentLabels} from '@crm/contracts';
import { sourceModeLabel } from '@/features/collection/mode';
import { useState, type CSSProperties } from 'react';
import { Link } from 'react-router-dom';
import { Lead, Task, formatDate, platformLabel } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { ContactActions, contactLabels } from '@/features/leads/contact-actions';
import { QuickTask } from './quick-task';
import { QuickFollowup } from './quick-followup';
export function WorkRow({ index, lead, admin, selected, onSelect, view, tasks, onTaskDone }: {
    index: number; lead: Lead; admin: boolean; selected: boolean; onSelect: () => void; view: string; tasks: Task[]; onTaskDone: (title: string) => void;
}) {
    const [quick, setQuick] = useState(false);
    const handoff = ['CONTACTED', 'INTERESTED'].includes(lead.contactStage || '');
    const path = `/work/${lead.id}${view === 'new' ? '' : `?view=${view}`}`;
    const comments = lead.identity.comments || [];
    const matched = comments.filter(c => c.matches?.length);
    return <article className="work-row" style={{ '--row-delay': `${Math.min(index, 6) * 35}ms` } as CSSProperties} data-lead-id={lead.id}><div className="work-row-main">{admin && (view === 'contacted' || view === 'follow') && <input type="checkbox" aria-label={`选择${lead.identity.nickname}`} checked={selected} onChange={onSelect}/>}
      <div className="work-row-content"><div className="comment-identity"><Link className="lead-name text-link" to={path}>{lead.identity.nickname}</Link><span className="soft-tag">{platformLabel[lead.identity.platform]}</span><span className="soft-tag">{contactLabels[lead.contactStage || 'MATCHED']}</span>{<span className="soft-tag">{sourceModeLabel(lead.identity.platformUserId, lead.isDemo)}</span>}</div>
      {matched.length ? matched.slice(0, 1).map(c => <blockquote key={c.id}><strong>帖子：{c.post.title}</strong><p>{c.originalText}</p>{c.parentPlatformCommentId && <small>楼中楼回复 · </small>}<small>规则匹配：{c.matches?.map(m => `${m.keywords.join('、')}（${m.classification === 'POSSIBLE_HELP' ? '可能求助' : '仅专业相关'}）`).join('；')}</small></blockquote>) : <blockquote><p>{lead.evidence}</p><small>来源与完整规则依据请打开详情查看。</small></blockquote>}
      <p className="helper-text">规则匹配只是潜在相关，不代表确定意向或同意联系。</p><div className="comment-actions"><div className="action-row"><Button variant="outline" size="sm" asChild><Link to={path}>查看来源详情{matched.length > 1 ? `（${matched.length}条）` : ''}</Link></Button>{handoff && admin && <Button size="sm" asChild><Link to={path}>交给销售</Link></Button>}</div><ContactActions lead={lead}/></div>
      <details className="secondary-actions"><summary>{handoff || view === 'follow' ? '销售协作与沟通记录' : '更多：负责人、沟通记录与旧任务'}</summary><p>{lead.owner?.name || '尚未交给销售'} · 下次跟进 {formatDate(lead.nextFollowUpAt)}</p><p className="helper-text">负责人用于团队分工；沟通记录只保存实际情况和下次时间，不发送消息。</p><Button size="sm" variant="outline" onClick={() => setQuick(v => !v)}>{quick ? '收起记录' : '添加沟通记录'}</Button>{quick && <QuickFollowup lead={lead} onClose={() => setQuick(false)}/>}<Button size="sm" variant="ghost" asChild><Link to={path}>负责人及详细记录</Link></Button>{tasks.map(task => <QuickTask key={task.id} task={task} onDone={onTaskDone}/>)}</details></div></div></article>;
}
