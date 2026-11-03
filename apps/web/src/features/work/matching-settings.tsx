import {useLayoutEffect} from 'react';
import {reviewAutoConsent,type ReviewOverview,type ReviewPolicy} from '@crm/contracts';
import {settingsApi as api,settingsSend as send} from './settings-request';
import {FormField} from '@/components/form-field';
import {SelectField,SelectOption} from '@/components/select-field';
import {Badge} from '@/components/ui/badge';
import {Button} from '@/components/ui/button';
import {Switch} from '@/components/ui/switch';
import {ErrorNotice,Loading} from '@/components/feedback';
import {useModelSettings,type ModelSettings} from '@/features/model-settings/use-model-settings';
import {useAutomationPreferences,useSettingsOperation} from './settings-data';
import {useAutoApply} from './use-auto-apply';
import {AutoApplyStatus} from './auto-apply-status';
type Props={overview:ReviewOverview;onChange:(dirty:boolean,busy:boolean)=>void;onGlobal:()=>void;onManage:()=>void;initialId?:string};
export function MatchingSettings(props:Props){
 const prefs=useAutomationPreferences(),model=useModelSettings();
 if(model.isPending||prefs.isPending)return <Loading/>;
 if(!model.data||!prefs.data)return <ErrorNotice error={model.error||prefs.error}/>;
 return <MatchingSelector {...props} model={model.data} defaultId={prefs.data.policyId||props.overview.policies.find(p=>p.autoEnabled)?.id||props.initialId||props.overview.policies[0]?.id||''}/>;
}
function MatchingSelector({overview,onChange,onGlobal,onManage,model,defaultId}:Props&{model:ModelSettings;defaultId:string}){
 const op=useSettingsOperation(),s=useAutoApply({id:defaultId,model:model.model},async value=>{
  const fresh=await api<ModelSettings>('/model-settings');
  if(value.model!==fresh.model){const result=await send<ModelSettings>('/model-settings','PUT',{version:fresh.version,model:value.model,endpoint:fresh.endpoint,note:fresh.note,priceVersion:fresh.models.find(m=>m.id===value.model)?.priceVersion??fresh.priceVersion});op.client.setQueryData(['model-settings'],result);await op.refresh();}
  if(value.id)await op.select({policyId:value.id});await op.refresh();return value;
 });
 const policy=overview.policies.find(p=>p.id===s.value.id),busy=s.busy||op.busy;
 useLayoutEffect(()=>{onChange(!!s.error,busy);return()=>onChange(false,false);},[s.error,busy,onChange]);
 const toggle=(enabled:boolean)=>op.run(async()=>{
  if(!policy)throw Error('请先选择匹配方案');
  if(enabled)await op.select({policyId:policy.id});
  const fresh=await api<ReviewOverview>('/comment-review'),p=fresh.policies.find(p=>p.id===policy.id);if(!p)throw Error('匹配方案已变化');
  await send<ReviewPolicy>(`/comment-review/policies/${p.id}/automatic`,'PATCH',{version:p.version,enabled,...(enabled?{consent:reviewAutoConsent,modelVersion:fresh.modelVersion,priceVersion:fresh.connection.priceVersion}:{})});op.setMessage(enabled?'自动识别已开启':'自动识别已关闭');
 });
 return <div className="preset-form">
 <div className="preset-picker"><FormField>评论匹配方案<SelectField aria-label="评论匹配方案" value={s.value.id} disabled={op.busy||!overview.policies.length} onValueChange={id=>s.change({...s.value,id})}><SelectOption value="" disabled>暂无匹配方案</SelectOption>{overview.policies.map(p=><SelectOption key={p.id} value={p.id}>{p.name}</SelectOption>)}</SelectField></FormField><Button size="sm" variant="outline" pending={busy} onClick={onManage}>方案管理</Button></div>
 <section className="preset-readonly"><span className="settings-label">要识别的评论内容</span><div className="preset-tags" aria-label="要识别的评论内容">{policy?<Badge variant="secondary" className="semantic-tag">{policy.target}</Badge>:<p>请先在方案管理中添加识别内容。</p>}</div></section>
 <div className="preset-picker"><FormField>匹配模型<SelectField aria-label="匹配模型" value={s.value.model} disabled={op.busy} onValueChange={model=>s.change({...s.value,model})}>{model.models.map(m=><SelectOption key={m.id} value={m.id}>{m.id}</SelectOption>)}</SelectField><small>全局模型 · {model.configured?'凭据已配置':'尚未配置凭据'}</small></FormField><Button variant="ghost" size="sm" pending={busy} onClick={onGlobal}>管理模型</Button></div>
 <div className="preset-switch"><div><strong>自动识别</strong><span>开启后，新采集的全部评论原文会提交模型审核并计费。</span></div><Switch aria-label="自动识别" checked={policy?.autoEnabled??false} pending={busy} disabled={!!s.error||!policy||(!policy.autoEnabled&&overview.connection.state!=='READY')} onCheckedChange={v=>void toggle(v)}/></div>
 <ErrorNotice error={op.error}/>{op.message&&<p role="status" className="sr-only">{op.message}</p>}<AutoApplyStatus {...s}/>
 </div>;
}
