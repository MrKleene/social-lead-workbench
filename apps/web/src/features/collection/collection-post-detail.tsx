import {useEffect,useRef} from 'react';
import {Button} from '@/components/ui/button';
import {formatDate} from '@/lib/types';
import {coverageLabel} from './archive-labels';
import {replyDepth,savedCommentCount,type InfoPost} from './collection-info-model';
import type {ArchivedComment} from './archive-data';
import {reasonLabels} from './types';
export function CollectionPostDetail({post,id,comments,hasOtherPages,onBack}:{post?:InfoPost;id:string;comments:ArchivedComment[];hasOtherPages:boolean;onBack:()=>void}){
 const heading=useRef<HTMLHeadingElement>(null);
 useEffect(()=>{heading.current?.focus({preventScroll:true});},[id]);
 return <section className="info-post-detail" aria-label="帖子评论详情"><Button variant="ghost" onClick={onBack}>← 返回帖子列表</Button><h2 ref={heading} tabIndex={-1}>{post?.title||'帖子标题缺失'}</h2><small>来源帖子 ID：{id}</small>
 {post?.versions.map(p=><details className="info-post-original" key={p.id}><summary>帖子原文 · {coverageLabel(p.coverage)}</summary><p>{p.snapshot.body||'帖子正文未获取'}</p><small>{formatDate(p.lastSeenAt)} · {reasonLabels[p.stopReason||'']||p.stopReason||'停止原因未返回'}</small></details>)}
 {!post?.versions.length&&<p className="helper-text">当前返回内容没有独立帖子原文，可查看已保存的评论上下文。</p>}
 <h3>本页已采集 {savedCommentCount(comments)} 条评论／回复</h3>
 <div className="info-comments">{comments.map(c=><article className="archive-comment" key={c.id} style={{'--reply-depth':replyDepth(c,comments)} as React.CSSProperties}><div className="source-flags"><span>{c.snapshot.parentId?'回复':'一级评论'}</span><span>{coverageLabel(c.post.coverage)}</span><span>{c.snapshot.isDemo?'虚构样本':'平台原文'}</span></div>
 <p className="archive-original">{c.snapshot.comment||'评论原文未保存'}</p>{c.snapshot.parentId&&<blockquote>父评论：{c.snapshot.parent??'原文未采到，需待确认'}</blockquote>}
 <small>评论 ID：{c.platformCommentId||c.snapshot.commentId} · {formatDate(c.lastSeenAt)}</small><details><summary>查看上下文与原文证据</summary><p>帖子正文：{c.snapshot.body||'未获取'}</p><p>来源帖子 {c.snapshot.postId} · 评论 {c.snapshot.commentId}{c.snapshot.parentId&&` · 父评论 ${c.snapshot.parentId}`}</p><p>上下文版本 {c.contextVersion} · {c.reviews.length?'已有分析记录，原文独立保留':'未分析 · 无评分'}</p><p>{reasonLabels[c.post.stopReason||'']||c.post.stopReason||'停止原因未返回'}</p></details></article>)}</div>
 {!comments.length&&<p role="status">{hasOtherPages?'本页没有该帖评论，可翻阅其他评论页。':'当前返回内容没有该帖评论原文。'} 不代表平台没有评论。</p>}
 </section>;
}
