import { FormEvent, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { api } from '@/lib/api';
import { Lead } from '@/lib/types';
import { useAuth } from '@/features/auth/use-auth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { ErrorNotice } from '@/components/feedback';
import { ReplyTemplate, useReplyTemplates, useReplyMutation, useReplyPreview } from './use-replies';
import { PreviewText } from './reply-preview';
function TemplateEditor({ item, onSaved }: { item?: ReplyTemplate; onSaved: () => void }) {
  const [name,setName] = useState(item?.name || ''), [channel,setChannel] = useState<'COMMENT'|'DM'>(item?.channel || 'COMMENT'), [body,setBody] = useState(item?.body || ''), [leadId,setLeadId] = useState('');
  const mutation = useReplyMutation(), preview = useReplyPreview();
  const leads = useQuery({ queryKey: ['leads'], queryFn: () => api<Lead[]>('/leads') });
  const resetPreview = () => preview.reset();
  const submit = (e: FormEvent) => { e.preventDefault(); mutation.mutate({ path: `/reply-templates${item ? `/${item.id}` : ''}`, method: item ? 'PATCH' : 'POST', body: item ? { draft: { name,channel,body }, version: item.version } : { name,channel,body } }, { onSuccess: onSaved }); };
  return <form className="config-form table-panel collection-body" onSubmit={submit}><h2>{item ? '编辑话术' : '新增话术'}</h2><ErrorNotice error={mutation.error || preview.error || leads.error}/><label>话术名称<Input value={name} onChange={e => setName(e.target.value)} required maxLength={80}/></label><label>使用渠道<select aria-label="使用渠道" value={channel} onChange={e => setChannel(e.target.value as 'COMMENT'|'DM')}><option value="COMMENT">评论</option><option value="DM">私信</option></select></label><label>话术内容<Textarea value={body} onChange={e => { setBody(e.target.value); resetPreview(); }} required maxLength={2000} rows={5}/></label><p>支持：{['昵称','关键词','帖子标题','平台','专业'].map(f => `{{${f}}}`).join('、')}。专业字段目前未采集，不会根据关键词推断。</p><label>预览来源<select aria-label="预览来源" value={leadId} onChange={e => { setLeadId(e.target.value); resetPreview(); }}><option value="">未选择来源（显示缺失字段）</option>{leads.data?.map(l => <option key={l.id} value={l.id}>{l.identity.nickname} · {l.summary}</option>)}</select></label><div className="action-row"><Button type="button" variant="outline" disabled={preview.isPending} onClick={() => preview.mutate({ body, ...(leadId ? { leadId } : {}) })}>预览最终文本</Button><Button disabled={mutation.isPending}>保存话术</Button></div><PreviewText value={preview.data || { text: body, missing: [], unknown: [], source: '草稿原文：点击预览最终文本填充来源字段', sent: false }}/></form>;
}
export function RepliesPage() {
  const { user } = useAuth(), admin = user?.role === 'ADMIN';
  const query = useReplyTemplates(admin), mutation = useReplyMutation();
  const [editing,setEditing] = useState<ReplyTemplate | null>(null), [key,setKey] = useState(0), [feedback,setFeedback] = useState('');
  if (!admin) return <p>仅管理员可管理回复话术。<Link to="/work">返回工作台</Link></p>;
  return <><div className="page-heading"><div><h1>回复话术</h1><p>为首次联系准备文字。仅保存、编辑和预览，不发送。</p></div><Button onClick={() => { setEditing(null); setKey(v => v+1); }}>新增话术</Button></div><ErrorNotice error={query.error || mutation.error}/>{feedback && <p role="status">{feedback}</p>}<div className="collection-layout"><aside className="config-list">{query.data?.map(t => <article className="config-card" key={t.id}><h3>{t.name}</h3><p>{t.channel === 'COMMENT' ? '评论' : '私信'} · {t._count?.configs || 0} 份设置关联</p><div className="action-row"><Button size="sm" variant="outline" onClick={() => { setEditing(t); setKey(v=>v+1); }}>编辑{t.name}</Button><Button size="sm" variant="ghost" onClick={() => mutation.mutate({ path: `/reply-templates/${t.id}`, method: 'DELETE', body: { version: t.version } }, { onSuccess: () => { setEditing(null); setKey(v=>v+1); setFeedback('话术已删除，审计保留'); } })}>删除{t.name}</Button></div></article>)}</aside><TemplateEditor key={key} item={editing || undefined} onSaved={() => { setFeedback('话术已保存，未发送任何消息'); setEditing(null); setKey(v=>v+1); }}/></div></>;
}
