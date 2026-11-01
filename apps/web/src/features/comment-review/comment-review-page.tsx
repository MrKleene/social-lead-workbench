import {PageState} from '@/components/page-state';
import {PolicyManager} from './policy-manager';
import {useRef,useState} from 'react';
import {Link,useSearchParams} from 'react-router-dom';
import type {ReviewOverview,ReviewPolicy} from '@crm/contracts';
import {InfoDrawer} from '@/components/information-panel';
import {useConfirmWorkspaceLeave} from '@/features/work/draft-guard';
import {useAuth} from '@/features/auth/use-auth';
import {Button} from '@/components/ui/button';
import {ErrorNotice,Loading} from '@/components/feedback';
import {ReviewCard} from '@/features/collection/semantic-review-panel';
import {useReviewOverview,useReviewWorkspace,useLegacyReviewHistory} from './use-comment-review';
import {useManualPost} from './use-manual-post';
import {useReviewResults} from './use-review-results';
import {ManualPostPanel} from './manual-post-panel';
import {ReviewResults} from './review-results';
import {ReviewTaskActivity} from './review-task-activity';
import {ReviewDialogs} from './review-dialogs';
import type {SavedReviewPost} from './post-picker';
import './comment-review.css';
function LegacyHistory(){const [open,setOpen]=useState(false),q=useLegacyReviewHistory(open);return <InfoDrawer title="旧版审核记录" open={open} onOpenChange={setOpen} description="历史记录保留当时的审核目标与证据。">{q.isPending?<Loading/>:q.isError?<ErrorNotice error={q.error}/>:q.data?.items.length?q.data.items.map(r=><ReviewCard key={r.id+':'+r.version} item={r}/>):<p>没有旧版审核结果。</p>}</InfoDrawer>;}
function ReviewWorkspace({policy,overview,onPolicyChange,scope,onSettings,onManage}:{policy?:ReviewPolicy;overview:ReviewOverview;onPolicyChange:(id:string)=>void;scope?:{runId:string;policyRevision?:number};onSettings?:()=>void;onManage:()=>void}){
 const s=useReviewWorkspace(policy,overview),manual=useManualPost(policy),[resultPost,setResultPost]=useState<SavedReviewPost|null>(null),results=useReviewResults(policy?.id,resultPost,scope),[settings,setSettings]=useState(false),manualTrigger=useRef<HTMLElement|null>(null),settingsTrigger=useRef<HTMLButtonElement>(null);
 const manualDisabled=s.dirty||s.busy||!policy||overview.connection.state!=='READY';
 const start=()=>{manualTrigger.current=document.activeElement as HTMLElement;manual.start();};
 const unscored=!results.total.isError&&!results.scored.isError&&results.total.data&&results.scored.data?Math.max(0,results.total.data.total-results.scored.data.total):undefined;
 return <><header className="review-workspace-heading"><div><span className="eyebrow">COMMENT REVIEW</span><h1>评论审核</h1></div><div className="action-row"><Button variant="outline" onClick={onManage}>方案管理</Button><Button onClick={start} disabled={manualDisabled}>手动测试</Button><Button ref={settingsTrigger} variant="outline" onClick={()=>onSettings?onSettings():setSettings(true)}>识别设置{s.dirty?' · 未保存':''}</Button></div></header><div className="review-overview" aria-label="审核状态摘要"><span><strong>{results.scored.isError?'读取失败':results.scored.data?.total??'—'}</strong> 已评分</span><span><strong>{unscored??'—'}</strong> 未评分</span><span>自动识别 <strong>{policy?.autoEnabled?'开启':'关闭'}</strong></span></div>{manualDisabled&&<p className="helper-text review-setup-hint">{s.dirty?'目标修改尚未保存，请在识别设置中保存后再测试。':!policy?'请先在识别设置中保存审核目标。':overview.connection.state!=='READY'?'请先完成模型设置后再测试。':''}</p>}{scope&&<p className="helper-text">自动识别：本轮任务 · 手动测试：全部记录</p>}<ReviewTaskActivity scoped={!!scope} state={manual} overview={scope?{...overview,autoJobs:overview.autoJobs.filter(j=>j.runId===scope.runId)}:overview} onResults={p=>{setResultPost(p);results.reset();results.change('state','');}}/><ReviewResults state={results} policyId={policy?.id} post={resultPost} onPostChange={setResultPost} onManual={start} manualDisabled={manualDisabled}/><footer className="review-workspace-footer"><Link to="/work?module=archive">查看采集原文</Link><Link to="/auto-contact">自动联系与账号矩阵</Link><LegacyHistory/></footer><ManualPostPanel state={manual} policy={policy} overview={overview} onReturnFocus={()=>manualTrigger.current?.focus()}/><ReviewDialogs state={s} overview={overview} policy={policy} open={settings} onClose={()=>setSettings(false)} onReturnFocus={()=>settingsTrigger.current?.focus()} onPolicyChange={onPolicyChange}/></>;
}
export function CommentReviewPage({scope,onSettings}:{scope?:{runId:string;configId:string;policyRevision?:number};onSettings?:()=>void}={}){const [params,setParams]=useSearchParams(),confirmLeave=useConfirmWorkspaceLeave(),{user}=useAuth(),q=useReviewOverview(user?.role==='ADMIN'),[selected,setSelected]=useState(params.get('policy')||''),[managing,setManaging]=useState(params.get('manage')==='1');if(user?.role!=='ADMIN')return <p>评论审核由管理员管理。<Link to="/work">返回工作台</Link></p>;const policy=q.data?.policies.find(p=>p.id===(scope?params.get('policy'):selected))||q.data?.policies[0];return <div className="comment-review-page">{managing&&q.data&&<PolicyManager overview={q.data} initialId={policy?.id} onClose={id=>{if(id)setSelected(id);setManaging(false);if(params.has("manage"))setParams(old=>{const p=new URLSearchParams(old);p.delete("manage");return p;},{replace:true});}}/>}{q.isPending?<PageState title="评论审核" loading/>:q.isError||!q.data?<PageState title="评论审核" error={q.error} onRetry={()=>void q.refetch()}/>:<ReviewWorkspace onManage={()=>setManaging(true)} scope={scope} onSettings={onSettings} key={(policy?.id||'workspace')+':'+(scope?.runId||'all')} policy={policy} overview={q.data} onPolicyChange={async id=>{if(scope)setParams(old=>{const p=new URLSearchParams(old);p.set('policy',id);p.delete('reviewVersion');return p;});else if(await confirmLeave())setSelected(id);}}/>}</div>;}
