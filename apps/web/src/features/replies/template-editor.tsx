import {Collapsible,CollapsibleTrigger,CollapsibleContent} from '@/components/ui/collapsible';
import { FieldGroup } from '@/components/ui/field';
import { FormField } from '@/components/form-field';
import { SelectField, SelectOption } from '@/components/select-field';
import { FormEvent, useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { ErrorNotice } from '@/components/feedback';
import { ReplyTemplate, useReplyMutation, useReplyPreview } from './use-replies';
import { PreviewText } from './reply-preview';
export function TemplateEditor({ item, channel: fixedChannel, onSaved, onDirty, onBusy, onCancel }: { item?: ReplyTemplate; channel?:'COMMENT'|'DM'; onSaved: (id?:string) => void; onDirty:(dirty:boolean)=>void; onBusy:(busy:boolean)=>void; onCancel:()=>void }) {
  const [name,setName] = useState(item?.name || ''), [channel,setChannel] = useState<'COMMENT'|'DM'>(fixedChannel || item?.channel || 'COMMENT'), [body,setBody] = useState(item?.body || ''), [showPreview,setShowPreview]=useState(false);
  const mutation = useReplyMutation(), preview = useReplyPreview();
  const dirty=name!==(item?.name||'')||body!==(item?.body||'')||channel!==(item?.channel||fixedChannel||'COMMENT');
  useEffect(()=>{onBusy(mutation.isPending);return()=>onBusy(false);},[mutation.isPending,onBusy]);
  useEffect(()=>{onDirty(dirty);return()=>onDirty(false);},[dirty,onDirty]);
  const resetPreview = () => preview.reset();
  const submit = (e: FormEvent) => { e.preventDefault(); mutation.mutate({ path: `/reply-templates${item ? `/${item.id}` : ''}`, method: item ? 'PATCH' : 'POST', body: item ? { draft: { name,channel,body }, version: item.version } : { name,channel,body } }, { onSuccess: saved=>onSaved(saved&&typeof saved==='object'&&'id' in saved&&typeof saved.id==='string'?saved.id:undefined) }); };
  return <form aria-busy={mutation.isPending} className="config-form" onSubmit={submit}><FieldGroup className="form-fields"><h2>{item ? '编辑模板' : '新增模板'}</h2><ErrorNotice error={mutation.error || preview.error}/><FormField>模板名称<Input autoFocus disabled={mutation.isPending} value={name} onChange={e => setName(e.target.value)} required maxLength={80}/></FormField>{!fixedChannel&&<FormField>使用渠道<SelectField disabled={mutation.isPending} aria-label="使用渠道" value={channel} onValueChange={e => setChannel(e as 'COMMENT'|'DM')}><SelectOption value="COMMENT">评论</SelectOption><SelectOption value="DM">私信</SelectOption></SelectField></FormField>}<FormField>模板内容<Textarea disabled={mutation.isPending} value={body} onChange={e => { setBody(e.target.value); resetPreview(); }} required maxLength={2000} rows={5}/></FormField><Collapsible className="configuration-preview" open={showPreview} onOpenChange={setShowPreview}><CollapsibleTrigger asChild><Button type="button" variant="ghost" size="sm">变量与文本预览</Button></CollapsibleTrigger><CollapsibleContent><p>支持：{['昵称','关键词','帖子标题','平台','专业'].map(f => `{{${f}}}`).join('、')}。缺失字段不会自动补全。</p><Button type="button" variant="outline" pending={preview.isPending} disabled={mutation.isPending} onClick={() => preview.mutate({ body })}>{preview.isPending?'正在生成预览…':'预览最终文本'}</Button>{preview.data&&<PreviewText value={preview.data}/>}</CollapsibleContent></Collapsible><div className="action-row"><Button disabled={mutation.isPending||!dirty}>{mutation.isPending?'保存中…':'保存模板'}</Button><Button type="button" variant="ghost" disabled={mutation.isPending} onClick={onCancel}>取消</Button></div></FieldGroup></form>;
}
