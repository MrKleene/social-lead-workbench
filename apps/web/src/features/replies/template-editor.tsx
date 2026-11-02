import { FieldGroup } from '@/components/ui/field';
import { FormField } from '@/components/form-field';
import { SelectField, SelectOption } from '@/components/select-field';
import { FormEvent, useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Lead } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { ErrorNotice } from '@/components/feedback';
import { ReplyTemplate, useReplyMutation, useReplyPreview } from './use-replies';
import { PreviewText } from './reply-preview';
export function TemplateEditor({ item, onSaved, onDirty, onBusy, onCancel }: { item?: ReplyTemplate; onSaved: (id?:string) => void; onDirty:(dirty:boolean)=>void; onBusy:(busy:boolean)=>void; onCancel:()=>void }) {
  const [name,setName] = useState(item?.name || ''), [channel,setChannel] = useState<'COMMENT'|'DM'>(item?.channel || 'COMMENT'), [body,setBody] = useState(item?.body || ''), [leadId,setLeadId] = useState('');
  const mutation = useReplyMutation(), preview = useReplyPreview();
  const leads = useQuery({ queryKey: ['leads'], queryFn: () => api<Lead[]>('/leads') });
  const dirty=name!==(item?.name||'')||body!==(item?.body||'')||channel!==(item?.channel||'COMMENT');
  useEffect(()=>{onBusy(mutation.isPending);return()=>onBusy(false);},[mutation.isPending,onBusy]);
  useEffect(()=>{onDirty(dirty);return()=>onDirty(false);},[dirty,onDirty]);
  const resetPreview = () => preview.reset();
  const submit = (e: FormEvent) => { e.preventDefault(); mutation.mutate({ path: `/reply-templates${item ? `/${item.id}` : ''}`, method: item ? 'PATCH' : 'POST', body: item ? { draft: { name,channel,body }, version: item.version } : { name,channel,body } }, { onSuccess: saved=>onSaved(saved&&typeof saved==='object'&&'id' in saved&&typeof saved.id==='string'?saved.id:undefined) }); };
  return <form className="config-form table-panel collection-body" onSubmit={submit}><FieldGroup className="form-fields"><h2>{item ? '编辑模板' : '新增模板'}</h2><ErrorNotice error={mutation.error || preview.error || leads.error}/><FormField>模板名称<Input disabled={mutation.isPending} value={name} onChange={e => setName(e.target.value)} required maxLength={80}/></FormField><FormField>使用渠道<SelectField disabled={mutation.isPending} aria-label="使用渠道" value={channel} onValueChange={e => setChannel(e as 'COMMENT'|'DM')}><SelectOption value="COMMENT">评论</SelectOption><SelectOption value="DM">私信</SelectOption></SelectField></FormField><FormField>模板内容<Textarea disabled={mutation.isPending} value={body} onChange={e => { setBody(e.target.value); resetPreview(); }} required maxLength={2000} rows={5}/></FormField><p>支持：{['昵称','关键词','帖子标题','平台','专业'].map(f => `{{${f}}}`).join('、')}。专业字段目前未采集，不会根据关键词推断。</p><FormField>预览来源<SelectField aria-label="预览来源" value={leadId} onValueChange={e => { setLeadId(e); resetPreview(); }}><SelectOption value="">未选择来源（显示缺失字段）</SelectOption>{leads.data?.map(l => <SelectOption key={l.id} value={l.id}>{l.identity.nickname} · {l.summary}</SelectOption>)}</SelectField></FormField><div className="action-row"><Button type="button" variant="outline" disabled={preview.isPending||mutation.isPending} onClick={() => preview.mutate({ body, ...(leadId ? { leadId } : {}) })}>预览最终文本</Button><Button disabled={mutation.isPending||!dirty}>保存模板</Button><Button type="button" variant="outline" disabled={mutation.isPending} onClick={onCancel}>取消</Button></div><PreviewText value={preview.data || { text: body, missing: [], unknown: [], source: '草稿原文：点击预览最终文本填充来源字段', sent: false }}/></FieldGroup></form>;
}
