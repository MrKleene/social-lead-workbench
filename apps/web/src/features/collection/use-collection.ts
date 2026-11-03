import {useJourneyPolling} from '@/lib/use-events';
import { useEffect, useRef } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, send } from '@/lib/api';
import { shouldRefreshRun } from './mode';
import type { Config, ConfigDetail, Notice, McpReadiness } from './types';
export function useMcpReadiness(enabled = true) { return useQuery({ queryKey: ['mcp-readiness'], queryFn: () => api<McpReadiness>('/collection/mcp/readiness'), enabled, retry: false, refetchInterval: enabled ? 10000 : false, refetchIntervalInBackground:false }); }
export function useConfigs(enabled: boolean) {const poll=useJourneyPolling();
    const client = useQueryClient(), completed = useRef(new Set<string>());
    const query = useQuery({ queryKey: ['collection'], queryFn: () => api<Config[]>('/collection/configs'), enabled,
        // Only local job status: never schedules or repeats platform collection. Stop after three minutes.
        refetchInterval: q => q.state.data?.some(c => shouldRefreshRun(c, Date.now())) ? poll : false,
        refetchIntervalInBackground: false });
    useEffect(() => {
        const fresh = (query.data || []).flatMap(c => c.runs).filter(r => !['QUEUED','RUNNING'].includes(r.status) && !completed.current.has(r.id));
        if (!fresh.length) return;
        fresh.forEach(r => completed.current.add(r.id));
        void Promise.all(['notices','leads','lead','tasks'].map(key => client.invalidateQueries({queryKey:[key]})));
    }, [query.data, client]);
    return query;
}
export function useRefreshCollection() {
    const client = useQueryClient();
    return () => Promise.all(['collection','notices','leads','tasks'].map(key => client.invalidateQueries({queryKey:[key]})));
}
export function useConfig(id: string | undefined) { return useQuery({ queryKey: ['collection', id], queryFn: () => api<ConfigDetail>(`/collection/configs/${id}`), enabled: !!id }); }
export function useNotices() { return useQuery({ queryKey: ['notices'], queryFn: () => api<Notice[]>('/notices') }); }
export function useWorkspaceMutation<T = unknown>() {
    const client = useQueryClient();
    return useMutation({ mutationFn: async ({ path, method = 'POST', body = {}, onResponse }: {
            path: string;
            method?: string;
            body?: unknown;
            onResponse?: (result:T)=>void;
        }) => {const result=await send<T>(path, method, body);onResponse?.(result);return result;}, onSuccess: async () => { await Promise.all(['accounts', 'account-contact', 'collection', 'notices', 'leads', 'lead', 'tasks', 'mcp-readiness'].map(key => client.invalidateQueries({ queryKey: [key] }))); } });
}
