import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Lead, Task, formatDate, platformLabel, statusLabel } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { QuickTask } from './quick-task';
import { QuickFollowup } from './quick-followup';
export function WorkRow({ lead, admin, selected, onSelect, follow, tasks, onTaskDone }: {
    lead: Lead;
    admin: boolean;
    selected: boolean;
    onSelect: () => void;
    follow: boolean;
    tasks: Task[];
    onTaskDone: (title: string) => void;
}) {
    const [quick, setQuick] = useState(false);
    return <article className="work-row"><div className="work-row-main">{admin && <input type="checkbox" aria-label={`选择${lead.identity.nickname}`} checked={selected} onChange={onSelect}/>}
 <span className="avatar">{lead.identity.nickname.slice(0, 1)}</span><div className="work-row-content"><Link className="lead-name text-link" to={`/work/${lead.id}${follow ? '?view=follow' : ''}`}>{lead.identity.nickname}</Link><span className="soft-tag">{platformLabel[lead.identity.platform]}</span><span className="soft-tag">{statusLabel[lead.status]}</span>{lead.isDemo && <span className="soft-tag">虚构</span>}<p>{lead.summary}</p><blockquote>{lead.evidence}</blockquote></div><div className="work-next"><strong>{follow ? '下一步 · 完成跟进' : lead.reviewedAt ? '下一步 · 分配负责人' : '下一步 · 核验来源'}</strong><span>{lead.owner?.name || '等待分配'} · {formatDate(lead.nextFollowUpAt)}</span><div className="action-row"><Button variant="outline" size="sm" asChild><Link to={`/work/${lead.id}${follow ? '?view=follow' : ''}`}>来源 / 分配</Link></Button><Button size="sm" onClick={() => setQuick(v => !v)}>{quick ? '收起跟进' : '快速跟进'}</Button></div></div></div>{follow && tasks.map(task => <QuickTask key={task.id} task={task} onDone={onTaskDone}/>)}{quick && <QuickFollowup lead={lead} onClose={() => setQuick(false)}/>}</article>;
}
