import { FormEvent, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { ContactStage, Lead } from '@/lib/types';
import { useWorkspaceMutation } from '@/features/collection/use-collection';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { ErrorNotice } from '@/components/feedback';
export const contactLabels: Record<ContactStage, string> = { MATCHED: '待查看匹配', TO_CONTACT: '待联系', CONTACTED: '人工已联系', INTERESTED: '人工确认有意向', IGNORED: '已忽略' };
export function ContactActions({ lead }: { lead: Lead }) {
    const health = useQuery({ queryKey: ['capabilities'], queryFn: () => api<{ contactWorkflow?: boolean }>('/health'), staleTime: 30000 });
    const mutation = useWorkspaceMutation();
    const [editing, setEditing] = useState(false), [note, setNote] = useState(''), [confirmed, setConfirmed] = useState(false), [feedback, setFeedback] = useState('');
    const [draftVersion, setDraftVersion] = useState(lead.version);
    const stage = lead.contactStage || 'MATCHED';
    const supported = health.data?.contactWorkflow === true;
    const save = (target: ContactStage) => mutation.mutate({ path: `/leads/${lead.id}/contact`, method: 'PATCH', body: { stage: target, version: editing ? draftVersion : lead.version, ...(editing ? { note, confirmed } : {}) } }, { onSuccess: () => { setEditing(false); setNote(''); setConfirmed(false); setFeedback(`已保存：${contactLabels[target]}。未发送任何平台消息。`); } });
    const submit = (e: FormEvent) => { e.preventDefault(); save(stage === 'CONTACTED' ? 'INTERESTED' : 'CONTACTED'); };
    return <div className="contact-actions"><ErrorNotice error={mutation.error || health.error}/>{!supported && !health.isPending && <p className="helper-text">联系状态需要新版 API 和数据库迁移。当前服务保持运行，可先查看来源；请完成试用后按升级说明重启。</p>}
      <div className="action-row">{stage === 'MATCHED' && <Button size="sm" disabled={!supported || mutation.isPending} onClick={() => save('TO_CONTACT')}>加入待联系</Button>}{['MATCHED', 'TO_CONTACT'].includes(stage) && <Button size="sm" variant="ghost" disabled={!supported || mutation.isPending} onClick={() => save('IGNORED')}>忽略</Button>}{stage === 'IGNORED' && <Button size="sm" variant="outline" disabled={!supported || mutation.isPending} onClick={() => save('MATCHED')}>恢复到匹配评论</Button>}{['TO_CONTACT', 'CONTACTED'].includes(stage) && !editing && <Button size="sm" disabled={!supported || mutation.isPending} onClick={() => { setDraftVersion(lead.version); setEditing(true); }}>{stage === 'CONTACTED' ? '记录有意向依据' : '记录已人工联系'}</Button>}</div>
      {editing && <form className="contact-form" onSubmit={submit}><p>本系统不会发送消息。仅当你已自行在平台完成联系后，才记录此状态。规则匹配不代表确定意向。</p><label>实际沟通依据<Textarea aria-label={`实际沟通依据-${lead.id}`} value={note} onChange={e => setNote(e.target.value)} minLength={5} maxLength={2000} required placeholder={stage === 'CONTACTED' ? '记录对方实际表达意向的回复' : '记录你已自行联系的方式及实际情况'}/></label><label className="check-label"><input type="checkbox" checked={confirmed} onChange={e => setConfirmed(e.target.checked)} required/>我确认已自行在平台联系；此处只保存记录</label><div className="action-row"><Button size="sm" disabled={!confirmed || note.trim().length < 5 || mutation.isPending}>仅保存人工记录</Button><Button type="button" size="sm" variant="ghost" onClick={() => setEditing(false)}>取消</Button></div></form>}
      {feedback && <p role="status" className="success-note">{feedback}</p>}{lead.contactNote && <p className="helper-text">人工记录：{lead.contactNote}</p>}
    </div>;
}
