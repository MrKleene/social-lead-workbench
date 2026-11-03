import {configurationPath} from '@/features/configuration/configuration-route';
import {PageState} from '@/components/page-state';
import {useRef,useState} from 'react';
import {Link,Navigate,useSearchParams} from 'react-router-dom';
import type {ReviewOverview,ReviewPolicy} from '@crm/contracts';
import {InfoDrawer} from '@/components/information-panel';
import {useAuth} from '@/features/auth/use-auth';
import {Button} from '@/components/ui/button';
import {ErrorNotice,Loading} from '@/components/feedback';
import {ReviewCard} from '@/features/collection/semantic-review-panel';
import {useReviewOverview,useLegacyReviewHistory} from './use-comment-review';
import {useManualPost} from './use-manual-post';
import {useReviewResults} from './use-review-results';
import {ManualPostPanel} from './manual-post-panel';
import {ReviewResults} from './review-results';
import type {SavedReviewPost} from './post-picker';
import './comment-review.css';
function LegacyHistory(){const [open,setOpen]=useState(false),q=useLegacyReviewHistory(open);return <InfoDrawer title="旧版审核记录" open={open} onOpenChange={setOpen} description="历史记录保留当时的审核目标与证据。">{q.isPending?<Loading/>:q.isError?<ErrorNotice error={q.error}/>:q.data?.items.length?q.data.items.map(r=><ReviewCard key={r.id+':'+r.version} item={r}/>):<p>没有旧版审核结果。</p>}</InfoDrawer>;}
function ReviewWorkspace({policy,overview,scope}:{policy?:ReviewPolicy;overview:ReviewOverview;scope?:{runId:string;policyRevision?:number}}){
 const [resultParams,setResultParams]=useSearchParams();
 const resultPost:SavedReviewPost|null=resultParams.get('review_post')?{id:resultParams.get('review_post')!,title:resultParams.get('review_post_title')||'已选帖子',comments:0}:null;
 const setResultPost=(post:SavedReviewPost|null)=>setResultParams(old=>{const p=new URLSearchParams(old);for(const k of ['review_post','review_post_title','review_offset'])p.delete(k);if(post){p.set('review_post',post.id);p.set('review_post_title',post.title);p.set('review_state','');}return p;});
 const manual=useManualPost(policy),results=useReviewResults(policy?.id,resultPost,scope),manualTrigger=useRef<HTMLElement|null>(null);
 const manualDisabled=!policy||overview.connection.state!=='READY';
 const start=()=>{manualTrigger.current=document.activeElement as HTMLElement;manual.start();};
 const unscored=!results.total.isError&&!results.scored.isError&&results.total.data&&results.scored.data?Math.max(0,results.total.data.total-results.scored.data.total):undefined;
 return <><header className="review-workspace-heading"><div><h1>评论审核</h1></div><div className="action-row"><Button variant="ghost" size="sm" onClick={start} disabled={manualDisabled}>手动测试</Button></div></header><div className="review-overview" aria-label="审核状态摘要"><span><strong>{results.scored.isError?'读取失败':results.scored.data?.total??'—'}</strong> 已评分</span><span><strong>{unscored??'—'}</strong> 未评分</span><span>自动识别 <strong>{policy?.autoEnabled?'开启':'关闭'}</strong></span></div>{manualDisabled&&<p className="helper-text review-setup-hint">{!policy?'请先在配置管理中添加评论匹配方案。':overview.connection.state!=='READY'?'请先在配置管理中完成模型配置。':''}</p>}{scope&&<p className="helper-text">自动识别：本轮任务 · 手动测试：全部记录</p>}<ReviewResults state={results} policyId={policy?.id} post={resultPost} onPostChange={setResultPost} onManual={start} manualDisabled={manualDisabled}/><footer className="review-workspace-footer"><LegacyHistory/></footer><ManualPostPanel onResults={p=>{setResultPost(p);manual.close();}} state={manual} policy={policy} overview={overview} onReturnFocus={()=>manualTrigger.current?.focus()}/></>;
}
export function CommentReviewPage({scope,onSettings}:{scope?:{runId:string;configId:string;policyRevision?:number};onSettings?:()=>void}={}){
 const [params]=useSearchParams(),{user}=useAuth(),q=useReviewOverview(user?.role==='ADMIN'),selected=params.get('policy')||'';
 if(user?.role!=='ADMIN')return <p>评论审核由管理员管理。<Link to="/work">返回工作台</Link></p>;
 if(!scope&&params.get('manage')==='1')return <Navigate replace to={configurationPath('matching',params.toString())}/>;
 const policy=q.data?.policies.find(p=>p.id===(scope?params.get('policy'):selected))||q.data?.policies[0];
 return <div className="comment-review-page">{q.isPending?<PageState title="评论审核" loading/>:q.isError||!q.data?<PageState title="评论审核" error={q.error} onRetry={()=>void q.refetch()}/>:<ReviewWorkspace scope={scope} key={(policy?.id||'workspace')+':'+(scope?.runId||'all')} policy={policy} overview={q.data}/>}</div>;
}
