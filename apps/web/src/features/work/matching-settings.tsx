import {useLayoutEffect,useState} from 'react';
import {reviewAutoConsent,type ReviewOverview,type ReviewPolicy} from '@crm/contracts';
import {api,send} from '@/lib/api';
import {FormField} from '@/components/form-field';
import {SelectField,SelectOption} from '@/components/select-field';
import {Input} from '@/components/ui/input';
import {Textarea} from '@/components/ui/textarea';
import {Button} from '@/components/ui/button';
import {Switch} from '@/components/ui/switch';
import {ErrorNotice,Loading} from '@/components/feedback';
import {useModelSettings,type ModelSettings} from '@/features/model-settings/use-model-settings';
import {useConfirmDiscard} from './draft-guard';
import {useAutomationPreferences,useSettingsOperation} from './settings-data';
type Props={overview:ReviewOverview;onChange:(dirty:boolean,busy:boolean)=>void;onGlobal:()=>void;initialId?:string};
export function MatchingSettings(props:Props){
 const prefs=useAutomationPreferences(),model=useModelSettings(),[id,setId]=useState(props.initialId||''),[creating,setCreating]=useState(false);
 const policy=creating?undefined:props.overview.policies.find(p=>p.id===(id||prefs.data?.policyId))||props.overview.policies[0];
 if(model.isPending||prefs.isPending)return <Loading/>;
 if(!model.data||!prefs.data)return <ErrorNotice error={model.error||prefs.error}/>;
 return <MatchingForm key={creating?'new':policy?.id||'empty'} {...props} policy={policy} model={model.data} defaultId={prefs.data?.policyId||props.overview.policies[0]?.id} onSelect={v=>{setCreating(false);setId(v);}} onNew={()=>setCreating(true)}/>;
}
function MatchingForm({overview,onChange,onGlobal,policy,model,defaultId,onSelect,onNew}:Props&{policy?:ReviewPolicy;model:ModelSettings;defaultId?:string;onSelect:(v:string)=>void;onNew:()=>void}){
 const op=useSettingsOperation(),confirm=useConfirmDiscard(),[saved,setSaved]=useState(policy),[name,setName]=useState(policy?.name||''),[target,setTarget]=useState(policy?.target||''),[modelId,setModelId]=useState(model.model),[savedModel,setSavedModel]=useState(model.model),[modelSnapshot,setModelSnapshot]=useState(model);
 const dirty=name!==(saved?.name||'')||target!==(saved?.target||'')||modelId!==savedModel||!!saved&&saved.id!==defaultId;
 useLayoutEffect(()=>{onChange(dirty,op.busy);return()=>onChange(false,false);},[dirty,op.busy,onChange]);
 const current=overview.policies.find(p=>p.id===saved?.id)||saved;
 const choose=async(action:()=>void)=>{if(!dirty||await confirm('放弃当前未保存的匹配设置并切换方案？'))action();};
 const save=()=>op.run(async()=>{
  let row=saved;
  if(!row||name!==row.name||target!==row.target){row=await send<ReviewPolicy>(row?`/comment-review/policies/${row.id}`:'/comment-review/policies',row?'PUT':'POST',{name,target,...(row?{version:row.version}:{})});setSaved(row);setName(row.name);setTarget(row.target);op.setMessage('匹配方案已保存；模型与当前选择尚未全部保存。');}
  if(modelId!==savedModel){const fresh=modelSnapshot;const result=await send<ModelSettings>('/model-settings','PUT',{version:fresh.version,model:modelId,endpoint:fresh.endpoint,note:fresh.note,priceVersion:fresh.models.find(m=>m.id===modelId)?.priceVersion??fresh.priceVersion});op.client.setQueryData(['model-settings'],result);setSavedModel(result.model);setModelSnapshot(result);const refreshed=await api<ReviewOverview>('/comment-review');row=refreshed.policies.find(p=>p.id===row!.id)||row;setSaved(row);op.setMessage('方案与模型已保存；当前选择尚未保存。');}
  await op.select({policyId:row.id});onSelect(row.id);op.setMessage('评论匹配设置已保存；修改目标或模型后需重新开启自动识别');
 });
 const toggle=(enabled:boolean)=>op.run(async()=>{
  if(!current)throw Error('请先保存匹配方案');
  if(enabled)await op.select({policyId:current.id});
  const fresh=await api<ReviewOverview>('/comment-review'),p=fresh.policies.find(p=>p.id===current.id);
  if(!p)throw Error('匹配方案已变化，请重新选择');
  const result=await send<ReviewPolicy>(`/comment-review/policies/${p.id}/automatic`,'PATCH',{version:p.version,enabled,...(enabled?{consent:reviewAutoConsent,modelVersion:fresh.modelVersion,priceVersion:fresh.connection.priceVersion}:{})});
  setSaved(result);op.setMessage(enabled?'自动识别已开启':'自动识别已关闭');
 });
 return <form className="preset-form" onSubmit={e=>{e.preventDefault();void save();}}>
 <div className="preset-picker"><FormField>评论匹配方案<SelectField aria-label="评论匹配方案" value={saved?.id||''} disabled={op.busy} onValueChange={v=>void choose(()=>onSelect(v))}><SelectOption value="" disabled>新增匹配方案</SelectOption>{overview.policies.map(p=><SelectOption key={p.id} value={p.id}>{p.name}</SelectOption>)}</SelectField></FormField><Button type="button" size="sm" variant="outline" disabled={op.busy} onClick={()=>void choose(onNew)}>新增匹配方案</Button></div>
 <FormField>方案描述<Input disabled={op.busy} aria-label="方案描述" required maxLength={80} value={name} onChange={e=>setName(e.target.value)} placeholder="例如：正在寻找论文选题"/></FormField>
 <FormField>要识别的评论内容<Textarea disabled={op.busy} aria-label="要识别的评论内容" required minLength={10} maxLength={1500} rows={4} value={target} onChange={e=>setTarget(e.target.value)} placeholder="描述需要识别的需求、表达方式和排除条件"/><small>用于判断评论原文，不是要发送的回复。</small></FormField>
 <div className="preset-picker"><FormField>匹配模型<SelectField aria-label="匹配模型" value={modelId} disabled={op.busy} onValueChange={setModelId}>{model.models.map(m=><SelectOption key={m.id} value={m.id}>{m.id}</SelectOption>)}</SelectField><small>复用全局模型配置 · {model.configured?'凭据已配置':'尚未配置凭据'}</small></FormField><Button type="button" variant="ghost" size="sm" onClick={onGlobal}>管理模型</Button></div>
 <div className="preset-switch"><div><strong>自动识别</strong><span>开启后，新采集的全部评论原文会提交模型审核并计费。</span></div><Switch aria-label="自动识别" checked={current?.autoEnabled??false} disabled={op.busy||dirty||!current||(!current.autoEnabled&&overview.connection.state!=='READY')} onCheckedChange={v=>void toggle(v)}/></div>
 <ErrorNotice error={op.error}/>{op.message&&<p role="status" className="settings-note">{op.message}</p>}<div className="preset-actions"><Button disabled={op.busy}>{op.busy?'保存中…':'保存评论匹配设置'}</Button>{dirty&&<span>保存后可开启识别</span>}</div>
 </form>;
}
