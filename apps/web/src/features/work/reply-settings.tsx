import {useLayoutEffect,useState} from 'react';
import {useQuery} from '@tanstack/react-query';
import {autoContactConsent,type AutoContactOverview,type AutoContactRule,type AutoContactRuleInput} from '@crm/contracts';
import {api,send} from '@/lib/api';
import {FormField} from '@/components/form-field';
import {SelectField,SelectOption} from '@/components/select-field';
import {Input} from '@/components/ui/input';
import {Button} from '@/components/ui/button';
import {Checkbox} from '@/components/ui/checkbox';
import {Switch} from '@/components/ui/switch';
import {Tabs,TabsList,TabsTrigger} from '@/components/ui/tabs';
import {Badge} from '@/components/ui/badge';
import {ErrorNotice,Loading} from '@/components/feedback';
import {useConfirmDiscard} from './draft-guard';
import {useAutomationPreferences,useSettingsOperation,type Template} from './settings-data';
import {useAutoApply} from './use-auto-apply';
import {AutoApplyStatus} from './auto-apply-status';
type Platform='XHS'|'DOUYIN';
type Props={onChange:(dirty:boolean,busy:boolean)=>void;onGlobal:()=>void;onTemplates:()=>void};
export function ReplySettings(props:Props){
 const query=useQuery({queryKey:['auto-contact'],queryFn:()=>api<AutoContactOverview>('/auto-contact'),retry:false}),templates=useQuery({queryKey:['reply-templates'],queryFn:()=>api<Template[]>('/reply-templates'),retry:false}),prefs=useAutomationPreferences(),[platform,setPlatform]=useState<Platform>('XHS');
 if(query.isPending||templates.isPending||prefs.isPending)return <Loading/>;
 if(!query.data||!templates.data||!prefs.data)return <><ErrorNotice error={query.error||templates.error||prefs.error}/><Button variant="outline" onClick={()=>{void query.refetch();void templates.refetch();void prefs.refetch();}}>重新读取回复设置</Button></>;
 return <><ErrorNotice error={query.error||templates.error||prefs.error}/><ReplySelector key={platform} {...props} data={query.data} templates={templates.data} defaultPolicy={prefs.data.policyId||''} platform={platform} onPlatform={setPlatform}/></>;
}
type Selection={policyId:string;threshold:number;channels:('COMMENT'|'DM')[];templateId:string|null;templateVersion:number|null;content:string;accountIds:string[]};
function initial(r:AutoContactRule|undefined,d:AutoContactOverview,defaultId:string):Selection{return {policyId:d.policies.length===1?d.policies[0].id:r?.policyId||d.policies.find(p=>p.id===defaultId)?.id||d.policies[0]?.id||'',threshold:r?.threshold??90,channels:r?.channels??(r?[r.channel]:['COMMENT']),templateId:r?.templateId??null,templateVersion:r?.templateVersion??null,content:r?.content??'',accountIds:r?.accountIds??[]};}
function ReplySelector({data,templates,defaultPolicy,platform,onPlatform,onChange,onGlobal,onTemplates}:Props&{data:AutoContactOverview;templates:Template[];defaultPolicy:string;platform:Platform;onPlatform:(v:Platform)=>void}){
 const op=useSettingsOperation(),confirm=useConfirmDiscard(),rule=data.rules.find(r=>r.platform===platform),[search,setSearch]=useState('');
 const s=useAutoApply(initial(rule,data,defaultPolicy),async value=>{
  const fresh=await api<AutoContactOverview>('/auto-contact'),saved=fresh.rules.find(r=>r.platform===platform),policy=fresh.policies.length===1?fresh.policies[0]:fresh.policies.find(p=>p.id===value.policyId);
  if(!policy)throw Error('尚无匹配方案，请先前往方案管理添加');
  const accounts=value.accountIds.map(id=>{const a=fresh.accounts.find(a=>a.id===id&&a.platform===platform);if(!a)throw Error('账号已变化，请重新选择');return {id,version:a.version,dailyLimit:a.dailyLimit};});
  const payload:AutoContactRuleInput={version:saved?.version??0,platform,policyId:policy.id,policyRevision:policy.revision,threshold:value.threshold,channels:value.channels,channel:value.channels.includes('COMMENT')?'COMMENT':'DM',templateId:value.templateId,templateVersion:value.templateVersion,content:value.content,accounts,preserveAccountLimits:true};
  await send(`/auto-contact/rules/${saved?.id??'workspace-'+platform}`,'PUT',payload);await op.refresh();return {...value,policyId:policy.id};
 });
 const [numberText,setNumberText]=useState(String(s.value.threshold)),[numberError,setNumberError]=useState<Error|null>(null),busy=s.busy||op.busy;
 useLayoutEffect(()=>{onChange(!!s.error||!!numberError,busy);return()=>onChange(false,false);},[s.error,numberError,busy,onChange]);
 const patch=(v:Partial<Selection>,delay=0)=>s.change({...s.value,...v},delay),supported=(c:string)=>data.capabilities?.find(x=>x.platform===platform&&x.channel===c)?.supported??(platform==='XHS'&&c==='COMMENT'),available=(c:string)=>data.capabilities?.find(x=>x.platform===platform&&x.channel===c)?.available??false;
 const accounts=data.accounts.filter(a=>a.platform===platform),filtered=accounts.filter(a=>(a.label+' '+a.id).toLowerCase().includes(search.toLowerCase()));
 const canEnable=!!rule&&!!rule.content.trim()&&!!rule.accountIds.length&&!rule.pauseReason&&data.policies.some(p=>p.id===rule.policyId&&p.revision===rule.policyRevision)&&(rule.channels??[rule.channel]).length>0&&(rule.channels??[rule.channel]).every(available)&&rule.accountIds.every(id=>{const a=accounts.find(a=>a.id===id);return a?.healthy&&a.dailyLimit>0&&a.workbenchStatus!=='PAUSED'&&(rule.mode==='SIMULATION'?a.isDemo:!a.isDemo&&a.sendEligibility?.canSend&&!a.sendEligibility.stale);});
 const toggle=(enabled:boolean)=>op.run(async()=>{if(!rule||enabled&&!canEnable)throw Error('发送服务或账号尚未就绪');await send(`/auto-contact/rules/${rule.id}/enabled`,'POST',{version:rule.version,enabled,...(enabled?{consent:autoContactConsent,hash:rule.hash}:{})});op.setMessage(enabled?'自动回复已开启':'自动回复已关闭');});
 return <div className="preset-form">
 <Tabs value={platform} onValueChange={v=>{if(busy)return;void(async()=>{if(!(s.error||numberError)||await confirm('放弃尚未生效的选择并切换平台？'))onPlatform(v as Platform);})();}}><TabsList className="platform-tabs" aria-label="回复平台"><TabsTrigger value="XHS" disabled={busy}>小红书</TabsTrigger><TabsTrigger value="DOUYIN" disabled={busy}>抖音{!data.capabilities?.some(c=>c.platform==='DOUYIN'&&c.supported)&&<small>未接通</small>}</TabsTrigger></TabsList></Tabs>
 <div className="preset-switch"><div><strong>自动回复</strong><span>{rule?.enabled?'正在按授权规则处理匹配评论':!supported('COMMENT')?'平台尚未接通，仅保存选择':!available('COMMENT')?'持续发送服务未开放':'更换配置不会自动开启回复'}</span></div><Switch aria-label="自动回复" checked={rule?.enabled??false} disabled={busy||!!s.error||!!numberError||(!rule?.enabled&&!canEnable)} onCheckedChange={v=>void toggle(v)}/></div>
 {rule?.pauseReason&&<p role="status">{rule.pauseReason}</p>}{!data.policies.length&&<p role="alert">尚无审核目标，请先到评论匹配的方案管理中添加。</p>}
 <div className="preset-columns">{data.policies.length>1&&<FormField>审核目标<SelectField disabled={op.busy} aria-label="审核目标" value={s.value.policyId} onValueChange={policyId=>patch({policyId})}>{data.policies.map(p=><SelectOption key={p.id} value={p.id}>{p.name||p.target}</SelectOption>)}</SelectField></FormField>}<FormField>最低相关度<Input aria-label="最低相关度" disabled={op.busy||!data.policies.length} type="number" min={0} max={100} step={1} value={numberText} onChange={e=>{const v=e.target.value,n=Number(v);setNumberText(v);if(!v||!Number.isInteger(n)||n<0||n>100){setNumberError(new Error('相关度必须是 0–100 的整数'));return;}setNumberError(null);patch({threshold:n},500);}} onBlur={s.flush}/></FormField></div>
 <fieldset className="preset-channels"><legend>联系渠道</legend>{(['COMMENT','DM'] as const).map(c=><label key={c}><Checkbox aria-label={c==='COMMENT'?'公开评论':'私信'} checked={s.value.channels.includes(c)} disabled={op.busy||!data.policies.length||!supported(c)&&!s.value.channels.includes(c)} onCheckedChange={checked=>patch({channels:checked?[...s.value.channels,c]:s.value.channels.filter(x=>x!==c)})}/>{c==='COMMENT'?'公开评论':'私信'}{!supported(c)&&<Badge variant="secondary">未接通</Badge>}</label>)}</fieldset>
 <div className="preset-picker"><FormField>发送模板<SelectField aria-label="发送模板" value={s.value.templateId||''} disabled={op.busy||!data.policies.length} onValueChange={id=>{const t=templates.find(t=>t.id===id);patch(t?{templateId:t.id,templateVersion:t.version,content:t.body}:{templateId:null,templateVersion:null,content:rule?.templateId? '':rule?.content||''});}}><SelectOption value="">{rule?.content&&!rule.templateId?'已有自定义正文':'选择发送模板'}</SelectOption>{templates.map(t=><SelectOption key={t.id} value={t.id} disabled={t.body.length>1000}>{t.name}{t.body.length>1000?' · 超出自动回复长度':''}</SelectOption>)}</SelectField></FormField><Button variant="outline" size="sm" disabled={busy} onClick={onTemplates}>模板管理</Button></div>
 <div className="preset-content-preview" aria-label="发送内容"><p>{s.value.content||'尚未选择发送内容'}</p>{s.value.templateId&&templates.find(t=>t.id===s.value.templateId)?.version!==s.value.templateVersion&&<Button variant="link" size="sm" disabled={busy} onClick={()=>{const t=templates.find(t=>t.id===s.value.templateId);if(t)patch({templateVersion:t.version,content:t.body});}}>采用模板最新内容</Button>}</div>
 <section className="preset-account-section"><div className="preset-section-title"><strong>发送账号 <small>已选 {s.value.accountIds.length}</small></strong><Button variant="ghost" size="sm" disabled={busy} onClick={onGlobal}>管理账号与额度</Button></div>{accounts.length>4&&<Input aria-label="搜索发送账号" placeholder="搜索昵称或账号 ID" value={search} onChange={e=>setSearch(e.target.value)}/>}
 <div className="preset-account-grid" role="group" aria-label="发送账号池">{filtered.map(a=><div className="preset-account" data-selected={s.value.accountIds.includes(a.id)} key={a.id}><label><Checkbox disabled={op.busy||!data.policies.length} aria-label={`选择账号 ${a.label}`} checked={s.value.accountIds.includes(a.id)} onCheckedChange={checked=>patch({accountIds:checked?[...s.value.accountIds,a.id]:s.value.accountIds.filter(id=>id!==a.id)})}/><span><strong>{a.label}</strong><small>…{a.id.slice(-6)} · {a.workbenchStatus==='PAUSED'?'已暂停':a.healthy?'可用':'需核验'}</small></span></label><span className="preset-quota">今日已用 {a.occupied} / {a.dailyLimit} · 剩余 {Math.max(0,a.dailyLimit-a.occupied)}</span><span className="preset-quota">已确认 {a.confirmed} · 预占 {a.reserved} · 未知 {a.unknown}</span></div>)}</div>{!filtered.length&&<p className="settings-note">{accounts.length?'没有匹配的账号':'此平台尚无账号配置'}</p>}</section>
 <ErrorNotice error={numberError||op.error}/>{op.message&&<p role="status">{op.message}</p>}<AutoApplyStatus {...s}/>
 </div>;
}
