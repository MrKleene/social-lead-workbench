import {Field,FieldGroup,FieldLabel,FieldDescription} from '@/components/ui/field';
import {FormField} from '@/components/form-field';
import {useState, useId, useLayoutEffect, type FormEvent} from 'react';
import {Button} from '@/components/ui/button';
import {Input} from '@/components/ui/input';
import {Textarea} from '@/components/ui/textarea';
import {useDraftGuard} from '@/features/work/draft-guard';
import {ErrorNotice} from '@/components/feedback';
import type {Config, ConfigDraft} from './types';
import {useWorkspaceMutation} from './use-collection';
import {keywordDraft, keywordValidation, keywordWords, KEYWORD_LIMIT} from './config-draft';

export function ConfigEditor({config, defaults, onClose, onSaved, onDirty, onBusy}: {
    config?: Config;
    defaults?: Pick<ConfigDraft,'platform'|'mode'>;
    onDirty:(dirty:boolean)=>void;
    onBusy?:(busy:boolean)=>void;
    onClose:()=>void;
    onSaved:(config:Config)=>void;
}) {
    const mutation=useWorkspaceMutation<Config>();
    const keywordsId=useId(),keywordHelpId=useId();
    const [name,setName]=useState(config?.name || '');
    const initialKeywords=config?.keywords.join('\n') || '';
    const [keywords,setKeywords]=useState(initialKeywords);
    const [validation,setValidation]=useState<Error|null>(null);
    const dirty=name!==(config?.name||'')||keywords!==initialKeywords;
    const discard=useDraftGuard(dirty);
    useLayoutEffect(()=>{onBusy?.(mutation.isPending);return()=>onBusy?.(false);},[mutation.isPending,onBusy]);
    useLayoutEffect(()=>{onDirty(dirty);return()=>onDirty(false);},[dirty,onDirty]);
    const close=async()=>{if(await discard())onClose();};
    const submit=(event:FormEvent)=>{
        event.preventDefault();
        if(mutation.isPending)return;
        const error=keywordValidation(name,keywords);
        setValidation(error?new Error(error):null);
        if(error)return;
        const draft=keywordDraft(name,keywords,config,defaults);
        mutation.mutate({path:config?`/collection/configs/${config.id}`:'/collection/configs',method:config?'PATCH':'POST',body:config?{config:draft,revision:config.revision}:draft},{onSuccess:onSaved});
    };
    return <section className="configuration-editor"><header><h2>{config?'编辑关键词配置':'新增关键词配置'}</h2></header><form className="config-form" onSubmit={submit}><FieldGroup className="form-fields">
        <ErrorNotice error={validation||mutation.error}/>
        <FormField>描述<Input autoFocus aria-label="描述" value={name} onChange={e=>{setName(e.target.value);setValidation(null);}} maxLength={80} required disabled={mutation.isPending} placeholder="例如：企业部署需求"/></FormField>
        <Field className="form-field" data-disabled={mutation.isPending||undefined} data-invalid={!!validation||undefined}><FieldLabel htmlFor={keywordsId}>关键词内容</FieldLabel><Textarea id={keywordsId} aria-label="关键词内容" aria-describedby={keywordHelpId} aria-invalid={!!validation} value={keywords} onChange={e=>{setKeywords(e.target.value);setValidation(null);}} required disabled={mutation.isPending} placeholder="每行一个关键词，可直接粘贴多行" rows={8} className="h-52 min-h-32 max-h-80"/><FieldDescription id={keywordHelpId}>已填写 {keywordWords(keywords).length} / {KEYWORD_LIMIT} 条 · 每条最多 40 字</FieldDescription></Field>
        <div className="action-row"><Button disabled={mutation.isPending}>{mutation.isPending?'保存中…':'保存配置'}</Button><Button type="button" variant="ghost" disabled={mutation.isPending} onClick={close}>取消</Button></div>
    </FieldGroup></form></section>;
}
