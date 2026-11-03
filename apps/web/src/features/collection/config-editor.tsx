import {FieldGroup} from '@/components/ui/field';
import {FormField} from '@/components/form-field';
import {useState, useLayoutEffect, type FormEvent} from 'react';
import {Button} from '@/components/ui/button';
import {Input} from '@/components/ui/input';
import {Textarea} from '@/components/ui/textarea';
import {useDraftGuard} from '@/features/work/draft-guard';
import {ErrorNotice} from '@/components/feedback';
import type {Config, ConfigDraft} from './types';
import {useWorkspaceMutation} from './use-collection';
import {keywordDraft, keywordValidation} from './config-draft';

export function ConfigEditor({config, defaults, onClose, onSaved, onDirty, onBusy}: {
    config?: Config;
    defaults?: Pick<ConfigDraft,'platform'|'mode'>;
    onDirty:(dirty:boolean)=>void;
    onBusy?:(busy:boolean)=>void;
    onClose:()=>void;
    onSaved:(config:Config)=>void;
}) {
    const mutation=useWorkspaceMutation<Config>();
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
    return <section className="space-inline-editor"><header><h2>{config?'编辑关键词配置':'新增关键词配置'}</h2></header><form className="config-form detail-scroll" onSubmit={submit}><FieldGroup className="form-fields">
        <ErrorNotice error={validation||mutation.error}/>
        <FormField>描述<Input autoFocus aria-label="描述" value={name} onChange={e=>setName(e.target.value)} maxLength={80} required disabled={mutation.isPending} placeholder="例如：企业部署需求"/></FormField>
        <FormField>关键词内容<Textarea aria-label="关键词内容" value={keywords} onChange={e=>setKeywords(e.target.value)} required maxLength={328} disabled={mutation.isPending} placeholder="每行一个，最多 8 个，每个 40 字" rows={6}/></FormField>
        <div className="action-row"><Button disabled={mutation.isPending}>{mutation.isPending?'保存中…':'保存配置'}</Button><Button type="button" variant="ghost" disabled={mutation.isPending} onClick={close}>取消</Button></div>
    </FieldGroup></form></section>;
}
