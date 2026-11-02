import {ReviewAuthor,ReviewSource} from './review-source';
import {Badge} from '@/components/ui/badge';
import {Disclosure} from '@/components/disclosure';
import {FormField} from '@/components/form-field';
import {PostStateTag,PostStateEvidence} from '@/features/collection/post-availability';
import {useRef,useState} from 'react';
import {displayReviewFailure,isBatchOutputFailure,semanticInputPolicy,semanticStateLabels,type SemanticReviewItem} from '@crm/contracts';
import {Sheet,SheetContent,SheetHeader,SheetTitle,SheetDescription} from '@/components/ui/sheet';
import {Table,TableHeader,TableBody,TableRow,TableHead,TableCell,TableCaption} from '@/components/ui/table';
import {Button} from '@/components/ui/button';
import {Textarea} from '@/components/ui/textarea';
import {ErrorNotice} from '@/components/feedback';
import {useWorkspaceMutation} from '@/features/collection/use-collection';
import './graphite-comment-review.css';
export const hasReviewScore=(r:SemanticReviewItem)=>r.state==='EVALUATED'&&r.score!==null;
const modelLabel=(r:SemanticReviewItem)=>r.state==='FAILED'?(isBatchOutputFailure(r.reason)?'批次校验未通过':'评估失败'):(semanticStateLabels[r.state]||r.state);
function ReviewModelStatus({item:r}:{item:SemanticReviewItem}){return <Badge variant="secondary" className={'graphite-review-status state-'+r.state.toLowerCase()}>{modelLabel(r)}</Badge>;}
function HumanStatus({item:r}:{item:SemanticReviewItem}){return <Badge variant="secondary" className={'graphite-review-status human-'+r.reviewStatus.toLowerCase()}>{semanticStateLabels[r.reviewStatus]||r.reviewStatus}</Badge>;}
export function ReviewResultsTable({items,onOpen}:{items:SemanticReviewItem[];onOpen:(r:SemanticReviewItem)=>void}){
 return <Table className="graphite-review-table" aria-label="独立评论审核结果"><TableCaption className="sr-only">评论原文、来源、可信相关度及模型与人工处理状态</TableCaption><TableHeader><TableRow><TableHead>评论原文</TableHead><TableHead>来源帖子</TableHead><TableHead>相关度</TableHead><TableHead>模型状态</TableHead><TableHead>人工状态</TableHead><TableHead>操作</TableHead></TableRow></TableHeader><TableBody>{items.map((r,index)=><TableRow key={r.id}>
 <TableCell className="graphite-review-comment"><ReviewAuthor item={r}/>{r.snapshot.parentId&&<span className="review-reply-label">楼中楼回复</span>}<p>{r.snapshot.comment}</p>{r.isDemo&&<span className="graphite-review-meta">合成样本</span>}</TableCell>
 <TableCell className="graphite-review-source"><ReviewSource item={r}/><PostStateTag value={r.availability}/></TableCell>
 <TableCell className="graphite-review-score"><span className="sr-only">相关度：</span><strong>{hasReviewScore(r)?r.score:'—'}</strong>{!hasReviewScore(r)&&<span className="graphite-review-meta">未评分</span>}</TableCell>
 <TableCell className="graphite-review-model"><ReviewModelStatus item={r}/>{r.state==='FAILED'&&<p className="graphite-review-failure">{r.displayReason||displayReviewFailure(r.reason)}</p>}</TableCell>
 <TableCell className="graphite-review-human"><HumanStatus item={r}/></TableCell>
 <TableCell className="graphite-review-action"><Button variant="outline" size="sm" aria-label={`查看评论详情 ${index+1}`} onClick={()=>onOpen(r)}>查看详情</Button></TableCell>
 </TableRow>)}</TableBody></Table>;
}
export function ReviewResultEvidence({item:r}:{item:SemanticReviewItem}){
 return <><section><h3>评论原文</h3><ReviewAuthor item={r}/>{r.snapshot.parentId&&<blockquote className="review-parent-context"><span>回复父评论</span><p>{r.snapshot.parent||'父评论内容未保存'}</p></blockquote>}<p className="review-full-comment">{r.snapshot.comment}</p></section><section><h3>来源帖子</h3><div className="graphite-review-post"><ReviewSource item={r} detail/><PostStateTag value={r.availability}/></div><Disclosure title="原帖状态与证据"><PostStateEvidence value={r.availability}/></Disclosure></section>
 <section><h3>{r.state==='FAILED'?'失败原因':'匹配理由'}</h3><p>{r.state==='FAILED'?(r.displayReason||displayReviewFailure(r.reason)):r.reason||'尚未获得模型判断。'}</p>{r.result?.decision&&<p className="helper-text">{({MATCH:'模型判断相关',NO_MATCH:'模型判断不相关',UNCERTAIN:'证据不足，待判断'})[r.result.decision]}；分数不是准确率。</p>}</section>
 <section><h3>原文证据</h3>{r.result?.evidence.length?<div className="graphite-review-quotes">{r.result.evidence.map((e,i)=><blockquote key={i}><p>{e.quote}</p><Badge variant="secondary">{({COMMENT:'评论',POST_TITLE:'帖子标题',POST_BODY:'帖子正文',PARENT_COMMENT:'父评论'})[e.source]}</Badge></blockquote>)}</div>:<p className="helper-text">没有模型原文引用证据。</p>}</section>
 <Disclosure title="审核版本与上下文"><dl className="review-detail-facts"><dt>审核记录时间</dt><dd>{new Date(r.createdAt).toLocaleString('zh-CN',{timeZone:'Asia/Shanghai'})} · 北京时间</dd><dt>审核目标</dt><dd>{r.rules.target}</dd><dt>目标版本</dt><dd>{r.policyRevision??r.revision}</dd><dt>模型版本</dt><dd>{r.modelVersion||'尚未调用模型'}</dd><dt>覆盖观察版本</dt><dd>{r.evaluationInput?.observationPolicy||'历史输入：未记录当前观察版本'}</dd><dt>本次输入覆盖</dt><dd>{r.evaluationInput?.observationPolicy?[...new Set(r.evaluationInput.items.map(i=>i.observation?.coverage))].map(v=>v==='COMPLETE'?'当前证据完整':v==='PARTIAL'?'部分范围':'范围未知').join('、'):'沿用当时保存的快照'}</dd><dt>上下文</dt><dd>{semanticStateLabels[r.context]||r.context}</dd><dt>帖子正文</dt><dd>{r.snapshot.body||'未保存'}</dd><dt>父评论</dt><dd>{r.snapshot.parent??'未提供'}</dd></dl>{r.evaluationInput&&<section><h3>{r.evaluationInput.inputPolicyVersion===semanticInputPolicy?'本次评论原文及处理后的上下文':'历史脱敏评估输入'}</h3><pre className="review-input-json">{JSON.stringify(r.evaluationInput,null,2)}</pre></section>}</Disclosure></>;
}
export function ReviewResultDetail({item:r,onClose,onReviewed,onReturnFocus}:{item:SemanticReviewItem;onClose:()=>void;onReviewed:()=>void;onReturnFocus:()=>void}){
 const [note,setNote]=useState(''),mutation=useWorkspaceMutation(),heading=useRef<HTMLHeadingElement>(null);
 const missing=r.state!=='EVALUATED'||r.context!=='SUFFICIENT'||!r.result||!!r.result.decision&&r.result.decision!=='MATCH';
 const decide=(decision:'APPROVED'|'REJECTED')=>mutation.mutate({path:`/collection/semantic-reviews/${r.id}`,method:'PATCH',body:{version:r.version,decision,note}},{onSuccess:onReviewed});
 return <Sheet open onOpenChange={v=>{if(!v&&!mutation.isPending)onClose();}}><SheetContent className="task-settings-sheet review-detail-sheet graphite-review-dialog" showCloseButton={!mutation.isPending} onOpenAutoFocus={e=>{e.preventDefault();heading.current?.focus();}} onCloseAutoFocus={e=>{e.preventDefault();onReturnFocus();}}><SheetHeader><SheetTitle ref={heading} tabIndex={-1}>评论审核详情</SheetTitle><SheetDescription className="sr-only">判断依据与历史版本</SheetDescription></SheetHeader><div className="task-settings-body review-detail-body"><div className="graphite-review-summary"><div><span>相关度</span><strong>{hasReviewScore(r)?r.score:'—'}</strong><ReviewModelStatus item={r}/></div><HumanStatus item={r}/>{!hasReviewScore(r)&&<span className="graphite-review-meta">尚无可信模型评分</span>}</div><ReviewResultEvidence item={r}/>
 <section className="graphite-review-manual"><div className="graphite-review-section-heading"><h3>人工处理</h3><Badge variant="secondary">独立人工处理</Badge></div><p className="helper-text">{semanticStateLabels[r.reviewStatus]||r.reviewStatus} · 记录判断，不代表已联系。</p>{r.reviewStatus==='PENDING'?<><FormField>审核备注（必填）<Textarea aria-label="审核备注" maxLength={500} value={note} disabled={mutation.isPending} onChange={e=>setNote(e.target.value)} placeholder="填写确认相关或排除的依据"/></FormField>{missing&&<p className="helper-text">当前没有可确认的相关结果，仍可填写备注后排除。</p>}<div className="action-row graphite-review-decisions"><Button variant="outline" disabled={!note.trim()||mutation.isPending} onClick={()=>decide('REJECTED')}>排除此条</Button><Button disabled={missing||!note.trim()||mutation.isPending} onClick={()=>decide('APPROVED')}>人工确认相关</Button></div></>:<p>{r.reviewNote||'未填写备注'}</p>}<ErrorNotice error={mutation.error}/></section></div><footer className="graphite-review-footer"><Button variant="outline" disabled={mutation.isPending} onClick={onClose}>关闭</Button></footer></SheetContent></Sheet>;
}
