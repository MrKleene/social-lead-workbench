import {useLayoutEffect,useState} from 'react';
import {useQuery} from '@tanstack/react-query';
import {autoContactConsent,type AutoContactOverview,type AutoContactRule,type AutoContactRuleInput} from '@crm/contracts';
import {api,send} from '@/lib/api';
import {FormField} from '@/components/form-field';
import {SelectField,SelectOption} from '@/components/select-field';
import {Input} from '@/components/ui/input';
import {Textarea} from '@/components/ui/textarea';
import {Button} from '@/components/ui/button';
import {Checkbox} from '@/components/ui/checkbox';
import {Switch} from '@/components/ui/switch';
import {Tabs,TabsList,TabsTrigger} from '@/components/ui/tabs';
import {Badge} from '@/components/ui/badge';
import {ErrorNotice,Loading} from '@/components/feedback';
import {useConfirmDiscard} from './draft-guard';
import {useAutomationPreferences,useSettingsOperation,type Template} from './settings-data';
type Platform='XHS'|'DOUYIN';
type Change=(dirty:boolean,busy:boolean)=>void;
export function ReplySettings({onChange,onGlobal}:{onChange:Change;onGlobal:()=>void}){
 const query=useQuery({queryKey:['auto-contact'],queryFn:()=>api<AutoContactOverview>('/auto-contact'),retry:false}),templates=useQuery({queryKey:['reply-templates'],queryFn:()=>api<Template[]>('/reply-templates'),retry:false}),prefs=useAutomationPreferences();
 const [platform,setPlatform]=useState<Platform>('XHS');
 if(query.isPending||templates.isPending||prefs.isPending)return <Loading/>;
 if(!query.data||!templates.data||!prefs.data)return <><ErrorNotice error={query.error||templates.error||prefs.error}/><Button variant="outline" onClick={()=>{void query.refetch();void templates.refetch();void prefs.refetch();}}>重新读取回复设置</Button></>;
 return <><ErrorNotice error={query.error||templates.error||prefs.error}/><ReplyForm key={platform} data={query.data} templates={templates.data||[]} defaultPolicy={prefs.data?.policyId||''} platform={platform} onPlatform={setPlatform} onChange={onChange} onGlobal={onGlobal}/></>;
}
function ruleDraft(r:AutoContactRule|undefined,d:AutoContactOverview,platform:Platform,defaultPolicy:string):AutoContactRuleInput{
 const p=d.policies.find(p=>p.id===defaultPolicy)||d.policies[0];
 return {version:r?.version??0,platform,policyId:r?.policyId??p?.id??'',policyRevision:r?.policyRevision??p?.revision??1,threshold:r?.threshold??90,channel:r?.channel??'COMMENT',channels:r?.channels??(r?[r.channel]:['COMMENT']),templateId:r?.templateId??null,templateVersion:r?.templateVersion??null,content:r?.content??'',accounts:r?.accountIds.map(id=>({id,version:d.accounts.find(a=>a.id===id)?.version??1,dailyLimit:r.accountLimits.find(a=>a.id===id)?.dailyLimit??0}))??[]};
}
function ReplyForm({data,templates,defaultPolicy,platform,onPlatform,onChange,onGlobal}:{data:AutoContactOverview;templates:Template[];defaultPolicy:string;platform:Platform;onPlatform:(v:Platform)=>void;onChange:Change;onGlobal:()=>void}){
 const original=data.rules.find(r=>r.platform===platform),op=useSettingsOperation(),confirm=useConfirmDiscard();
 const [saved,setSaved]=useState(original),[draft,setDraft]=useState(()=>ruleDraft(original,data,platform,defaultPolicy)),[base,setBase]=useState(()=>JSON.stringify(ruleDraft(original,data,platform,defaultPolicy))),[search,setSearch]=useState(''),[editor,setEditor]=useState<{id?:string;version?:number;name:string;body:string}|null>(null);
 const dirty=!!editor||JSON.stringify(draft)!==base,rule=data.rules.find(r=>r.id===saved?.id)||saved;
 useLayoutEffect(()=>{onChange(dirty,op.busy);return()=>onChange(false,false);},[dirty,op.busy,onChange]);
 const patch=(v:Partial<AutoContactRuleInput>)=>setDraft(d=>({...d,...v}));
 const channels=draft.channels||[],supported=(c:string)=>data.capabilities?.find(x=>x.platform===platform&&x.channel===c)?.supported??(platform==='XHS'&&c==='COMMENT');
 const available=(c:string)=>data.capabilities?.find(x=>x.platform===platform&&x.channel===c)?.available??(platform==='XHS'&&c==='COMMENT'&&data.capability.available);
 const accounts=data.accounts.filter(a=>a.platform===platform),filtered=accounts.filter(a=>(a.label+' '+a.id).toLowerCase().includes(search.toLowerCase()));
 const canEnable=!!rule&&!!rule.content.trim()&&!!rule.accountIds.length&&!rule.pauseReason&&(rule.channels??[rule.channel]).length>0&&(rule.channels??[rule.channel]).every(available)&&rule.accountIds.every(id=>{const a=accounts.find(a=>a.id===id);return a?.healthy&&a.workbenchStatus!=='PAUSED'&&(rule.mode==='SIMULATION'?a.isDemo:!a.isDemo&&a.sendEligibility?.canSend&&!a.sendEligibility.stale);});
 const selectTemplate=(id:string)=>{const t=templates.find(t=>t.id===id);patch(t?{templateId:t.id,templateVersion:t.version,content:t.body}:{templateId:null,templateVersion:null});};
 const saveTemplate=()=>op.run(async()=>{
  if(!editor)return;const t=await send<Template>(editor.id?`/reply-templates/${editor.id}`:'/reply-templates',editor.id?'PATCH':'POST',editor.id?{version:editor.version,draft:{name:editor.name,body:editor.body,channel:draft.channel}}:{name:editor.name,body:editor.body,channel:draft.channel});
  op.client.setQueryData<Template[]>(['reply-templates'],old=>[t,...(old||[]).filter(x=>x.id!==t.id)]);patch({templateId:t.id,templateVersion:t.version,content:t.body});setEditor(null);op.setMessage('发送模板已保存；平台回复设置尚未保存');
 });
 const save=()=>op.run(async()=>{
  const p=data.policies.find(p=>p.id===draft.policyId);if(!p)throw Error('请先在评论匹配页签新增并保存方案');
  if(editor)throw Error('请先保存或取消模板编辑');
  if(draft.content.length>1000)throw Error('自动回复正文最多 1000 字，请缩短模板');
  const payload={...draft,version:saved?.version??0,policyRevision:p.revision};
  const result=await send<AutoContactRule>(`/auto-contact/rules/${rule?.id??'workspace-'+platform}`,'PUT',payload);setSaved(result);
  const next={...payload,version:result.version,accounts:payload.accounts.map(a=>({...a,version:a.version+1}))};setDraft(next);setBase(JSON.stringify(next));op.setMessage('本平台回复设置已保存，自动回复保持关闭');
 });
 const toggle=(enabled:boolean)=>op.run(async()=>{
  if(!rule)throw Error('请先保存回复设置');if(enabled&&!canEnable)throw Error('发送服务或账号尚未就绪');
  const result=await send<AutoContactRule>(`/auto-contact/rules/${rule.id}/enabled`,'POST',{version:rule.version,enabled,...(enabled?{consent:autoContactConsent,hash:rule.hash}:{})});setSaved(result);setDraft(d=>({...d,version:result.version}));setBase(v=>JSON.stringify({...JSON.parse(v),version:result.version}));op.setMessage(enabled?'自动回复已开启':'自动回复已关闭');
 });
 return <div className="preset-form">
 <Tabs value={platform} onValueChange={v=>{if(op.busy)return;void(async()=>{if(!dirty||await confirm('放弃当前平台未保存的回复设置并切换？'))onPlatform(v as Platform);})();}}><TabsList className="platform-tabs" aria-label="回复平台"><TabsTrigger value="XHS">小红书</TabsTrigger><TabsTrigger value="DOUYIN">抖音{!data.capabilities?.some(c=>c.platform==='DOUYIN'&&c.supported)&&<small>未接通</small>}</TabsTrigger></TabsList></Tabs>
 <div className="preset-switch"><div><strong>自动回复</strong><span>{rule?.enabled?'正在按授权规则处理匹配评论':!supported('COMMENT')?'平台尚未接通，仅保存配置':!available('COMMENT')?'持续发送服务未开放':'保存后按此规则授权开启'}</span></div><Switch aria-label="自动回复" checked={rule?.enabled??false} disabled={op.busy||dirty||(!rule?.enabled&&!canEnable)} onCheckedChange={v=>void toggle(v)}/></div>
 {rule?.pauseReason&&<p role="status" className="settings-capability">{rule.pauseReason}</p>}
 <div className="preset-columns"><FormField>审核目标<SelectField disabled={op.busy} aria-label="审核目标" value={draft.policyId} onValueChange={v=>patch({policyId:v,policyRevision:data.policies.find(p=>p.id===v)?.revision??1})}>{data.policies.map(p=><SelectOption key={p.id} value={p.id}>{p.name||p.target}</SelectOption>)}</SelectField></FormField><FormField>最低相关度<Input disabled={op.busy} aria-label="最低相关度" type="number" min={0} max={100} step={1} value={Number.isFinite(draft.threshold)?draft.threshold:''} onChange={e=>patch({threshold:e.target.valueAsNumber})}/></FormField></div>
 <fieldset className="preset-channels"><legend>联系渠道</legend>{(['COMMENT','DM'] as const).map(c=><label key={c}><Checkbox aria-label={c==='COMMENT'?'公开评论':'私信'} checked={channels.includes(c)} disabled={op.busy||!supported(c)&&!channels.includes(c)} onCheckedChange={checked=>{const next=checked?[...channels,c]:channels.filter(x=>x!==c);patch({channels:next,channel:next.includes('COMMENT')?'COMMENT':'DM'});}}/>{c==='COMMENT'?'公开评论':'私信'}{!supported(c)&&<Badge variant="secondary">未接通</Badge>}</label>)}{channels.length>1&&<small>同一用户只联系一次，优先公开评论；所有渠道共用每日额度。</small>}</fieldset>
 <div className="preset-picker"><FormField>发送模板<SelectField aria-label="发送模板" value={draft.templateId||''} disabled={op.busy||!!editor} onValueChange={selectTemplate}><SelectOption value="">{draft.content?'已有自定义正文':'选择发送模板'}</SelectOption>{templates.map(t=><SelectOption key={t.id} value={t.id}>{t.name}{t.body.length>1000?' · 超出自动回复长度':''}</SelectOption>)}</SelectField></FormField><div className="preset-inline-actions"><Button variant="outline" size="sm" disabled={op.busy||!!editor} onClick={()=>setEditor({name:'',body:''})}>新增模板</Button><Button variant="ghost" size="sm" disabled={op.busy||!!editor||!draft.templateId} onClick={()=>{const t=templates.find(t=>t.id===draft.templateId);if(t)setEditor(t);}}>编辑</Button></div></div>
 {editor?<form className="preset-template-editor" onSubmit={e=>{e.preventDefault();void saveTemplate();}}><FormField>模板描述<Input disabled={op.busy} aria-label="模板描述" required maxLength={80} value={editor.name} onChange={e=>setEditor({...editor,name:e.target.value})}/></FormField><FormField>发送正文<Textarea disabled={op.busy} aria-label="发送正文" required maxLength={1000} rows={3} value={editor.body} onChange={e=>setEditor({...editor,body:e.target.value})}/></FormField><div className="action-row"><Button size="sm" disabled={op.busy}>保存模板</Button><Button type="button" size="sm" variant="ghost" disabled={op.busy} onClick={()=>{void(async()=>{if(await confirm('放弃未保存的模板编辑？'))setEditor(null);})();}}>取消编辑</Button></div></form>:draft.templateId?<div className="preset-content-preview"><p>{draft.content||'模板正文为空'}</p>{templates.find(t=>t.id===draft.templateId)?.version!==draft.templateVersion&&<Button variant="link" size="sm" onClick={()=>selectTemplate(draft.templateId!)}>模板已更新，使用新版正文</Button>}</div>:<FormField>已有回复正文<Textarea disabled={op.busy} aria-label="已有回复正文" maxLength={1000} rows={2} value={draft.content} onChange={e=>patch({content:e.target.value})} placeholder="也可在上方新增可复用模板"/></FormField>}
 <section className="preset-account-section"><div className="preset-section-title"><strong>发送账号 <small>已选 {draft.accounts.length}</small></strong><Button variant="ghost" size="sm" onClick={onGlobal}>管理账号</Button></div>{accounts.length>4&&<Input disabled={op.busy} aria-label="搜索发送账号" placeholder="搜索昵称或账号 ID" value={search} onChange={e=>setSearch(e.target.value)}/>}
 <div className="preset-account-grid" role="group" aria-label="发送账号池">{filtered.map(a=>{const selected=draft.accounts.find(x=>x.id===a.id);return <div className="preset-account" data-selected={!!selected} key={a.id}><label><Checkbox disabled={op.busy} aria-label={`选择账号 ${a.label}`} checked={!!selected} onCheckedChange={checked=>patch({accounts:checked?[...draft.accounts,{id:a.id,version:a.version,dailyLimit:a.dailyLimit}]:draft.accounts.filter(x=>x.id!==a.id)})}/><span><strong>{a.label}</strong><small>…{a.id.slice(-6)} · {a.workbenchStatus==='PAUSED'?'已暂停':a.healthy?'可用':'需核验'}</small></span></label><span className="preset-quota">今日占用 {a.occupied} · 未知 {a.unknown}</span>{selected&&<label className="preset-quota-input">每日共用额度<Input disabled={op.busy} aria-label={`${a.label} 每日共用额度`} type="number" min={0} max={1000} step={1} value={Number.isFinite(selected.dailyLimit)?selected.dailyLimit:''} onChange={e=>patch({accounts:draft.accounts.map(x=>x.id===a.id?{...x,dailyLimit:e.target.valueAsNumber}:x)})}/></label>}</div>;})}</div>{!filtered.length&&<p className="settings-note">{accounts.length?'没有匹配的账号':'此平台尚无可用账号配置'}</p>}</section>
 <ErrorNotice error={op.error}/>{op.message&&<p role="status" className="settings-note">{op.message}</p>}<div className="preset-actions"><Button disabled={op.busy||!!editor||!draft.policyId||!Number.isInteger(draft.threshold)||draft.threshold<0||draft.threshold>100||draft.accounts.some(a=>!Number.isInteger(a.dailyLimit)||a.dailyLimit<0||a.dailyLimit>1000)} onClick={()=>void save()}>{op.busy?'保存中…':'保存本平台设置'}</Button></div>
 </div>;
}
