import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { semanticStateLabels, SemanticReviewItem, SemanticReviewPage } from '@crm/contracts';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { ErrorNotice, Loading } from '@/components/feedback';
import {CaptureArchive} from './capture-archive';
import { QwenEvaluation } from './qwen-evaluation';
import { useWorkspaceMutation } from './use-collection';
function useSemanticQueue(configId:string){
 const [offset,setOffset]=useState(0);
 const query=useQuery({queryKey:['collection',configId,'semantic',offset],queryFn:()=>api<SemanticReviewPage>(`/collection/configs/${configId}/semantic-reviews?offset=${offset}`)});
 return {query,offset,setOffset};
}
export function ReviewCard({item:r,onReviewed}:{item:SemanticReviewItem;onReviewed?:()=>void}){
 const [note,setNote]=useState(''), mutation=useWorkspaceMutation();
 const decide=(decision:'APPROVED'|'REJECTED')=>mutation.mutate({path:`/collection/semantic-reviews/${r.id}`,method:'PATCH',body:{version:r.version,decision,note}},{onSuccess:onReviewed});
 const missing=r.state!=='EVALUATED'||r.context!=='SUFFICIENT'||!r.result||!!r.result.decision&&r.result.decision!=='MATCH';
 return <article className="semantic-review-card"><div className="source-flags"><strong>{r.score===null?'暂无可信评分':`${r.score} / 100 · 排序分`}</strong><span className="soft-tag">{semanticStateLabels[r.state]||r.state}</span><span>{semanticStateLabels[r.reviewStatus]||r.reviewStatus}</span>{r.isDemo&&<span>虚构样本 · 不可发送</span>}</div><p>{r.result?.decision&&({MATCH:'符合',NO_MATCH:'不符合',UNCERTAIN:'待确认'}[r.result.decision]+' · ')}{r.reason||'等待模型配置与人工审核'}</p><p className="helper-text">{r.policyId?'审核需求版本':'来源配置版本'} {r.policyRevision??r.revision} · {semanticStateLabels[r.context]} · {r.snapshot.coverage==='PARTIAL'?'仅已读窗口，部分覆盖':'本批次完整窗口'} · {r.provider==='NONE'?'模型未配置':r.provider+' / '+r.modelVersion}</p><details><summary>原文、目标与评估证据</summary><p>目标：{r.rules.target}</p><p>帖子：{r.snapshot.title||'标题缺失'}</p><p>正文：{r.snapshot.body||'正文未获取'}</p><p>评论：{r.snapshot.comment}</p><p>父评论：{r.snapshot.parent??(r.snapshot.parentId?'未获取，不能补猜':'顶层评论，无父评论')}</p>{r.result?.evidence.map((e,i)=><blockquote key={i}>{e.source}：{e.quote}</blockquote>)}{!r.result&&<p>没有模型原文引用证据。</p>}{r.evaluationInput&&<details><summary>本次脱敏评估输入（证据引用基于此文本）</summary><pre style={{whiteSpace:'pre-wrap',overflowWrap:'anywhere'}}>{JSON.stringify(r.evaluationInput,null,2)}</pre></details>}</details><details><summary>发送条件预览 · 不可发送</summary><ul>{r.eligibility.blockers.map(b=><li key={b}>{b}</li>)}</ul><p>此处只展示阻断条件，不会发送评论或私信。</p></details>{r.reviewStatus==='PENDING'?<><label>审核备注<Textarea aria-label={`审核备注 ${r.id}`} maxLength={500} value={note} onChange={e=>setNote(e.target.value)}/></label><div className="action-row"><Button size="sm" disabled={missing||!note.trim()||mutation.isPending} onClick={()=>decide('APPROVED')}>人工确认相关（不发送）</Button><Button size="sm" variant="outline" disabled={!note.trim()||mutation.isPending} onClick={()=>decide('REJECTED')}>排除此条</Button></div>{missing&&<p className="helper-text">缺少有效模型结果或上下文，只能保持待审核或人工排除。</p>}</>:<p>审核备注：{r.reviewNote}</p>}<ErrorNotice error={mutation.error}/></article>;
}
export function SemanticReviewPanel({configId}:{configId:string}){
 const {query,offset,setOffset}=useSemanticQueue(configId),[selectedReviews,setSelectedReviews]=useState<string[]|undefined>();
 return <section aria-label="自然语言审核队列" className="semantic-review-panel"><div className="list-heading"><div><h3>自然语言审核队列</h3><p>手动语义评估 · 真实发送关闭</p></div><Button variant="ghost" onClick={()=>void query.refetch()}>刷新审核队列</Button></div><CaptureArchive configId={configId} onQueued={setSelectedReviews}/><QwenEvaluation key={selectedReviews?.join(':')||'next'} configId={configId} page={query.data} reviewIds={selectedReviews}/>{selectedReviews&&<Button variant="ghost" onClick={()=>setSelectedReviews(undefined)}>返回默认待分析批次</Button>}<p className="helper-text">按已获取的增量评论入队，不等待全部评论。分数不是校准概率；人工确认也不授予发送资格。独立于旧规则命中列表。</p>{query.isPending?<Loading/>:query.isError?<ErrorNotice error={query.error}/>:<><p>共 {query.data.total} 条，本页 {query.data.items.length} 条 · 分数降序，未评估列后</p><div className="source-list">{query.data.items.map(r=><ReviewCard key={r.id+':'+r.version} item={r}/>)}{!query.data.items.length&&<p>尚无语义审核记录。保存自然语言目标并打开独立 LLM 开关后，新增原文入队；也可选择已存原文。历史未保存原文无法回补。</p>}</div><div className="action-row"><Button variant="ghost" disabled={!offset} onClick={()=>setOffset(Math.max(0,offset-50))}>上一页</Button><Button variant="ghost" disabled={!query.data.hasMore} onClick={()=>setOffset(offset+50)}>下一页</Button></div></>}</section>;
}
