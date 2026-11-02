import {useEffect,useState} from 'react';
import {useQuery} from '@tanstack/react-query';
import {safePostCoverUrl,type RunReviewPage,type RunCommentReview} from '@crm/contracts';
import {useRunPostFeed} from '@/features/work/use-run-post-feed';
import {SavedText} from '@/features/collection/saved-text';
import {readingTime} from '@/features/collection/display-metadata';
import {api} from '@/lib/api';
import {Button} from '@/components/ui/button';
import {Badge} from '@/components/ui/badge';
import {Table,TableHeader,TableBody,TableRow,TableHead,TableCell} from '@/components/ui/table';
import {ErrorNotice,Loading} from '@/components/feedback';
import {commentReviewLabel,reviewStateLabel,scoreLabel,decisionLabel} from './run-review-model';
import './run-review.css';
function PostThumbnail({url}:{url?:string}){
 const safe=safePostCoverUrl(url),[failed,setFailed]=useState('');
 return <span className="run-review-thumbnail">{safe&&failed!==safe?<img src={safe} alt="" loading="lazy" referrerPolicy="no-referrer" onError={()=>setFailed(safe)}/>:<span aria-label="暂无封面">无封面</span>}</span>;
}
function ReviewEvidence({review:r}:{review:RunCommentReview}){
 return <small className="run-review-evidence-line">{r.origin==='BOUND'?'本轮关联':'已有审核'} · 目标版本 {r.policyRevision??'未记录'} · {readingTime(r.createdAt)}（北京）</small>;
}
type Props={runId:string;configId:string;policyId?:string;policyRevision?:number;history?:boolean};
export function RunReviewPanel({runId,configId,policyId,policyRevision,history=false}:Props){
 const [postId,setPostId]=useState(''),[offset,setOffset]=useState(0),[postOffset,setPostOffset]=useState(0);
 const params=new URLSearchParams({offset:String(offset),postOffset:String(postOffset),...(postId?{postId}:{}),...(policyId?{policyId}:{}),...(policyRevision?{policyRevision:String(policyRevision)}:{})});
 const q=useQuery({queryKey:['run-review',runId,params.toString()],queryFn:({signal})=>api<RunReviewPage>(`/comment-review/runs/${encodeURIComponent(runId)}/review?${params}`,{signal}),retry:false,refetchInterval:5000,refetchIntervalInBackground:false});
 const covers=useRunPostFeed(configId,{id:runId,status:q.data?.runStatus||'QUEUED'},!!configId);
 const coverItems=covers.data?.runId===runId&&covers.data?.configId===configId&&covers.data.availability==='AVAILABLE'?covers.data.items:[];
 const d=q.data,post=d?.posts.find(p=>p.id===d.selectedPostId),jobs=post?.jobs||[];
 useEffect(()=>{if(!d||q.isFetching)return;const last=Math.max(0,Math.ceil(d.knownComments/d.pageSize)-1)*d.pageSize;if(d.offset>last)setOffset(last);},[d?.knownComments,d?.offset,d?.pageSize,q.isFetching]);
 const choose=(id:string)=>{setPostId(id);setOffset(0);};
 return <section className="run-review" aria-label="本轮逐帖评论审核"><header className="run-review-heading"><div><h2>评论匹配</h2>{d&&<span>本轮 {d.expectedPosts} 篇帖子 · {d.expectedComments} 条评论</span>}</div></header>
 {!policyId&&!history&&<p role="status">尚未选择匹配方案，请在采集设置中查看。</p>}
 {q.isError?<div role="alert"><ErrorNotice error={q.error}/><Button variant="outline" onClick={()=>void q.refetch()}>重试读取</Button></div>:q.isPending?<div className="run-review-loading"><Loading/></div>:d&&<>
 {d.limited&&<p className="run-review-warning" role="status">记录超出本次读取范围，当前列表不完整。</p>}
 {d.postTotal<d.expectedPosts&&<p className="run-review-warning" role="status">历史帖子关联不完整 · 已定位 {d.postTotal} / {d.expectedPosts} 篇</p>}
 {!d.posts.length?<p className="run-review-empty">{d.expectedPosts?'本轮帖子关联暂不可用':'本轮尚未保存帖子'}</p>:<div className="run-review-layout"><aside className="run-review-posts" aria-label="本轮帖子">{d.posts.map(p=><Button key={p.id} variant="ghost" size="content" className="run-review-post" aria-pressed={d.selectedPostId===p.id} onClick={()=>choose(p.id)}><PostThumbnail url={coverItems.find(item=>item.platformPostId===p.id)?.coverUrl}/><span className="run-review-post-copy"><strong>{p.title}</strong><span>{p.expectedComments===null?'评论数待核对':`${p.expectedComments} 条评论`} · {p.jobs.length?[...new Set(p.jobs.map(j=>reviewStateLabel(j.status)))].join(' / '):'尚无本轮作业'}</span></span></Button>)}{(postOffset>0||d.postHasMore)&&<div className="action-row"><Button variant="outline" size="sm" disabled={!postOffset} onClick={()=>{setPostOffset(n=>Math.max(0,n-20));choose('');}}>上一页帖子</Button><Button variant="outline" size="sm" disabled={!d.postHasMore} onClick={()=>{setPostOffset(n=>n+20);choose('');}}>下一页帖子</Button></div>}</aside>
 <div className="run-review-comments"><header><h3>{post?.title||'所选帖子'}</h3><span>可定位 {d.knownComments} 条{post?.expectedComments!==null&&post?.expectedComments!==undefined?` / 本轮确认 ${post.expectedComments} 条`:''}</span></header>
 {jobs.length>0&&<div className="run-review-jobs" aria-label="本帖本轮审核作业">{jobs.map((j,i)=><p key={i}><Badge variant="secondary">{reviewStateLabel(j.status)}</Badge>{j.reason&&<span>{j.reason}</span>}</p>)}</div>}
 {d.scope!=='EXACT'&&<p className="run-review-warning" role="status">{d.scope==='UNAVAILABLE'?'本轮评论关联待核查':post?.expectedComments===null?'本轮评论总数待核对':'部分评论缺少本轮关联证据'}</p>}
 {!d.comments.length?<p className="run-review-empty">{d.knownComments?'本页没有评论，请返回上一页':post?.expectedComments===0?'本帖本轮没有评论':'暂无可可靠关联的评论'}</p>:<Table className="graphite-run-review-table" aria-label="本轮评论审核"><TableHeader><TableRow><TableHead>昵称与原文</TableHead><TableHead>评分</TableHead><TableHead>状态</TableHead><TableHead>判定理由</TableHead></TableRow></TableHeader><TableBody>{d.comments.map(c=>{const r=c.reviews[0];return <TableRow key={c.id}><TableCell className="graphite-run-comment"><strong>{c.nickname||'评论'}</strong>{c.parentId&&<Badge variant="outline">楼中楼</Badge>}<SavedText key={`${c.id}:text`} text={c.text||'评论原文未保存'} limit={240} label="原文"/>{c.parentId&&!c.parentKnown&&<small>父评论未在本轮定位</small>}</TableCell><TableCell className="graphite-run-score">{scoreLabel(r)}</TableCell><TableCell className="graphite-run-state" data-review-state={r?.state||'NONE'}><Badge variant="secondary">{commentReviewLabel(c,policyRevision?[]:jobs)}</Badge></TableCell><TableCell className="graphite-run-reason">{r?<>{r.state==='EVALUATED'&&decisionLabel(r.decision)&&<strong>{decisionLabel(r.decision)}</strong>}<SavedText key={r.id} text={r.reason||'尚无判断理由'} limit={240} label="理由"/><ReviewEvidence review={r}/>{c.membership==='RECOVERY'&&<small>恢复确认</small>}{c.versions>1&&<small>{c.versions} 个原文版本</small>}{c.reviews.length>1&&<details className="run-review-other-evidence"><summary>其他审核记录（{c.reviews.length-1}）</summary>{c.reviews.slice(1).map(other=><div key={other.id}><strong>{reviewStateLabel(other.state)} · {scoreLabel(other)}{other.state==='EVALUATED'?' / 100':''} · {decisionLabel(other.decision)}</strong><SavedText text={other.reason||'尚无判断理由'} limit={240} label="理由"/><ReviewEvidence review={other}/></div>)}</details>}</>:<span>尚无评分</span>}</TableCell></TableRow>;})}</TableBody></Table>}
 <nav className="run-review-pagination" aria-label="评论分页"><span>{d.limited?'已定位':'共'} {d.knownComments} 条 · 每页 {d.pageSize} 条 · 第 {d.knownComments?Math.floor(d.offset/d.pageSize)+1:0}/{Math.ceil(d.knownComments/d.pageSize)} 页</span><div className="action-row"><Button variant="outline" size="sm" disabled={!d.offset||q.isFetching} onClick={()=>setOffset(n=>Math.max(0,n-d.pageSize))}>上一页评论</Button><Button variant="outline" size="sm" disabled={!d.hasMore||q.isFetching} onClick={()=>setOffset(n=>n+d.pageSize)}>下一页评论</Button></div></nav>
 </div></div>}
 </>}
 </section>;
}
