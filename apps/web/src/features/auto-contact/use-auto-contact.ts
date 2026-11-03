import {useJourneyPolling} from '@/lib/use-events';
import {contactPagination} from './contact-pagination';
import {accountReadyForRule} from './account-ready';
import { useEffect, useRef, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { autoContactConsent, type AutoContactOverview, type AutoContactRuleInput, type AutoContactJobView } from '@crm/contracts';
import { api, send } from '@/lib/api';
export function useAutoContact(enabled: boolean, runId?:string) {const poll=useJourneyPolling();
    const client = useQueryClient(), [offset, setOffset] = useState(0), [status, setStatus] = useState(''), [draft, setDraft] = useState<AutoContactRuleInput | null>(null), [confirm, setConfirm] = useState(false), [detail, setDetail] = useState<AutoContactJobView | null>(null), trigger = useRef<HTMLElement | null>(null);
    const overview = useQuery({ queryKey: ['auto-contact'], queryFn: () => api<AutoContactOverview>('/auto-contact'), enabled, refetchInterval: poll });
    const jobs = useQuery({ queryKey: ['auto-contact-jobs', offset, status, runId], queryFn: ({signal}) => api<{
            items: AutoContactJobView[];
            total: number;
        }>(`/auto-contact/jobs?offset=${offset}${status ? '&status=' + status : ''}${runId?'&runId='+encodeURIComponent(runId):''}`,{signal}), enabled, refetchInterval: poll });
    useEffect(()=>{if(jobs.isFetching||!jobs.data||jobs.isError)return;const last=contactPagination(jobs.data.total,offset).last;if(offset>last)setOffset(last);},[jobs.data?.total,jobs.isFetching,jobs.isError,offset]);
    const rule = overview.data?.rules[0], refresh = () => Promise.all([client.invalidateQueries({ queryKey: ['auto-contact'] }), client.invalidateQueries({ queryKey: ['auto-contact-jobs'] }), client.invalidateQueries({ queryKey: ['accounts'] })]);
    const canEnable = Boolean(overview.data?.capability.available && rule?.content.trim() && rule.accountIds.length && !rule.pauseReason && rule.accountIds.every(id => {
        const account = overview.data?.accounts.find(a => a.id === id);
        return accountReadyForRule(account,rule.mode);
    }));
    const save = useMutation({ mutationFn: () => send(`/auto-contact/rules/${rule?.id ?? 'workspace'}`, 'PUT', draft?{...draft,channels:draft.channel!==rule?.channel?[draft.channel]:draft.channels,...(draft.content!==rule?.content?{templateId:null,templateVersion:null}:{})}:draft), retry: false, onSuccess: async () => { await refresh(); setDraft(null); } });
    const toggle = useMutation({ mutationFn: (enabled: boolean) => { if(enabled&&!canEnable)throw Error('账号受限或发送资格待核验，不能开启自动联系'); return send(`/auto-contact/rules/${rule!.id}/enabled`, 'POST', { version: rule!.version, enabled, ...(enabled ? { consent: autoContactConsent, hash: rule!.hash } : {}) }); }, retry: false, onSuccess: async () => { setConfirm(false); await refresh(); } });
    const cancel = useMutation({ mutationFn: (id: string) => send(`/auto-contact/jobs/${id}/cancel`, 'POST', {}), retry: false, onSuccess: async () => { setDetail(null); await refresh(); } });
    const initialDraft = useRef('');
    const open = () => { trigger.current = document.activeElement as HTMLElement; const d = overview.data; if (!d)
        return; const next:AutoContactRuleInput = { version: rule?.version ?? 0, platform: rule?.platform ?? 'XHS', policyId: rule?.policyId ?? d.policies[0]?.id ?? '', policyRevision: rule?.policyRevision ?? d.policies[0]?.revision ?? 1, threshold: rule?.threshold ?? 80, channel: rule?.channel ?? 'COMMENT', channels:rule?.channels??[rule?.channel??'COMMENT'],templateId:rule?.templateId??null,templateVersion:rule?.templateVersion??null, content: rule?.content ?? '', accounts: rule?.accountIds.map(id => ({ id, version: d.accounts.find(a => a.id === id)?.version ?? 0, dailyLimit: rule.accountLimits.find(a => a.id === id)?.dailyLimit ?? d.accounts.find(a => a.id === id)?.dailyLimit ?? 0 })) ?? [] }; initialDraft.current=JSON.stringify(next); setDraft(next); save.reset(); };
    return { dirty:!!draft&&JSON.stringify(draft)!==initialDraft.current, canEnable, overview, jobs, rule, offset, setOffset, status, setStatus: (s: string) => { setStatus(s); setOffset(0); }, draft, setDraft, confirm, setConfirm, detail:detail?(jobs.data?.items.find(j=>j.id===detail.id)??detail):null, setDetail, trigger, open, save, toggle, cancel, busy: save.isPending || toggle.isPending || cancel.isPending };
}
