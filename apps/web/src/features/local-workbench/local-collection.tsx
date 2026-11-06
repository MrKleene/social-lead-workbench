import {useEffect,useRef,useState} from 'react';
import {useQuery,useQueryClient} from '@tanstack/react-query';
import {Link} from 'react-router-dom';
import {Button} from '@/components/ui/button';
import {useAutoApply} from '@/features/work/use-auto-apply';
import {AutoApplyStatus} from '@/features/work/auto-apply-status';
import {useDraftGuard,useConfirmDiscard} from '@/features/work/draft-guard';
import {useLocalPlatform} from './use-local-platform';
import {useLocalRecords,useLocalAction} from './use-local-records';
import {localApi,type CollectionPreferences} from './local-api';

export function LocalCollectionPanel({credentialsAvailable}:{credentialsAvailable:boolean}){
 const selection=useLocalRecords('workspaceSelection'),configs=useLocalRecords('configurations'),choose=useLocalAction('selectWorkspaceConfiguration');
 const id=selection.data?.configId??'',prefs=useQuery({queryKey:['local','collectionPreferences',id],queryFn:()=>localApi('collectionPreferences',{configId:id}),enabled:!!id}),[reload,setReload]=useState(0),[saving,setSaving]=useState(false),[dirty,setDirty]=useState(false),confirm=useConfirmDiscard();
 useDraftGuard(choose.isPending,'pending');
 return <section className="local-panel"><h3>本轮采集设置</h3><p>账号、笔记数和匹配方案按关键词组自动保存。修改只影响新预览；已有任务继续使用已确认的范围。</p>
 <label className="local-run-picker">关键词配置<select aria-label="关键词配置" value={id} disabled={choose.isPending||selection.isPending||saving} onChange={async e=>{const configId=e.target.value;if(!dirty||await confirm('本组有未保存的设置，是否放弃修改并切换？'))choose.mutate({configId,version:selection.data?.version??0});}}><option value="">选择关键词配置</option>{configs.data?.filter(c=>c.kind==='KEYWORDS').map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></label><Link to="/configuration?tab=keywords">管理关键词 →</Link>
 {(choose.error||selection.error||prefs.error)&&<p role="alert">{(choose.error||selection.error||prefs.error)?.message}</p>}
 {id&&prefs.data?<CollectionSetup key={id+':'+reload} preferences={prefs.data} credentialsAvailable={credentialsAvailable} onSaving={setSaving} onDirty={setDirty} reload={()=>void prefs.refetch().then(()=>setReload(v=>v+1))}/>:id?<p>正在读取该组偏好…</p>:<p>选择关键词组后配置本轮操作。</p>}</section>;
}
function CollectionSetup({preferences,credentialsAvailable,reload,onSaving,onDirty}:{preferences:CollectionPreferences;credentialsAvailable:boolean;reload:()=>void;onSaving:(value:boolean)=>void;onDirty:(value:boolean)=>void}){
 const p=useLocalPlatform(),client=useQueryClient(),version=useRef(preferences.version),[batchText,setBatchText]=useState(String(preferences.batchLimit)),[numberError,setNumberError]=useState(''),[ruleIds,setRuleIds]=useState<string[]>([]),[consent,setConsent]=useState(false);
 const reset=()=>{p.setPlan(null);setConsent(false);};
 const s=useAutoApply({accountId:preferences.accountId,batchLimit:preferences.batchLimit,policyIds:preferences.policyIds},async value=>{const saved=await localApi('saveCollectionPreferences',{configId:preferences.configId,version:version.current,...value});version.current=saved.version;void client.invalidateQueries({queryKey:['local','collectionPreferences',preferences.configId]});return {accountId:saved.accountId,batchLimit:saved.batchLimit,policyIds:saved.policyIds};});
 useEffect(()=>{onSaving(s.busy);return()=>onSaving(false);},[s.busy,onSaving]);
 useEffect(()=>{onDirty(!!s.error||!!numberError);return()=>onDirty(false);},[s.error,numberError,onDirty]);
 useDraftGuard(s.busy,'pending');useDraftGuard(!!s.error||!!numberError,'modal');
 const account=p.accounts.data?.accounts.find(a=>a.id===s.value.accountId),unavailable=s.value.policyIds.filter(id=>!p.workflow.data?.policies.some(rule=>rule.id===id&&rule.enabled));
 const ready=p.accounts.data?.runtime.ready&&credentialsAvailable&&account?.state==='VERIFIED'&&account.hasSession&&!unavailable.length&&!s.busy&&!s.error&&!numberError;
 const change=(next:typeof s.value)=>{reset();s.change(next);};
 return <div className="local-editor">{p.error&&<p role="alert">{p.error.message}</p>}{p.notice&&<p role="status">{p.notice}</p>}
 {preferences.source==='LEGACY'&&<p>已读取原工作台的选择。旧授权没有恢复；账号及匹配方案需要重新核验。</p>}
 <label>采集账号<select aria-label="采集账号" value={s.value.accountId??''} onChange={e=>change({...s.value,accountId:e.target.value||null})}><option value="">选择采集账号</option>{s.value.accountId&&!p.accounts.data?.accounts.some(a=>a.id===s.value.accountId)&&<option value={s.value.accountId}>原账号不可用，请重新选择</option>}{p.accounts.data?.accounts.map(a=><option key={a.id} value={a.id}>{a.name}{a.state!=='VERIFIED'||!a.hasSession?' · 需重新登录':''}</option>)}</select></label>
 <label>本次最多笔记数<input aria-label="本次最多笔记数" type="number" min={1} max={10} value={batchText} onChange={e=>{const value=e.target.value;setBatchText(value);reset();if(!value||!Number.isInteger(Number(value))||Number(value)<1||Number(value)>10){setNumberError('笔记数必须是 1–10 的整数。');return;}setNumberError('');s.change({...s.value,batchLimit:Number(value)},500);}} onBlur={s.flush}/></label>{numberError&&<p role="alert">{numberError}</p>}
 <fieldset><legend>本轮匹配方案</legend><p>选用方案会记住；保存不调用模型。审核时另行确认付费范围。</p>{p.workflow.data?.policies.map(rule=><label className="local-check" key={rule.id}><input type="checkbox" checked={s.value.policyIds.includes(rule.id)} onChange={e=>change({...s.value,policyIds:e.target.checked?[...s.value.policyIds,rule.id]:s.value.policyIds.filter(id=>id!==rule.id)})}/>{rule.name}{!rule.enabled?' · 尚需授权':''}</label>)}{unavailable.length>0&&<p>已选方案中有 {unavailable.length} 个当前不可用于审核。请在模型配置中授权，或取消选用；不会自动换用其他方案。<Button variant="outline" onClick={()=>change({...s.value,policyIds:s.value.policyIds.filter(id=>!unavailable.includes(id))})}>取消选用不可用方案</Button></p>}</fieldset>
 <AutoApplyStatus {...s}/>{s.busy&&<p role="status">正在保存本组偏好…</p>}{s.error&&<Button variant="outline" onClick={reload}>重新读取本组偏好</Button>}
 <p>本轮可选自动联系规则（不随偏好自动勾选）：</p>{p.rules.data?.filter(r=>r.enabled).map(r=><label className="local-check" key={r.id}><input type="checkbox" checked={ruleIds.includes(r.id)} disabled={!s.value.policyIds.includes(r.policyId)} onChange={e=>{setRuleIds(old=>e.target.checked?[...old,r.id]:old.filter(id=>id!==r.id));reset();}}/>{r.name} · 需选择对应匹配方案</label>)}
 <Button variant="outline" disabled={!ready} pending={p.preview.isPending} onClick={()=>p.preview.mutate({configId:preferences.configId,accountId:s.value.accountId,batchLimit:s.value.batchLimit,policyIds:s.value.policyIds,ruleIds:ruleIds.filter(id=>p.rules.data?.some(r=>r.id===id&&s.value.policyIds.includes(r.policyId)))})}>预览采集范围</Button>
 {p.plan&&<><p>{p.plan.accountName} · {p.plan.configurationName} · 最多 {p.plan.batchLimit} 篇笔记 · {p.plan.reviewTargets} 个匹配方案</p><p>关键词：{p.plan.keywords.join('、')}</p><label className="local-check"><input type="checkbox" checked={consent} onChange={e=>setConsent(e.target.checked)}/>{p.plan.automaticRules?`授权读取以上范围一次，并冻结 ${p.plan.automaticRules} 条已授权联系规则；整轮付费审核另行确认，完成后允许规则自动发送。`:'授权读取以上范围一次；部分结果会明确标记，不会自动补跑、付费审核或发送。'}</label><Button disabled={!consent||!ready} pending={p.collect.isPending} onClick={()=>p.collect.mutate()}>授权并开始采集</Button></>}
 </div>;
}
