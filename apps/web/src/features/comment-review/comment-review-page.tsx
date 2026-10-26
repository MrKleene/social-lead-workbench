import {ManualPostPanel} from './manual-post-panel';
import {ReviewResults} from './review-results';
import type {SavedReviewPost} from './post-picker';
import {InfoDrawer} from '@/components/information-panel';
import './comment-review.css';
import {useRef,useState} from 'react';
import {Link} from 'react-router-dom';
import type {ReviewOverview,ReviewPolicy} from '@crm/contracts';
import {useConfirmWorkspaceLeave} from '@/features/work/draft-guard';
import {useAuth} from '@/features/auth/use-auth';
import {Button} from '@/components/ui/button';
import {Textarea} from '@/components/ui/textarea';
import {ErrorNotice,Loading} from '@/components/feedback';
import {ReviewCard} from '@/features/collection/semantic-review-panel';
import {useReviewOverview,useReviewWorkspace,useLegacyReviewHistory} from './use-comment-review';
import {ReviewDialogs} from './review-dialogs';
function LegacyHistory(){const [open,setOpen]=useState(false),q=useLegacyReviewHistory(open);return <InfoDrawer title="旧版审核记录" open={open} onOpenChange={setOpen} description="历史记录保留当时的审核目标与证据。">{q.isPending?<Loading/>:q.isError?<ErrorNotice error={q.error}/>:q.data?.items.length?q.data.items.map(r=><ReviewCard key={r.id+':'+r.version} item={r}/>):<p>没有旧版审核结果。原搜索配置和词条规则保留在历史数据中。</p>}</InfoDrawer>;}
function ReviewWorkspace({policy,overview}:{policy:ReviewPolicy|undefined;overview:ReviewOverview}){
 const s=useReviewWorkspace(policy,overview),trigger=useRef<HTMLButtonElement>(null),[resultPost,setResultPost]=useState<SavedReviewPost|null>(null);
 return <><section className="table-panel review-requirement" aria-label="评论审核设置"><form onSubmit={e=>{e.preventDefault();s.save.mutate();}}><label>你想识别什么评论？<Textarea aria-label="审核需求" required minLength={10} maxLength={1500} rows={4} value={s.target} disabled={s.busy} onChange={e=>s.setTarget(e.target.value)} placeholder="用一句话描述要识别的评论内容，以及需要排除的情况。"/></label><div className="action-row"><Button disabled={s.busy||!!policy&&!s.dirty}>{s.save.isPending?'保存中…':'保存审核需求'}</Button>{policy&&<span>需求版本 {policy.revision}</span>}</div></form><div className="review-switch"><span role="status">采集后自动识别{policy?.autoEnabled?'已开启':'关闭'}</span><Button ref={trigger} variant="outline" disabled={!policy||s.dirty||s.busy||!policy.autoEnabled&&overview.connection.state!=='READY'} onClick={()=>policy?.autoEnabled?s.toggle.mutate({enabled:false}):s.enable()}>{policy?.autoEnabled?'关闭自动识别':'开启自动识别'}</Button></div><p className="helper-text">保存需求不会调用模型。搜索词不参与判断，帖子和父评论仅作参考；结果保留待人工审核。</p>{overview.connection.state!=='READY'&&<p>请先在<Link to="/work?module=settings">模型设置</Link>保存描述、模型和 Key。</p>}<ErrorNotice error={s.save.error||s.toggle.error}/>{s.save.isSuccess&&<p role="status">审核需求已保存，历史结果保持原版本。</p>}</section>
 <ManualPostPanel policy={policy} overview={overview} disabled={s.dirty||s.busy} onResults={p=>{setResultPost(p);document.getElementById('review-results')?.scrollIntoView({block:'start'});}}/>
 {overview.autoJobs?.length>0&&<section className="table-panel" aria-label="自动识别进度"><h2>自动识别进度</h2>{overview.autoJobs.map(j=><p key={j.id}><strong>{j.title}</strong> · {({PENDING:'等待',PROCESSING:'处理中',COMPLETED:'完成',FAILED:'失败',SKIPPED:'未送审',CANCELLED:'已取消'} as Record<string,string>)[j.status]||j.status} · 已评估 {j.processed} 条 · {j.reason}</p>)}</section>}
 <ReviewResults key={policy?.id} policyId={policy?.id} post={resultPost} onPostChange={setResultPost} onManual={()=>{const button=document.querySelector<HTMLButtonElement>('[aria-label="手动整帖测试"] button');button?.scrollIntoView({block:'center'});button?.focus();}}/><LegacyHistory/><ReviewDialogs state={s} overview={overview} onAuthClose={()=>trigger.current?.focus()}/></>;
}
export function CommentReviewPage(){const confirmLeave=useConfirmWorkspaceLeave();const {user}=useAuth(),q=useReviewOverview(user?.role==='ADMIN'),[selected,setSelected]=useState('');if(user?.role!=='ADMIN')return <p>评论审核由管理员管理。<Link to="/work">返回工作台</Link></p>;const policy=q.data?.policies.find(p=>p.id===selected)||q.data?.policies[0];return <div className="comment-review-page"><header className="page-heading"><div><span className="eyebrow">COMMENT REVIEW</span><h1>评论审核</h1><p>只判断评论，不影响搜索采集。</p></div><Button asChild variant="outline"><Link to="/work?module=archive">查看采集原文</Link></Button></header>{q.isPending?<Loading/>:q.isError||!q.data?<ErrorNotice error={q.error}/>:<>{q.data.policies.length>1&&<label>已保存的审核需求<select aria-label="已保存的审核需求" value={policy?.id} onChange={e=>{if(confirmLeave())setSelected(e.target.value);}}>{q.data.policies.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></label>}<ReviewWorkspace key={policy?.id||'workspace'} policy={policy} overview={q.data}/></>}</div>;}
