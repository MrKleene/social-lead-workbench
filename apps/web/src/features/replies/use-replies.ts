import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, send } from '@/lib/api';
export type ReplyTemplate = { id: string; name: string; channel: 'COMMENT' | 'DM'; body: string; version: number; _count?: { configs: number } };
export type ReplyPreview = { text: string; missing: string[]; unknown: string[]; source?: string; name?: string; channel?: 'COMMENT' | 'DM'; sent: false };
export function useReplyTemplates(enabled = true) { return useQuery({ queryKey: ['reply-templates'], queryFn: () => api<ReplyTemplate[]>('/reply-templates'), enabled }); }
export function useReplyMutation() {
  const client = useQueryClient();
  return useMutation({ mutationFn: ({ path, method, body }: { path: string; method: string; body: unknown }) => send(path, method, body), onSuccess: async () => { await Promise.all(['reply-templates','reply-preview','collection'].map(k => client.invalidateQueries({ queryKey: [k] }))); } });
}
export function useReplyPreview() { return useMutation({ mutationFn: (body: { body: string; leadId?: string }) => send<ReplyPreview>('/reply-templates/preview', 'POST', body) }); }
export function useLeadReply(id: string) { return useQuery({ queryKey: ['reply-preview', id], queryFn: () => api<ReplyPreview[]>(`/reply-templates/for-lead/${id}`), retry: false }); }
