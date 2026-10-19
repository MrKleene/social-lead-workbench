import { useState, useRef, FormEvent } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { ErrorNotice } from '@/components/feedback';
import { Lead } from '@/lib/types';
import { useWorkspaceMutation } from '@/features/collection/use-collection';
function dateValue(value: string | null) { if (!value)
    return ''; const d = new Date(value); return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16); }
export function QuickFollowup({ lead, onClose }: {
    lead: Lead;
    onClose: () => void;
}) {
    const mutation = useWorkspaceMutation();
    const [content, setContent] = useState(''), [stage, setStage] = useState<Lead['status']>(lead.status === 'CLOSED' ? 'CLOSED' : 'FOLLOWING');
    const [version] = useState(lead.version);
    const [saved, setSaved] = useState(false);
    const nextInput = useRef<HTMLInputElement>(null);
    const submit = (e: FormEvent) => { e.preventDefault(); mutation.mutate({ path: `/leads/${lead.id}/followups`, body: { content, nextFollowUpAt: nextInput.current?.value ? new Date(nextInput.current.value).toISOString() : null, status: stage, version } }, { onSuccess: () => setSaved(true) }); };
    return <div className="quick-followup">{saved ? <div role="status" className="action-row"><p className="success-note">跟进、状态和下次时间已保存</p><Button variant="ghost" onClick={onClose}>收起</Button></div> : <form onSubmit={submit}><ErrorNotice error={mutation.error}/><label>快速跟进记录<Textarea aria-label={`跟进${lead.identity.nickname}`} value={content} onChange={e => setContent(e.target.value)} required maxLength={4000} placeholder="记录人工核验或沟通情况，此操作不会发送平台消息"/></label><div className="quick-fields"><label>下次跟进<Input aria-label="快速跟进时间" type="datetime-local" ref={nextInput} defaultValue={dateValue(lead.nextFollowUpAt)}/></label><label>线索状态<select aria-label="快速线索状态" value={stage} onChange={e => setStage(e.target.value as Lead['status'])}><option value="FOLLOWING">跟进中</option><option value="PENDING_REVIEW">待确认</option><option value="CLOSED">已关闭</option></select></label><Button disabled={mutation.isPending}>{mutation.isPending ? '保存中…' : '保存跟进'}</Button><Button type="button" variant="ghost" onClick={onClose}>取消</Button></div><p className="helper-text">保存跟进不代表已核验需求，也不代表取得联系同意。</p></form>}</div>;
}
