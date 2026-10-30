import {useLayoutEffect,useState} from 'react';
import {send} from '@/lib/api';
import {FormField} from '@/components/form-field';
import {SelectField,SelectOption} from '@/components/select-field';
import {Input} from '@/components/ui/input';
import {Textarea} from '@/components/ui/textarea';
import {Button} from '@/components/ui/button';
import {ErrorNotice} from '@/components/feedback';
import {accountOptionName} from '@/features/accounts/account-presentation';
import {useMcpReadiness} from '@/features/collection/use-collection';
import type {Config,ConfigDraft} from '@/features/collection/types';
import {useConfirmDiscard} from './draft-guard';
import {useAutomationPreferences,useSettingsOperation} from './settings-data';
type Props={configs:Config[];initialId?:string;onDirty:(v:boolean)=>void;onBusy:(v:boolean)=>void;onSaved:(c:Config)=>void};
function draftFor(c?:Config):ConfigDraft{return {name:c?.name??'',keywords:c?.keywords??[],excludeWords:c?.excludeWords??[],platform:c?.platform??'XHS',mode:c?.mode??'XHS_MCP',batchLimit:c?.batchLimit??1,enabled:c?.enabled??true,defaultExecutionAccountId:c?.defaultExecutionAccountId??null,defaultReplyTemplateId:c?.defaultReplyTemplateId??null,semanticRules:c?.semanticRules,commentRules:c?.commentRules};}
export function CollectionSettings(props:Props){
 const prefs=useAutomationPreferences(),[id,setId]=useState(props.initialId||''),[creating,setCreating]=useState(false);
 const selected=creating?undefined:props.configs.find(c=>c.id===id)||props.configs.find(c=>c.id===prefs.data?.configId)||props.configs[0];
 return <CollectionForm key={creating?'new':selected?.id||'empty'} {...props} selected={selected} selectedDefault={props.initialId||prefs.data?.configId||undefined} onSelect={next=>{setCreating(false);setId(next);}} onNew={()=>setCreating(true)}/>;
}
function CollectionForm({configs,selected,selectedDefault,onSelect,onNew,onDirty,onBusy,onSaved}:Props&{selected?:Config;selectedDefault?:string;onSelect:(id:string)=>void;onNew:()=>void}){
 const readiness=useMcpReadiness(),op=useSettingsOperation(),confirm=useConfirmDiscard();
 const [saved,setSaved]=useState(selected),[draft,setDraft]=useState(()=>draftFor(selected)),[base,setBase]=useState(()=>JSON.stringify(draftFor(selected))),[words,setWords]=useState(selected?.keywords.join('\n')||'');
 const dirty=JSON.stringify(draft)!==base||words!==(saved?.keywords.join('\n')||'')||!!saved&&saved.id!==selectedDefault;
 useLayoutEffect(()=>{onDirty(dirty);onBusy(op.busy);return()=>{onDirty(false);onBusy(false);};},[dirty,op.busy,onDirty,onBusy]);
 const change=(patch:Partial<ConfigDraft>)=>setDraft(d=>({...d,...patch}));
 const switchTo=async(action:()=>void)=>{if(!dirty||await confirm('放弃当前未保存的采集设置并切换？'))action();};
 const save=()=>op.run(async()=>{
  const payload={...draft,keywords:words.split(/[\n,，、]/).map(w=>w.trim()).filter(Boolean)};
  let row=saved;
  if(!row||JSON.stringify(payload)!==JSON.stringify(draftFor(row))){row=await send<Config>(row?`/collection/configs/${row.id}`:'/collection/configs',row?'PATCH':'POST',row?{config:payload,revision:row.revision}:payload);setSaved(row);setDraft(draftFor(row));setWords(row.keywords.join('\n'));setBase(JSON.stringify(draftFor(row)));op.client.setQueryData<Config[]>(['collection'],old=>[...(old||[]).filter(c=>c.id!==row!.id),row!]);op.setMessage('关键词组已保存；当前选择尚未保存。');}
  await op.select({configId:row.id});onSaved(row);onSelect(row.id);op.setMessage('采集设置已保存');
 });
 const max=draft.mode==='MOCK'?10:readiness.data?.maxPosts??3;
 return <form className="preset-form" onSubmit={e=>{e.preventDefault();void save();}}>
 <div className="preset-picker"><FormField>关键词组<SelectField aria-label="关键词组" value={saved?.id||''} disabled={op.busy} onValueChange={v=>void switchTo(()=>onSelect(v))}><SelectOption value="" disabled>新增关键词组</SelectOption>{configs.map(c=><SelectOption key={c.id} value={c.id}>{c.name}</SelectOption>)}</SelectField></FormField><Button type="button" size="sm" variant="outline" disabled={op.busy} onClick={()=>void switchTo(onNew)}>新增关键词组</Button></div>
 <FormField>关键词组名称<Input disabled={op.busy} aria-label="关键词组名称" required maxLength={80} value={draft.name} onChange={e=>change({name:e.target.value})}/></FormField>
 <FormField>搜索关键词<Textarea disabled={op.busy} aria-label="搜索关键词" required maxLength={328} rows={3} value={words} onChange={e=>setWords(e.target.value)} placeholder="每行一个关键词"/></FormField>
 <div className="preset-columns"><FormField>采集账号<SelectField aria-label="采集账号" value={draft.defaultExecutionAccountId||''} onValueChange={v=>change({defaultExecutionAccountId:v||null})} disabled={op.busy||readiness.isPending}><SelectOption value="">开始前选择账号</SelectOption>{draft.defaultExecutionAccountId&&!readiness.data?.accounts?.some(a=>a.id===draft.defaultExecutionAccountId)&&<SelectOption value={draft.defaultExecutionAccountId}>原账号当前不可用</SelectOption>}{(draft.platform==='XHS'?readiness.data?.accounts:[])?.map(a=><SelectOption key={a.id} value={a.id}>{accountOptionName(a)}{a.eligible?'':' · 需处理'}</SelectOption>)}</SelectField></FormField><FormField>本轮帖子数量<Input disabled={op.busy} aria-label="本轮帖子数量" type="number" min={1} max={max} step={1} required value={Number.isFinite(draft.batchLimit)?draft.batchLimit:''} onChange={e=>change({batchLimit:e.target.valueAsNumber})}/></FormField></div>
 {!selected&&<div className="preset-columns"><FormField>平台<SelectField value={draft.platform} onValueChange={v=>change({platform:v as ConfigDraft['platform'],mode:v==='DOUYIN'?'MOCK':readiness.data?.mode||'MOCK'})}><SelectOption value="XHS">小红书</SelectOption><SelectOption value="DOUYIN">抖音 · 仅模拟</SelectOption></SelectField></FormField><FormField>采集模式<SelectField value={draft.mode} onValueChange={v=>change({mode:v as ConfigDraft['mode'],batchLimit:Math.min(draft.batchLimit,v==='MOCK'?10:3)})}><SelectOption value="MOCK">模拟数据</SelectOption>{readiness.data?.mode&&readiness.data.mode!=='MOCK'&&draft.platform==='XHS'&&<SelectOption value={readiness.data.mode}>真实平台读取</SelectOption>}</SelectField></FormField></div>}
 <ErrorNotice error={readiness.error||op.error}/>{op.message&&<p role="status" className="settings-note">{op.message}</p>}<div className="preset-actions"><Button disabled={op.busy||!!readiness.error}>{op.busy?'保存中…':'保存采集设置'}</Button><span>{draft.mode==='MOCK'?'模拟模式':'真实读取'} · 服务端上限 {max} 篇</span></div>
 </form>;
}
