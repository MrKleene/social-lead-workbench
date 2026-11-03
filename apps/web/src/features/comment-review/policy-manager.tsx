import {useEffect,useState} from 'react';
import type {ReviewOverview,ReviewPolicy} from '@crm/contracts';
import {send} from '@/lib/api';
import {FormField} from '@/components/form-field';
import {FieldGroup} from '@/components/ui/field';
import {Input} from '@/components/ui/input';
import {Textarea} from '@/components/ui/textarea';
import {Button} from '@/components/ui/button';
import {Empty,EmptyHeader,EmptyTitle} from '@/components/ui/empty';
import {ErrorNotice} from '@/components/feedback';
import {useSettingsOperation} from '@/features/work/settings-data';
import {useConfigurationEditor} from '@/features/work/use-configuration-editor';
import '@/components/configuration-browser.css';
export function PolicyManager({overview,initialId}:{overview:ReviewOverview;initialId?:string}){
 const state=useConfigurationEditor(overview.policies,initialId),[message,setMessage]=useState(''),policy=state.selected;
 return <><header className="page-heading"><h1>评论匹配方案配置</h1><Button disabled={state.busy} onClick={()=>void state.create()}>新增方案</Button></header>{message&&<p role="status">{message}</p>}<div className="configuration-browser"><aside className="configuration-items" aria-label="已有匹配方案"><h2>已有配置 · {overview.policies.length}</h2>{overview.policies.map(p=><Button key={p.id} variant="ghost" className="configuration-item" aria-pressed={!state.editor&&policy?.id===p.id} disabled={state.busy} onClick={()=>void state.select(p)}><span>{p.name}</span><small>{p.target}</small></Button>)}</aside><section className="configuration-detail" aria-label="方案内容">{state.editor?<PolicyEditor key={state.editor.key} policy={state.editor.item} onDirty={state.setDirty} onBusy={state.setBusy} onCancel={()=>void state.cancel()} onSaved={id=>{state.saved(id);setMessage('方案已保存');}}/>:policy?<><header><h2>{policy.name}</h2><Button variant="outline" size="sm" onClick={()=>void state.edit()}>编辑方案</Button></header><dl><div><dt>描述</dt><dd>{policy.name}</dd></div><div><dt>识别内容</dt><dd>{policy.target}</dd></div><div><dt>自动匹配</dt><dd>{policy.autoEnabled?'已开启':'未开启'}</dd></div></dl></>:<Empty><EmptyHeader><EmptyTitle>暂无匹配方案</EmptyTitle></EmptyHeader></Empty>}</section></div></>;
}
function PolicyEditor({policy,onSaved,onDirty,onBusy,onCancel}:{policy?:ReviewPolicy;onSaved:(id:string)=>void;onDirty:(value:boolean)=>void;onBusy:(value:boolean)=>void;onCancel:()=>void}){
 const op=useSettingsOperation(),[name,setName]=useState(policy?.name||''),[target,setTarget]=useState(policy?.target||'');
 const dirty=name!==(policy?.name||'')||target!==(policy?.target||'');
 useEffect(()=>{onDirty(dirty);return()=>onDirty(false);},[dirty,onDirty]);useEffect(()=>{onBusy(op.busy);return()=>onBusy(false);},[op.busy,onBusy]);
 return <form onSubmit={e=>{e.preventDefault();void op.run(async()=>{const saved=await send<ReviewPolicy>(policy?`/comment-review/policies/${policy.id}`:'/comment-review/policies',policy?'PUT':'POST',{name,target,...(policy?{version:policy.version}:{})});await op.refresh();onSaved(saved.id);});}}><FieldGroup className="form-fields"><h2>{policy?'编辑方案':'新增方案'}</h2><FormField>方案名称<Input autoFocus aria-label="方案名称" required maxLength={80} disabled={op.busy} value={name} onChange={e=>setName(e.target.value)}/></FormField><FormField>识别内容<Textarea aria-label="识别内容" required minLength={10} maxLength={1500} rows={6} disabled={op.busy} value={target} onChange={e=>setTarget(e.target.value)}/></FormField><ErrorNotice error={op.error}/><div className="action-row"><Button disabled={op.busy||!dirty}>保存方案</Button><Button type="button" variant="ghost" disabled={op.busy} onClick={onCancel}>取消</Button></div></FieldGroup></form>;
}
