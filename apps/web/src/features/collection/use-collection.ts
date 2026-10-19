import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, send } from '@/lib/api';
import type { Config, ConfigDetail, Notice } from './types';
export function useConfigs(enabled: boolean) { return useQuery({ queryKey: ['collection'], queryFn: () => api<Config[]>('/collection/configs'), enabled }); }
export function useConfig(id: string | undefined) { return useQuery({ queryKey: ['collection', id], queryFn: () => api<ConfigDetail>(`/collection/configs/${id}`), enabled: !!id }); }
export function useNotices() { return useQuery({ queryKey: ['notices'], queryFn: () => api<Notice[]>('/notices') }); }
export function useWorkspaceMutation<T = unknown>() {
    const client = useQueryClient();
    return useMutation({ mutationFn: ({ path, method = 'POST', body = {} }: {
            path: string;
            method?: string;
            body?: unknown;
        }) => send<T>(path, method, body), onSuccess: async () => { await Promise.all(['collection', 'notices', 'leads', 'lead', 'tasks'].map(key => client.invalidateQueries({ queryKey: [key] }))); } });
}
