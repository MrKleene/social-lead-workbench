import {useLayoutEffect,useState} from 'react';
import {settingsApi as api,settingsSend as send} from './settings-request';
import {FormField} from '@/components/form-field';
import {SelectField,SelectOption} from '@/components/select-field';
import {Input} from '@/components/ui/input';
import {Badge} from '@/components/ui/badge';
import {Button} from '@/components/ui/button';
import {ErrorNotice} from '@/components/feedback';
import {accountOptionName} from '@/features/accounts/account-presentation';
import {useMcpReadiness} from '@/features/collection/use-collection';
import type {Config,ConfigDraft} from '@/features/collection/types';
import {useSettingsOperation} from './settings-data';
import {useAutoApply} from './use-auto-apply';
import {AutoApplyStatus} from './auto-apply-status';
type Selection={id:string;account:string;posts:number};
const selection=(c?:Config):Selection=>({id:c?.id||'',account:c?.defaultExecutionAccountId||'',posts:c?.batchLimit||1});
export function CollectionSettings({configs,initialId,onDirty,onBusy,onSaved,onManage}:{configs:Config[];initialId?:string;onDirty:(v:boolean)=>void;onBusy:(v:boolean)=>void;onSaved:(c:Config)=>void;onManage:()=>void}){
 const readiness=useMcpReadiness(),op=useSettingsOperation(),initial=configs.find(c=>c.id===initialId)||configs[0],s=useAutoApply(selection(initial),async value=>{
  let row=await api<Config>(`/collection/configs/${value.id}`);
  if(row.batchLimit!==value.posts||(row.defaultExecutionAccountId||'')!==value.account){const config:ConfigDraft={name:row.name,keywords:row.keywords,excludeWords:row.excludeWords,platform:row.platform,mode:row.mode,enabled:row.enabled,batchLimit:value.posts,defaultExecutionAccountId:value.account||null,defaultReplyTemplateId:row.defaultReplyTemplateId,semanticRules:row.semanticRules,commentRules:row.commentRules};row=await send<Config>(`/collection/configs/${row.id}`,'PATCH',{config,revision:row.revision});}
  op.client.setQueryData<Config[]>(['collection'],old=>(old||[]).map(c=>c.id===row.id?{...c,...row}:c));
  await op.select({configId:row.id});onSaved(row);return selection(row);
 });
 const selected=configs.find(c=>c.id===s.value.id),[numberText,setNumberText]=useState(String(s.value.posts)),[numberError,setNumberError]=useState<Error|null>(null),max=selected?.mode==='MOCK'?10:readiness.data?.maxPosts??3;
 useLayoutEffect(()=>{onDirty(!!s.error||!!numberError);onBusy(s.busy);return()=>{onDirty(false);onBusy(false);};},[s.error,s.busy,numberError,onDirty,onBusy]);
 const choose=(id:string)=>{const c=configs.find(c=>c.id===id);if(c){const next=selection(c);setNumberText(String(next.posts));setNumberError(null);s.change(next);}};
 const number=(value:string)=>{setNumberText(value);const n=Number(value);if(!value||!Number.isInteger(n)||n<1||n>max){setNumberError(new Error(`帖子数量必须是 1–${max} 的整数`));return;}setNumberError(null);s.change({...s.value,posts:n},500);};
 return <div className="preset-form">
 <div className="preset-picker"><FormField>关键词组<SelectField aria-label="关键词组" value={s.value.id} onValueChange={choose} disabled={!configs.length}><SelectOption value="" disabled>暂无关键词组</SelectOption>{configs.map(c=><SelectOption key={c.id} value={c.id}>{c.name}</SelectOption>)}</SelectField></FormField><Button size="sm" variant="outline" disabled={s.busy} onClick={onManage}>关键词设置</Button></div>
 <section className="preset-readonly"><span className="settings-label">搜索关键词</span><div className="preset-tags" aria-label="搜索关键词">{selected?.keywords.map((word,i)=><Badge variant="secondary" key={i}>{word}</Badge>)}</div>{!selected?.keywords.length&&<p>请在关键词设置中添加搜索词。</p>}</section>
 <div className="preset-columns"><FormField>采集账号<SelectField aria-label="采集账号" value={s.value.account} onValueChange={account=>s.change({...s.value,account})} disabled={!selected||readiness.isPending}><SelectOption value="">开始前选择账号</SelectOption>{s.value.account&&!readiness.data?.accounts?.some(a=>a.id===s.value.account)&&<SelectOption value={s.value.account}>原账号当前不可用</SelectOption>}{(selected?.platform==='XHS'?readiness.data?.accounts:[])?.map(a=><SelectOption key={a.id} value={a.id}>{accountOptionName(a)}{a.eligible?'':' · 需处理'}</SelectOption>)}</SelectField></FormField><FormField>本轮帖子数量<Input aria-label="本轮帖子数量" disabled={!selected} type="number" min={1} max={max} step={1} value={numberText} onChange={e=>number(e.target.value)} onBlur={s.flush}/></FormField></div>
 <ErrorNotice error={readiness.error||numberError}/><AutoApplyStatus {...s}/>
 </div>;
}
