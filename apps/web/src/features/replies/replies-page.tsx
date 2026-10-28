import {useConfirmDiscard} from '@/features/work/draft-guard';
import { FieldGroup } from '@/components/ui/field';
import { FormField } from '@/components/form-field';
import { SelectField, SelectOption } from '@/components/select-field';
import { FormEvent, useState, useEffect } from 'react';
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
import { useDraftGuard } from '@/features/work/draft-guard';
import { SoftSwap } from '@/features/work/space-panel';
import { PreviewText } from './reply-preview';
function TemplateEditor({ item, onSaved, onDirty }: { item?: ReplyTemplate; onSaved: () => void; onDirty:(dirty:boolean)=>void }) {
  const [name,setName] = useState(item?.name || ''), [channel,setChannel] = useState<'COMMENT'|'DM'>(item?.channel || 'COMMENT'), [body,setBody] = useState(item?.body || ''), [leadId,setLeadId] = useState('');
  const mutation = useReplyMutation(), preview = useReplyPreview();
  const leads = useQuery({ queryKey: ['leads'], queryFn: () => api<Lead[]>('/leads') });
  const dirty=name!==(item?.name||'')||body!==(item?.body||'')||channel!==(item?.channel||'COMMENT');
  useDraftGuard(dirty);
  useEffect(()=>{onDirty(dirty);return()=>onDirty(false);},[dirty,onDirty]);
  const resetPreview = () => preview.reset();
  const submit = (e: FormEvent) => { e.preventDefault(); mutation.mutate({ path: `/reply-templates${item ? `/${item.id}` : ''}`, method: item ? 'PATCH' : 'POST', body: item ? { draft: { name,channel,body }, version: item.version } : { name,channel,body } }, { onSuccess: onSaved }); };
  return <form className="config-form table-panel collection-body" onSubmit={submit}><FieldGroup className="form-fields"><h2>{item ? '编辑话术' : '新增话术'}</h2><ErrorNotice error={mutation.error || preview.error || leads.error}/><FormField>话术名称<Input value={name} onChange={e => setName(e.target.value)} required maxLength={80}/></FormField><FormField>使用渠道<SelectField aria-label="使用渠道" value={channel} onValueChange={e => setChannel(e as 'COMMENT'|'DM')}><SelectOption value="COMMENT">评论</SelectOption><SelectOption value="DM">私信</SelectOption></SelectField></FormField><FormField>话术内容<Textarea value={body} onChange={e => { setBody(e.target.value); resetPreview(); }} required maxLength={2000} rows={5}/></FormField><p>支持：{['昵称','关键词','帖子标题','平台','专业'].map(f => `{{${f}}}`).join('、')}。专业字段目前未采集，不会根据关键词推断。</p><FormField>预览来源<SelectField aria-label="预览来源" value={leadId} onValueChange={e => { setLeadId(e); resetPreview(); }}><SelectOption value="">未选择来源（显示缺失字段）</SelectOption>{leads.data?.map(l => <SelectOption key={l.id} value={l.id}>{l.identity.nickname} · {l.summary}</SelectOption>)}</SelectField></FormField><div className="action-row"><Button type="button" variant="outline" disabled={preview.isPending} onClick={() => preview.mutate({ body, ...(leadId ? { leadId } : {}) })}>预览最终文本</Button><Button disabled={mutation.isPending}>保存话术</Button></div><PreviewText value={preview.data || { text: body, missing: [], unknown: [], source: '草稿原文：点击预览最终文本填充来源字段', sent: false }}/></FieldGroup></form>;
}
export function RepliesPage() {
  const { user } = useAuth(), admin = user?.role === 'ADMIN';
  const query = useReplyTemplates(admin), mutation = useReplyMutation();
  const [editing,setEditing] = useState<ReplyTemplate | null>(null), [key,setKey] = useState(0), [feedback,setFeedback] = useState('');
  const [dirty,setDirty]=useState(false);
  const confirmDiscard=useConfirmDiscard();
    const discard=async()=>!dirty||await confirmDiscard('当前话术尚未保存，确定放弃修改并切换吗？');
  if (!admin) return <p>仅管理员可管理回复话术。<Link to="/work">返回工作台</Link></p>;
  return <><div className="page-heading"><div><h1>回复话术</h1><p>为首次联系准备文字。仅保存、编辑和预览，不发送。</p></div><Button onClick={async () => { if(await discard()){setEditing(null); setKey(v => v+1);} }}>新增话术</Button></div><ErrorNotice error={query.error || mutation.error}/>{feedback && <p role="status">{feedback}</p>}<div className="collection-layout"><aside className="config-list">{query.data?.map(t => <article className="config-card" key={t.id}><h3>{t.name}</h3><p>{t.channel === 'COMMENT' ? '评论' : '私信'} · {t._count?.configs || 0} 份设置关联</p><div className="action-row"><Button size="sm" variant="outline" onClick={async () => { if(await discard()){setEditing(t); setKey(v=>v+1);} }}>编辑{t.name}</Button><Button size="sm" variant="ghost" onClick={async () => {if(await discard())mutation.mutate({ path: `/reply-templates/${t.id}`, method: 'DELETE', body: { version: t.version } }, { onSuccess: () => { setEditing(null); setKey(v=>v+1); setFeedback('话术已删除，审计保留'); } });}}>删除{t.name}</Button></div></article>)}</aside><SoftSwap identity={String(key)}><TemplateEditor onDirty={setDirty} key={key} item={editing || undefined} onSaved={() => { setFeedback('话术已保存，未发送任何消息'); setEditing(null); setKey(v=>v+1); }}/></SoftSwap></div></>;
}
