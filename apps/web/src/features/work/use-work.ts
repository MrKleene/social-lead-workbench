import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Lead, Task, User } from '@/lib/types';
import { useStableResults } from './use-stable-results';
import { useReplyTemplates } from '@/features/replies/use-replies';
import { useConfigs, useNotices, useWorkspaceMutation } from '@/features/collection/use-collection';
export function useWork(admin: boolean, view: string) {
    const leads = useQuery({ queryKey: ['leads'], queryFn: () => api<Lead[]>('/leads') });
    const tasks = useQuery({ queryKey: ['tasks'], queryFn: () => api<Task[]>('/tasks') });
    const users = useQuery({ queryKey: ['users'], queryFn: () => api<User[]>('/users'), enabled: admin });
    const configs = useConfigs(admin);
    const notices = useNotices();
    const mutation = useWorkspaceMutation();
    const [search, setSearch] = useState(''), [unassigned, setUnassigned] = useState(false), [selected, setSelected] = useState<Record<string, number>>({}), [owner, setOwner] = useState(''), [feedback, setFeedback] = useState('');
    const stable = useStableResults(leads.isError ? undefined : leads.data);
    const templates = useReplyTemplates(admin);
    const all = stable.all;
    const pendingTasks = (tasks.data || []).filter(t => t.status === 'PENDING');
    const pendingIds = new Set(pendingTasks.map(t => t.lead.id));
    const fresh = all.filter(l => (l.contactStage || 'MATCHED') === 'MATCHED' && l.status !== 'CLOSED');
    const waiting = all.filter(l => l.contactStage === 'TO_CONTACT');
    const contacted = all.filter(l => ['CONTACTED', 'INTERESTED'].includes(l.contactStage || ''));
    const ignored = all.filter(l => l.contactStage === 'IGNORED');
    const follow = all.filter(l => pendingIds.has(l.id) || (l.status !== 'CLOSED' && (l.status === 'FOLLOWING' || !!l.nextFollowUpAt)));
    const exceptions = (configs.data || []).filter(c => c.pauseReason || ['FAILED', 'PARTIAL'].includes(c.runs[0]?.status));
    const groups: Record<string, Lead[]> = { new: fresh, waiting, contacted, ignored, follow };
    const rows = (groups[view] || fresh).filter(l => (!unassigned || !l.owner) && `${l.identity.nickname} ${l.summary} ${l.evidence}`.includes(search));
    const chosen = rows.filter(l => Object.hasOwn(selected, l.id));
    const toggle = (lead: Lead) => setSelected(s => { const next = { ...s }; if (Object.hasOwn(next, lead.id))
        delete next[lead.id];
    else if (Object.keys(next).length < 50)
        next[lead.id] = lead.version; return next; });
    const selectVisible = () => setSelected(Object.fromEntries(rows.slice(0, 50).map(l => [l.id, l.version])));
    const assign = () => mutation.mutate({ path: '/leads/batch-owner', method: 'PATCH', body: { ownerId: owner, items: chosen.map(l => ({ id: l.id, version: selected[l.id] })) } }, { onSuccess: () => { setFeedback(`已分配 ${chosen.length} 条线索`); setSelected({}); } });
    return { sourceUpdates: stable.sourceUpdates, applySources: stable.applySources, templates, leads, tasks, users, configs, notices, mutation, rows, fresh, waiting, contacted, ignored, follow, exceptions, pendingTasks, search, setSearch: (value: string) => { setSearch(value); setSelected({}); }, unassigned, setUnassigned: (value: boolean) => { setUnassigned(value); setSelected({}); }, selected, toggle, selectVisible, chosen, owner, setOwner, assign, feedback, setFeedback, clearSelection: () => setSelected({}), sales: (users.data || []).filter(u => u.role === 'SALES') };
}
