import {CommentContextSheet,type ContextRequest} from './comment-context-sheet';
import {replyTargetFor} from './reply-target';
import {postCounts} from './post-counts';
import {BoundedReadEvidence,BoundedReadWindows} from './bounded-read-evidence';
import {savedTitleLabel} from '@/features/collection/saved-text';
import {Fragment,useEffect,useRef,useState,type CSSProperties,type KeyboardEvent,type ReactNode} from 'react';
import {ArrowLeft,ArrowUpRight,ChevronDown,ChevronUp,Search} from 'lucide-react';
import {safePostCoverUrl} from '@crm/contracts';
import {Button} from '@/components/ui/button';
import {Sheet,SheetContent,SheetHeader,SheetTitle,SheetDescription} from '@/components/ui/sheet';
import {formatDate,platformLabel,type Platform} from '@/lib/types';
import {coverageLabel} from './archive-labels';
import {postSourceLink} from './post-source-link';
import {savedCommentCount,type InfoPost} from './collection-info-model';
import type {ArchivedComment} from './archive-data';
import {reasonLabels} from './types';
import {commentThread,replyGroups} from './comment-thread';
import {SavedText,savedSourceText} from './saved-text';
import {ImageDiagnostics} from './image-diagnostics';
import {SavedAvatar} from './saved-avatar';
import {displayNickname,displayPublication,readingTime} from './display-metadata';
export function CollectionPostDetail({configId,post,id,readAction,platform,comments,hasOtherPages,page,onBack,onRefresh}:{configId:string;post?:InfoPost;id:string;readAction?:ReactNode;platform:Platform;comments:ArchivedComment[];hasOtherPages:boolean;page:number;onBack:()=>void;onRefresh:()=>void}){
 const heading=useRef<HTMLHeadingElement>(null),returnFocus=useRef<HTMLButtonElement|null>(null),rowNodes=useRef(new Map<string,HTMLElement>()),commentViewport=useRef<HTMLDivElement>(null);
 const [context,setContext]=useState<ContextRequest|null>(null);
 const [commentView,setCommentView]=useState<'all'|'roots'|'replies'>('all'),[commentSearch,setCommentSearch]=useState('');
 const [evidence,setEvidence]=useState<ArchivedComment|'post'|null>(null),[failedCover,setFailedCover]=useState(''),[expandedReplies,setExpandedReplies]=useState<Set<string>>(new Set());
 useEffect(()=>{heading.current?.focus({preventScroll:true});setEvidence(null);setContext(null);},[id]);
 useEffect(()=>{commentViewport.current?.scrollTo({top:0});setExpandedReplies(new Set());setCommentSearch('');setCommentView('all');},[id,page]);
 const original=post?.versions[0],cover=safePostCoverUrl(post?.coverUrl),rows=commentThread(comments),count=savedCommentCount(comments);
 const counts=postCounts(post);
 const targets=new Map(comments.map(c=>[c.id,replyTargetFor(c,comments)]));
 const groups=replyGroups(rows),hidden=new Set([...groups].flatMap(([root,replies])=>expandedReplies.has(root)?[]:replies.slice(1).map(r=>r.comment.id)));
 const filtering=commentView!=='all'||!!commentSearch.trim();
 const matches=(c:ArchivedComment)=>(commentView==='all'||(commentView==='replies')===!!c.snapshot.parentId)&&`${c.snapshot.comment||''} ${c.snapshot.authorNickname||''}`.toLocaleLowerCase().includes(commentSearch.trim().toLocaleLowerCase());
 const shown=comments.filter(matches);
 const rootCount=savedCommentCount(comments.filter(c=>!c.snapshot.parentId)),replyCount=savedCommentCount(comments.filter(c=>!!c.snapshot.parentId));
 const sourceLink=post?postSourceLink(platform,id,original?.id,original?.sourceAvailable):undefined;
 const groupEnds=new Map([...groups].map(([root,replies])=>[replies.at(-1)!.comment.id,{root,count:replies.length}]));
 const publication=displayPublication(original?.snapshot.publishedAt);
 const coverage=[...(post?.versions.map(v=>v.coverage)||[]),...comments.map(c=>c.post.coverage)];
 const scope=coverage.includes('PARTIAL')?'PARTIAL':!coverage.length||coverage.some(c=>c!=='COMPLETE')?'UNKNOWN':'COMPLETE';
 const paneKeys=(event:KeyboardEvent<HTMLDivElement>)=>{if(event.target!==event.currentTarget||event.altKey||event.ctrlKey||event.metaKey||getComputedStyle(event.currentTarget).overflowY!=='auto'||!['Home','End'].includes(event.key))return;event.preventDefault();event.currentTarget.scrollTo({top:event.key==='Home'?0:event.currentTarget.scrollHeight,behavior:'instant'});};
 const focusParent=(parentId:string)=>{if(filtering){setCommentView('all');setCommentSearch('');requestAnimationFrame(()=>focusParentNode(parentId));}else focusParentNode(parentId);};
 const focusParentNode=(parentId:string)=>{const node=rowNodes.current.get(parentId),viewport=commentViewport.current;if(!node||!viewport)return;node.focus({preventScroll:true});if(getComputedStyle(viewport).overflowY==='auto'){viewport.scrollTo({top:viewport.scrollTop+node.getBoundingClientRect().top-viewport.getBoundingClientRect().top-8,behavior:'instant'});}else node.scrollIntoView({block:'nearest',behavior:'instant'});};
 const focusTarget=(target:ArchivedComment)=>{const group=[...groups].find(([,replies])=>replies.some(r=>r.comment.id===target.id));if(group)setExpandedReplies(prev=>new Set([...prev,group[0]]));requestAnimationFrame(()=>focusParent(target.id));};
 const openEvidence=(value:ArchivedComment|'post',target:HTMLButtonElement)=>{returnFocus.current=target;setEvidence(value);};
 return <section className="info-post-detail" aria-label="帖子评论详情">
  <div className="info-detail-bar"><Button variant="ghost" onClick={onBack}><ArrowLeft size={15}/>返回帖子列表</Button><div className="info-detail-actions"><button className="info-text-action" onClick={e=>openEvidence('post',e.currentTarget)}>来源与证据</button><Button variant="ghost" onClick={onRefresh}>刷新</Button></div></div>
  <header className="mist-detail-heading"><div><h2 ref={heading} tabIndex={-1}>{savedTitleLabel(post?.title)}</h2><div className="info-story-meta"><span>{coverageLabel(scope)}</span><span>{platformLabel[platform]} · 已保存原文</span>{(publication||post?.lastSeenAt)&&<time dateTime={publication||post?.lastSeenAt}>{publication?'发布于':'采集于'} {readingTime(publication||post!.lastSeenAt)} · 北京时间</time>}</div></div><div className="info-original-action">{readAction}{sourceLink?<a className="info-original-link" href={sourceLink} target="_blank" rel="noopener noreferrer" referrerPolicy="no-referrer">查看原文<ArrowUpRight size={14}/></a>:<small>未保存有效原文链接</small>}{sourceLink&&<small>可能需登录或访问受限</small>}</div></header>
  <div className="info-detail-grid"><aside className="info-story" tabIndex={0} role="region" aria-label="帖子内容阅读区" onKeyDown={paneKeys}>
   <h3 className="info-story-title">原帖内容</h3>
   <div className="info-story-scroll" data-media={!!cover&&failedCover!==cover}>
   {cover&&failedCover!==cover&&<img className="info-detail-cover" src={cover} alt="帖子封面" loading="lazy" decoding="async" crossOrigin="anonymous" referrerPolicy="no-referrer" onError={()=>setFailedCover(cover)}/>}
   {cover&&failedCover===cover&&<small className="info-saved-time">封面暂不可用</small>}
   {(original?.snapshot.authorNickname||original?.snapshot.authorAvatarUrl)&&<div className="info-post-author"><SavedAvatar url={original.snapshot.authorAvatarUrl}/><span>{displayNickname(original.snapshot.authorNickname)||'昵称未采集'}</span></div>}
   <div className="info-story-body" onKeyDown={paneKeys} role="region" aria-label="帖子正文阅读区" tabIndex={0}>{typeof original?.snapshot.body==='string'?<SavedText key={original.id} text={savedSourceText(original.snapshot.body)} limit={400} label="帖子正文"/>:<p className="info-muted">{original?'帖子正文未获取。':'当前返回内容没有独立帖子原文，可在评论证据中查看已保存上下文。'}</p>}</div>
   </div>
  </aside>
  <div className="info-conversation"><header className="info-conversation-heading"><div><h3>评论与回复 <span>{original?.savedComments??count}</span></h3><p>{counts.saved!==undefined?`累计已保存 ${counts.saved} 条 · `:''}本页 {count} 条{comments.length>count?` · ${comments.length} 个原文版本`:''}{hasOtherPages?' · 其他评论页可继续查看':''}</p>{counts.declared!==undefined&&counts.declared!==null&&<p>最近读取时平台声明 {counts.declared} 条{counts.different?' · 差额原因尚未确认':''}</p>}</div><div className="info-comment-tools"><div className="info-comment-tabs" role="group" aria-label="筛选本页评论">{([['all','全部',count],['roots','一级评论',rootCount],['replies','回复',replyCount]] as const).map(([value,label,n])=><button key={value} aria-pressed={commentView===value} onClick={()=>setCommentView(value)}>{label} <span>{n}</span></button>)}</div><label className="info-comment-search"><Search size={14}/><input aria-label="搜索本页评论或昵称" placeholder="搜索本页评论或昵称" value={commentSearch} onChange={e=>setCommentSearch(e.target.value)}/></label></div>{filtering&&<small className="info-filter-result" role="status">本页筛选显示 {savedCommentCount(shown)} 条</small>}</header>
   <div ref={commentViewport} className="info-comments" onKeyDown={paneKeys} role="region" tabIndex={0} aria-label="已保存评论列表">{rows.map(({comment:c,depth,parent,parentAmbiguous},index)=><Fragment key={c.id}><article hidden={!matches(c)||(!filtering&&hidden.has(c.id))} className="info-comment-row" data-comment={c.id} data-reply={!!c.snapshot.parentId} data-linked={!!parent} tabIndex={-1} ref={node=>{if(node)rowNodes.current.set(c.id,node);else rowNodes.current.delete(c.id);}} style={{'--reply-depth':depth} as CSSProperties}>
    <SavedAvatar url={c.snapshot.authorAvatarUrl}/>
    <div className="info-comment-meta"><span className="info-comment-kind" title={displayNickname(c.snapshot.authorNickname)||'昵称未采集'}>{displayNickname(c.snapshot.authorNickname)||'昵称未采集'}{c.snapshot.isDemo&&<small>演示</small>}</span>
    {parent&&<span className="info-parent-context"><button className="info-text-action" aria-label="查看父评论" title={displayNickname(parent.snapshot.authorNickname)||'父评论'} onClick={()=>focusParent(parent.id)}>所属讨论：{displayNickname(parent.snapshot.authorNickname)||'父评论'}</button></span>}</div>
    {c.snapshot.parentId&&!parent&&<button className="info-text-action info-parent-context" onClick={e=>setContext({commentId:c.snapshot.parentId!,label:'父评论上下文',fallback:c.snapshot.parent,trigger:e.currentTarget})}>查看父评论上下文</button>}
    {c.snapshot.parentId&&!parent&&<details className="info-parent-missing"><summary>{parentAmbiguous?'父评论有多个版本':c.snapshot.parent!=null?'父评论不在本页':'父评论未加载'}</summary><p>{parentAmbiguous?'本页父评论有多个版本':c.snapshot.parent!=null?'父评论不在本页 · 已保存上下文':'父评论原文未保存，可能位于其他页'}</p>{c.snapshot.parent!=null&&<SavedText key={c.id+'parent'} text={savedSourceText(c.snapshot.parent)} limit={85} label="父评论"/>}</details>}
    {targets.get(c.id)?.state==='RESOLVED'&&<button className="info-text-action info-parent-context" aria-label="查看回复对象" onClick={()=>focusTarget(targets.get(c.id)!.comment!)}>回复 {displayNickname(targets.get(c.id)!.comment!.snapshot.authorNickname)||'该评论'}</button>}
    {targets.get(c.id)?.state==='UNAVAILABLE'&&<button className="info-text-action info-parent-context" onClick={e=>setContext({...c.snapshot.replyTarget!,label:'回复对象上下文',trigger:e.currentTarget})}>查看回复对象上下文</button>}
    {targets.get(c.id)?.state==='CONFLICT'&&<small className="info-parent-context">回复对象待核对</small>}
    <SavedText key={c.id} text={savedSourceText(c.snapshot.comment)} limit={360} label="评论"/>
    <div className="info-comment-footer"><time title="北京时间（UTC+8）" dateTime={displayPublication(c.snapshot.publishedAt)||c.lastSeenAt}>{displayPublication(c.snapshot.publishedAt)?'发布于':'采集于'} {readingTime(displayPublication(c.snapshot.publishedAt)||c.lastSeenAt)}</time>{c.post.coverage!==scope&&<small>{coverageLabel(c.post.coverage)}</small>}<button className="info-text-action" aria-label={`评论 ${index+1} 的来源与证据`} onClick={e=>openEvidence(c,e.currentTarget)}>证据</button></div>
   </article>{!filtering&&(groupEnds.get(c.id)?.count||0)>1&&<button className="info-replies-toggle info-text-action" aria-expanded={expandedReplies.has(groupEnds.get(c.id)!.root)} onClick={()=>setExpandedReplies(prev=>{const next=new Set(prev),root=groupEnds.get(c.id)!.root;if(next.has(root))next.delete(root);else next.add(root);return next;})}>{expandedReplies.has(groupEnds.get(c.id)!.root)?<ChevronUp size={13}/>:<ChevronDown size={13}/>}<span>{expandedReplies.has(groupEnds.get(c.id)!.root)?'收起回复':`展开本页其余 ${groupEnds.get(c.id)!.count-1} 条回复记录`}</span></button>}</Fragment>)}</div>
   {!comments.length&&<p className="info-comment-empty" role="status">{hasOtherPages?'本页没有该帖评论，可翻阅其他评论页。':'当前返回内容没有该帖评论原文。'} 不代表平台没有评论。</p>}
  </div></div>
  <CommentContextSheet request={context} configId={configId} postId={id} onClose={()=>setContext(null)}/>
  <Sheet open={evidence!==null} onOpenChange={open=>{if(!open)setEvidence(null);}}><SheetContent className="task-settings-sheet info-evidence-sheet" onCloseAutoFocus={e=>{e.preventDefault();returnFocus.current?.focus({preventScroll:true});}}><SheetHeader><SheetTitle>来源与证据</SheetTitle><SheetDescription>已保存的原始记录，不重新请求平台。</SheetDescription></SheetHeader><div className="task-settings-body">
   {evidence==='post'?<><dl><dt>平台</dt><dd>{platformLabel[platform]}</dd><dt>来源帖子 ID</dt><dd>{id}</dd></dl>{post?.versions.map(v=><details key={v.id}><summary>帖子原文 · {formatDate(v.lastSeenAt)}</summary><p>{savedSourceText(v.snapshot.body)}</p><p>{coverageLabel(v.coverage)} · {reasonLabels[v.stopReason||'']||'停止原因未返回'}</p><dl><dt>存档版本</dt><dd>{v.id}</dd></dl><ImageDiagnostics value={v.snapshot.imageDiagnostics}/><BoundedReadEvidence value={v.snapshot.boundedRead}/><BoundedReadWindows values={v.snapshot.boundedReadWindows}/></details>)}{!post?.versions.length&&<p>本页未返回独立帖子版本。</p>}</>:evidence&&<><dl><dt>来源帖子 ID</dt><dd>{evidence.snapshot.postId}</dd><dt>评论 ID</dt><dd>{evidence.platformCommentId||evidence.snapshot.commentId}</dd>{evidence.snapshot.parentId&&<><dt>父评论 ID</dt><dd>{evidence.snapshot.parentId}</dd><dt>直接回复对象</dt><dd>{evidence.snapshot.replyTargetConflict?'来源关系冲突，未自动替换':evidence.snapshot.replyTarget?`来源 targetComment · 评论 ID ${evidence.snapshot.replyTarget.commentId}`:'未采集；所属讨论不等于直接回复对象。'}</dd></>}<dt>昵称</dt><dd>{displayNickname(evidence.snapshot.authorNickname)||'未采集'}</dd><dt>原始发布时间（北京时间）</dt><dd>{displayPublication(evidence.snapshot.publishedAt)?readingTime(evidence.snapshot.publishedAt!):'未采集'}</dd><dt>上下文版本</dt><dd>{evidence.contextVersion}</dd><dt>最近保存</dt><dd>{formatDate(evidence.lastSeenAt)}</dd></dl><ImageDiagnostics value={evidence.snapshot.imageDiagnostics}/><h3>评论原文</h3><p>{savedSourceText(evidence.snapshot.comment)}</p>{evidence.snapshot.parentId&&<><h3>当时的父评论</h3><p>{evidence.snapshot.parent??'未保存'}</p></>}<details><summary>当时的帖子上下文</summary><h3>{savedTitleLabel(evidence.snapshot.title)}</h3><p>{evidence.snapshot.body||'正文未保存'}</p></details><p>{coverageLabel(evidence.post.coverage)} · {reasonLabels[evidence.post.stopReason||'']||'停止原因未返回'}</p><p>{evidence.reviews.length?'已有分析记录，原文独立保留':'未分析 · 无评分'}</p></>}
  </div></SheetContent></Sheet>
 </section>;
}
