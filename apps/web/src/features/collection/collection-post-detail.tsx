import {useEffect,useRef,useState,type CSSProperties,type KeyboardEvent} from 'react';
import {UserRound,ArrowLeft,CornerDownRight} from 'lucide-react';
import {safePostCoverUrl} from '@crm/contracts';
import {Button} from '@/components/ui/button';
import {Sheet,SheetContent,SheetHeader,SheetTitle,SheetDescription} from '@/components/ui/sheet';
import {formatDate,platformLabel,type Platform} from '@/lib/types';
import {coverageLabel} from './archive-labels';
import {savedCommentCount,type InfoPost} from './collection-info-model';
import type {ArchivedComment} from './archive-data';
import {reasonLabels} from './types';
import {commentThread} from './comment-thread';
import {SavedText} from './saved-text';
export function CollectionPostDetail({post,id,platform,comments,hasOtherPages,page,onBack}:{post?:InfoPost;id:string;platform:Platform;comments:ArchivedComment[];hasOtherPages:boolean;page:number;onBack:()=>void}){
 const heading=useRef<HTMLHeadingElement>(null),returnFocus=useRef<HTMLButtonElement|null>(null),rowNodes=useRef(new Map<string,HTMLElement>()),commentViewport=useRef<HTMLDivElement>(null);
 const [evidence,setEvidence]=useState<ArchivedComment|'post'|null>(null),[failedCover,setFailedCover]=useState('');
 useEffect(()=>{heading.current?.focus({preventScroll:true});setEvidence(null);},[id]);
 useEffect(()=>{commentViewport.current?.scrollTo({top:0});},[page]);
 const original=post?.versions[0],cover=safePostCoverUrl(post?.coverUrl),rows=commentThread(comments),count=savedCommentCount(comments);
 const coverage=[...(post?.versions.map(v=>v.coverage)||[]),...comments.map(c=>c.post.coverage)];
 const scope=coverage.includes('PARTIAL')?'PARTIAL':!coverage.length||coverage.some(c=>c!=='COMPLETE')?'UNKNOWN':'COMPLETE';
 const paneKeys=(event:KeyboardEvent<HTMLDivElement>)=>{if(event.target!==event.currentTarget||event.altKey||event.ctrlKey||event.metaKey||getComputedStyle(event.currentTarget).overflowY!=='auto'||!['Home','End'].includes(event.key))return;event.preventDefault();event.currentTarget.scrollTo({top:event.key==='Home'?0:event.currentTarget.scrollHeight,behavior:'instant'});};
 const focusParent=(parentId:string)=>{const node=rowNodes.current.get(parentId),viewport=commentViewport.current;if(!node||!viewport)return;node.focus({preventScroll:true});if(getComputedStyle(viewport).overflowY==='auto'){viewport.scrollTo({top:viewport.scrollTop+node.getBoundingClientRect().top-viewport.getBoundingClientRect().top-8,behavior:'instant'});}else node.scrollIntoView({block:'nearest',behavior:'instant'});};
 const openEvidence=(value:ArchivedComment|'post',target:HTMLButtonElement)=>{returnFocus.current=target;setEvidence(value);};
 return <section className="info-post-detail" aria-label="帖子评论详情">
  <div className="info-detail-bar"><Button variant="ghost" onClick={onBack}><ArrowLeft size={15}/>返回帖子列表</Button><button className="info-text-action" onClick={e=>openEvidence('post',e.currentTarget)}>来源与证据</button></div>
  <div className="info-detail-grid"><aside className="info-story">
   <header className="info-story-heading"><div className="info-story-meta"><span>{platformLabel[platform]}</span><span>{coverageLabel(scope)}</span></div>
   <h2 ref={heading} tabIndex={-1}>{post?.title||'帖子标题缺失'}</h2>
   {post?.lastSeenAt&&<time className="info-saved-time" dateTime={post.lastSeenAt}>最近保存 · {formatDate(post.lastSeenAt)}</time>}</header>
   <div className="info-story-scroll" onKeyDown={paneKeys} role="region" aria-label="帖子正文阅读区" tabIndex={0}>
   {cover&&failedCover!==cover&&<img className="info-detail-cover" src={cover} alt="帖子封面" loading="lazy" decoding="async" crossOrigin="anonymous" referrerPolicy="no-referrer" onError={()=>setFailedCover(cover)}/>}
   {cover&&failedCover===cover&&<small className="info-saved-time">封面暂不可用</small>}
   <div className="info-story-body">{original?.snapshot.body?<SavedText key={original.id} text={original.snapshot.body} limit={160} label="帖子正文"/>:<p className="info-muted">{original?'帖子正文未获取。':'当前返回内容没有独立帖子原文，可在评论证据中查看已保存上下文。'}</p>}</div>
   </div>
  </aside>
  <div className="info-conversation"><header className="info-conversation-heading"><div><h3>评论与回复 <span>{count}</span></h3><p>本页已保存{comments.length>count?` · ${comments.length} 个原文版本`:''}{hasOtherPages?' · 其他评论页可继续查看':''}</p></div></header>
   <div ref={commentViewport} className="info-comments" onKeyDown={paneKeys} role="region" tabIndex={0} aria-label="已保存评论列表">{rows.map(({comment:c,depth,parent,parentAmbiguous},index)=><article key={c.id} className="info-comment-row" data-comment={c.id} tabIndex={-1} ref={node=>{if(node)rowNodes.current.set(c.id,node);else rowNodes.current.delete(c.id);}} style={{'--reply-depth':depth} as CSSProperties}>
    <div className="info-comment-meta"><span className="info-comment-kind">{c.snapshot.parentId?<CornerDownRight size={14}/>:<UserRound size={15}/>} {c.snapshot.parentId?'回复':'评论'}{c.snapshot.isDemo&&<small>演示</small>}</span><time dateTime={c.lastSeenAt}>保存于 {formatDate(c.lastSeenAt)}</time></div>
    {c.snapshot.parentId&&<div className="info-parent-context">{parent?<button className="info-text-action" onClick={()=>focusParent(parent.id)}>查看父评论</button>:<span>{parentAmbiguous?'本页父评论有多个版本':c.snapshot.parent!=null?'父评论不在本页 · 已保存上下文':'父评论原文未保存，可能位于其他页'}</span>}{c.snapshot.parent!=null&&<SavedText key={c.id+'parent'} text={c.snapshot.parent} limit={85} label="父评论"/>}</div>}
    <SavedText key={c.id} text={c.snapshot.comment||'评论原文未保存'} limit={360} label="评论"/>
    <div className="info-comment-footer">{c.post.coverage!==scope&&<small>{coverageLabel(c.post.coverage)}</small>}<button className="info-text-action" aria-label={`评论 ${index+1} 的来源与证据`} onClick={e=>openEvidence(c,e.currentTarget)}>来源与证据</button></div>
   </article>)}</div>
   {!comments.length&&<p className="info-comment-empty" role="status">{hasOtherPages?'本页没有该帖评论，可翻阅其他评论页。':'当前返回内容没有该帖评论原文。'} 不代表平台没有评论。</p>}
  </div></div>
  <Sheet open={evidence!==null} onOpenChange={open=>{if(!open)setEvidence(null);}}><SheetContent className="task-settings-sheet info-evidence-sheet" onCloseAutoFocus={e=>{e.preventDefault();returnFocus.current?.focus({preventScroll:true});}}><SheetHeader><SheetTitle>来源与证据</SheetTitle><SheetDescription>已保存的原始记录，不重新请求平台。</SheetDescription></SheetHeader><div className="task-settings-body">
   {evidence==='post'?<><dl><dt>平台</dt><dd>{platformLabel[platform]}</dd><dt>来源帖子 ID</dt><dd>{id}</dd></dl>{post?.versions.map(v=><details key={v.id}><summary>帖子原文 · {formatDate(v.lastSeenAt)}</summary><p>{v.snapshot.body||'正文未获取'}</p><p>{coverageLabel(v.coverage)} · {reasonLabels[v.stopReason||'']||'停止原因未返回'}</p><dl><dt>存档版本</dt><dd>{v.id}</dd></dl></details>)}{!post?.versions.length&&<p>本页未返回独立帖子版本。</p>}</>:evidence&&<><dl><dt>来源帖子 ID</dt><dd>{evidence.snapshot.postId}</dd><dt>评论 ID</dt><dd>{evidence.platformCommentId||evidence.snapshot.commentId}</dd>{evidence.snapshot.parentId&&<><dt>父评论 ID</dt><dd>{evidence.snapshot.parentId}</dd></>}<dt>上下文版本</dt><dd>{evidence.contextVersion}</dd><dt>最近保存</dt><dd>{formatDate(evidence.lastSeenAt)}</dd></dl><h3>评论原文</h3><p>{evidence.snapshot.comment||'未保存'}</p>{evidence.snapshot.parentId&&<><h3>当时的父评论</h3><p>{evidence.snapshot.parent??'未保存'}</p></>}<details><summary>当时的帖子上下文</summary><h3>{evidence.snapshot.title||'标题未保存'}</h3><p>{evidence.snapshot.body||'正文未保存'}</p></details><p>{coverageLabel(evidence.post.coverage)} · {reasonLabels[evidence.post.stopReason||'']||'停止原因未返回'}</p><p>{evidence.reviews.length?'已有分析记录，原文独立保留':'未分析 · 无评分'}</p></>}
  </div></SheetContent></Sheet>
 </section>;
}
