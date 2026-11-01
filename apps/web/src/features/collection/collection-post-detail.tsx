import {postReadPresentation} from './post-read-presentation';

import {PostAvailabilityEntry,PostStateTag} from './post-availability';
import {InfoSection} from '@/components/information-panel';
import {SavedCommentConversation} from './saved-comment-conversation';
import {postCounts} from './post-counts';
import {BoundedReadEvidence,BoundedReadWindows} from './bounded-read-evidence';
import {savedTitleLabel} from '@/features/collection/saved-text';
import {useEffect,useRef,useState,type KeyboardEvent,type ReactNode} from 'react';
import {ArrowLeft,ArrowUpRight,FileSearch,RefreshCw} from 'lucide-react';
import './post-reader.css';
import {safePostCoverUrl} from '@crm/contracts';
import {Button} from '@/components/ui/button';
import {Sheet,SheetContent,SheetHeader,SheetTitle,SheetDescription} from '@/components/ui/sheet';
import {formatDate,platformLabel,type Platform} from '@/lib/types';
import {coverageLabel} from './archive-labels';
import {postSourceLink} from './post-source-link';
import {type InfoPost} from './collection-info-model';
import type {ArchivedComment} from './archive-data';
import {reasonLabels} from './types';
import {SavedText,savedSourceText} from './saved-text';
import {ImageDiagnostics} from './image-diagnostics';
import {SavedAvatar} from './saved-avatar';
import {displayNickname,displayPublication,readingTime} from './display-metadata';
export function CollectionPostDetail({configId,post,id,readAction,platform,onBack,onRefresh}:{configId:string;post?:InfoPost;id:string;readAction?:ReactNode;platform:Platform;onBack:()=>void;onRefresh:()=>void}){
 const heading=useRef<HTMLHeadingElement>(null),returnFocus=useRef<HTMLButtonElement|null>(null);
 const [evidence,setEvidence]=useState<ArchivedComment|'post'|null>(null),[failedCover,setFailedCover]=useState(''),[refreshVersion,setRefreshVersion]=useState(0);
 useEffect(()=>{heading.current?.focus({preventScroll:true});setEvidence(null);},[id]);
 const original=post?.versions[0],cover=safePostCoverUrl(post?.coverUrl),counts=postCounts(post);
 const sourceLink=post?postSourceLink(platform,id,original?.id,original?.sourceAvailable):undefined;
 const publication=displayPublication(original?.snapshot.publishedAt);
 const reading=postReadPresentation(original?.readEvidence,original?.availability);
 const paneKeys=(event:KeyboardEvent<HTMLDivElement>)=>{if(event.target!==event.currentTarget||event.altKey||event.ctrlKey||event.metaKey||getComputedStyle(event.currentTarget).overflowY!=='auto'||!['Home','End'].includes(event.key))return;event.preventDefault();event.currentTarget.scrollTo({top:event.key==='Home'?0:event.currentTarget.scrollHeight,behavior:'instant'});};
 const openEvidence=(value:ArchivedComment|'post',target:HTMLButtonElement)=>{returnFocus.current=target;setEvidence(value);};
 return <section className="info-post-detail" aria-label="帖子评论详情">
  <div className="info-detail-bar"><Button variant="ghost" size="sm" onClick={onBack}><ArrowLeft data-icon="inline-start"/>返回列表</Button><div className="info-detail-actions" role="group" aria-label="帖子操作">{sourceLink&&<Button asChild variant="outline" size="sm"><a href={sourceLink} target="_blank" rel="noopener noreferrer" referrerPolicy="no-referrer" title="打开平台原文，可能需要登录或受访问限制">查看原文<ArrowUpRight data-icon="inline-end"/></a></Button>}{original&&<PostAvailabilityEntry id={original.id} readEvidence={original.readEvidence}/>}<Button variant="outline" size="sm" onClick={e=>openEvidence('post',e.currentTarget)}><FileSearch data-icon="inline-start"/>来源与证据</Button><Button variant="outline" size="sm" onClick={()=>{setRefreshVersion(v=>v+1);onRefresh();}}><RefreshCw data-icon="inline-start"/>刷新</Button>{readAction}</div></div>
  <div className="info-detail-grid"><aside className="info-story" tabIndex={0} role="region" aria-label="帖子内容阅读区" onKeyDown={paneKeys}>
   <header className="info-story-heading"><h2 ref={heading} tabIndex={-1}>{savedTitleLabel(post?.title)}</h2>
    <div className="info-post-author">{(original?.snapshot.authorNickname||original?.snapshot.authorAvatarUrl)&&<><SavedAvatar url={original.snapshot.authorAvatarUrl}/><span>{displayNickname(original.snapshot.authorNickname)||'昵称未采集'}</span></>}<span>{platformLabel[platform]}</span></div>
    {(publication||post?.lastSeenAt)&&<time className="info-publication" dateTime={publication||post?.lastSeenAt}>{publication?'发布于':'采集于'} {readingTime(publication||post!.lastSeenAt)} · 北京时间</time>}
    <dl className="info-story-facts"><div><dt>访问状态</dt><dd><PostStateTag value={original?.availability} readEvidence={original?.readEvidence}/>{reading.accessAt&&!reading.captured&&<time className="info-observation-time">{readingTime(reading.accessAt)}</time>}</dd></div><div><dt>读取覆盖</dt><dd data-warning={reading.warning}>{reading.coverage}</dd></div>{original?.readEvidence?.observedAt&&<div><dt>{reading.scope}</dt><dd>{readingTime(original.readEvidence.observedAt)} · 北京时间</dd></div>}</dl>
    {!sourceLink&&<small className="info-source-missing">未保存有效原文链接</small>}
   </header>
   <div className="info-story-scroll" data-media={!!cover&&failedCover!==cover}>
   {cover&&failedCover!==cover&&<img className="info-detail-cover" src={cover} alt="帖子封面" loading="lazy" decoding="async" crossOrigin="anonymous" referrerPolicy="no-referrer" onError={()=>setFailedCover(cover)}/>}
   {cover&&failedCover===cover&&<small className="info-saved-time">封面暂不可用</small>}
   <div className="info-story-body" onKeyDown={paneKeys} role="region" aria-label="帖子正文阅读区" tabIndex={0}>{typeof original?.snapshot.body==='string'?<SavedText key={original.id} text={savedSourceText(original.snapshot.body)} limit={400} label="帖子正文"/>:<p className="info-muted">{original?'帖子正文未获取。':'当前返回内容没有独立帖子原文，可在评论证据中查看已保存上下文。'}</p>}</div>
   </div>
  </aside>
  <SavedCommentConversation key={id} configId={configId} postId={id} declared={counts.declared} observedScope={!!original?.readEvidence} refreshVersion={refreshVersion} onEvidence={openEvidence}/></div>
  <Sheet open={evidence!==null} onOpenChange={open=>{if(!open)setEvidence(null);}}><SheetContent className="task-settings-sheet info-evidence-sheet" onCloseAutoFocus={e=>{e.preventDefault();returnFocus.current?.focus({preventScroll:true});}}><SheetHeader><SheetTitle>来源与证据</SheetTitle><SheetDescription>已保存原文</SheetDescription></SheetHeader><div className="task-settings-body">
   {evidence==='post'?<><dl><dt>平台</dt><dd>{platformLabel[platform]}</dd><dt>来源帖子 ID</dt><dd>{id}</dd></dl>{post?.versions.map(v=><InfoSection key={v.id} title={<>帖子原文 · {formatDate(v.lastSeenAt)}</>}><p>{savedSourceText(v.snapshot.body)}</p><p>{v.readEvidence?postReadPresentation(v.readEvidence).coverage:coverageLabel(v.coverage)}{!v.readEvidence&&` · ${reasonLabels[v.stopReason||'']||'停止原因未返回'}`}</p><dl><dt>存档版本</dt><dd>{v.id}</dd></dl><ImageDiagnostics value={v.snapshot.imageDiagnostics}/><BoundedReadEvidence value={v.readEvidence?v.readEvidence.report:v.snapshot.boundedRead}/><BoundedReadWindows values={v.readEvidence?v.readEvidence.windows:v.snapshot.boundedReadWindows}/></InfoSection>)}{!post?.versions.length&&<p>未返回独立帖子版本。</p>}</>:evidence&&<><dl><dt>来源帖子 ID</dt><dd>{evidence.snapshot.postId}</dd><dt>评论 ID</dt><dd>{evidence.platformCommentId||evidence.snapshot.commentId}</dd>{evidence.snapshot.parentId&&<><dt>父评论 ID</dt><dd>{evidence.snapshot.parentId}</dd><dt>直接回复对象</dt><dd>{evidence.snapshot.replyTargetConflict?'来源关系冲突，未自动替换':evidence.snapshot.replyTarget?`来源 targetComment · 评论 ID ${evidence.snapshot.replyTarget.commentId}`:'未采集；所属讨论不等于直接回复对象。'}</dd></>}<dt>昵称</dt><dd>{displayNickname(evidence.snapshot.authorNickname)||'未采集'}</dd><dt>原始发布时间（北京时间）</dt><dd>{displayPublication(evidence.snapshot.publishedAt)?readingTime(evidence.snapshot.publishedAt!):'未采集'}</dd><dt>上下文版本</dt><dd>{evidence.contextVersion}</dd><dt>最近保存</dt><dd>{formatDate(evidence.lastSeenAt)}</dd></dl><ImageDiagnostics value={evidence.snapshot.imageDiagnostics}/><h3>评论原文</h3><p>{savedSourceText(evidence.snapshot.comment)}</p>{evidence.snapshot.parentId&&<><h3>当时的父评论</h3><p>{evidence.snapshot.parent??'未保存'}</p></>}<InfoSection  title={<>当时的帖子上下文</>}><h3>{savedTitleLabel(evidence.snapshot.title)}</h3><p>{evidence.snapshot.body||'正文未保存'}</p></InfoSection><p>{coverageLabel(evidence.post.coverage)} · {reasonLabels[evidence.post.stopReason||'']||'停止原因未返回'}</p><p>{evidence.reviews.length?'已有分析记录，原文独立保留':'未分析 · 无评分'}</p></>}
  </div></SheetContent></Sheet>
 </section>;
}
