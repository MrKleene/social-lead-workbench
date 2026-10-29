import {useEffect,useLayoutEffect,useRef,useState} from 'react';
import type {ReviewOverview} from '@crm/contracts';
import {Button} from '@/components/ui/button';
import {Badge} from '@/components/ui/badge';
import {ErrorNotice,Loading} from '@/components/feedback';
import {ReviewSettingsBody} from '@/features/comment-review/review-dialogs';
import {useReviewWorkspace} from '@/features/comment-review/use-comment-review';
import {ContactSettingsForm} from '@/features/auto-contact/contact-settings';
import {useAutoContact} from '@/features/auto-contact/use-auto-contact';
import {useConfirmDiscard,useDraftGuard} from './draft-guard';
type Change=(dirty:boolean,busy:boolean)=>void;
export function MatchingSettings({overview,onChange,onGlobal,initialId}:{overview:ReviewOverview;onChange:Change;onGlobal:()=>void;initialId?:string}){
 const [id,setId]=useState(initialId||''),policy=overview.policies.find(p=>p.id===id)||overview.policies[0];
 // Separate component lets policy selection reset the draft only after a discard decision.
 return <MatchingPolicy key={policy?.id||'new'} overview={overview} id={policy?.id} onSelect={setId} onChange={onChange} onGlobal={onGlobal}/>;
}
function MatchingPolicy({overview,id,onSelect,onChange,onGlobal}:{overview:ReviewOverview;id?:string;onSelect:(id:string)=>void;onChange:Change;onGlobal:()=>void}){
 const policy=overview.policies.find(p=>p.id===id),s=useReviewWorkspace(policy,overview),confirm=useConfirmDiscard();
 useLayoutEffect(()=>{onChange(s.dirty,s.busy);return()=>onChange(false,false);},[s.dirty,s.busy,onChange]);
 return <><p>模型复用全局配置：{overview.connection.model} · {overview.connection.state==='READY'?'已就绪':'未就绪'}。<Button variant="link" size="sm" onClick={onGlobal}>管理模型</Button></p><p className="helper-text">自动匹配开启时，需求、模型与调用授权必需。所选帖子全部待处理评论一次审核，超过模型容量整帖停止，不截断。</p><ReviewSettingsBody onModelSettings={onGlobal} state={s} overview={overview} policy={policy} onPolicyChange={async next=>{if(!s.dirty||await confirm('切换审核需求会放弃当前未保存的修改，确定切换吗？'))onSelect(next);}}/></>;
}
export function ReplySettings({onChange,onGlobal}:{onChange:Change;onGlobal:()=>void}){
 const s=useAutoContact(true),d=s.overview.data,r=s.rule,initialized=useRef(false);
 useDraftGuard(s.dirty,'lead');
 useEffect(()=>{if(d&&!initialized.current){initialized.current=true;s.open();}},[d,s.open]);
 useLayoutEffect(()=>{onChange(s.dirty,s.busy);return()=>onChange(false,false);},[s.dirty,s.busy,onChange]);
 if(s.overview.isPending)return <Loading/>;
 if(!d||s.overview.isError)return <><ErrorNotice error={s.overview.error}/><Button variant="outline" onClick={()=>void s.overview.refetch()}>重新读取回复设置</Button></>;
 return <div className="automation-reply-settings"><div className="action-row"><Badge variant="secondary">{r?.enabled?'发送已开启':'发送已关闭'}</Badge>{r?.enabled?<Button variant="outline" disabled={s.busy||s.dirty} onClick={()=>s.toggle.mutate(false)}>关闭自动回复</Button>:<Button variant="outline" disabled={s.busy||s.dirty||!s.canEnable} onClick={()=>s.setConfirm(true)}>开启自动回复</Button>}</div>
 <p className="helper-text">开启时需要：当前审核目标、回复原文、可用发送账号与日额度，并单独授权。账号复用<Button variant="link" size="sm" onClick={onGlobal}>账号中心</Button>；采集和发送资格分别核验，可以使用同一账号。私信与入站回复监控尚未接通。</p>
 {(!d.capability.available||r?.pauseReason)&&<p role="status">{r?.pauseReason||d.capability.reason}</p>}{r&&!s.canEnable&&d.capability.available&&<p role="status">账号、发送资格或规则尚未就绪，不能开启。</p>}
 {s.confirm&&r?<section aria-label="回复授权确认"><h3>确认开启自动回复</h3><p>仅明确匹配且上下文充分、相关度 ≥ {r.threshold}；目标 v{r.policyRevision} · 模型 {r.model}。</p><p>账号池：{r.accountIds.map(id=>`${d.accounts.find(a=>a.id===id)?.label||id}（${r.accountLimits.find(a=>a.id===id)?.dailyLimit||0} 条/日）`).join('、')}</p><p className="contact-body">{r.content}</p><p>持续处理开启后更新的审核结果。已联系用户跨账号去重；未知结果保留占用，平台限制暂停。保存设置不等于发送授权。</p><div className="action-row"><Button disabled={s.busy||!s.canEnable||s.dirty} onClick={()=>s.toggle.mutate(true)}>确认此规则并开启</Button><Button variant="ghost" disabled={s.busy} onClick={()=>s.setConfirm(false)}>取消开启</Button></div></section>:<ContactSettingsForm s={s}/>}
 {!s.draft&&<Button variant="outline" disabled={s.busy} onClick={s.open}>编辑自动回复设置</Button>}{s.dirty&&<p role="status">回复设置有未保存修改，保存不会开启发送。</p>}{s.save.isSuccess&&<p role="status">仅自动回复设置已保存，发送保持关闭；其他页签的修改仍需分别保存。</p>}<ErrorNotice error={s.toggle.error}/>
 </div>;
}
