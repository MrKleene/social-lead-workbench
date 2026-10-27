import {PostStateTag} from './post-availability';
import {postCounts} from './post-counts';
import {savedTitleLabel} from '@/features/collection/saved-text';
import {SavedAvatar} from './saved-avatar';
import {displayNickname} from './display-metadata';
import {useState} from 'react';
import {commentCoverage} from './collection-outcome';
import {ImageOff,MessageSquare,ArrowUpRight} from 'lucide-react';
import {safePostCoverUrl} from '@crm/contracts';
import {formatDate,platformLabel} from '@/lib/types';
import {savedCommentCount,type InfoPost} from './collection-info-model';
export function CollectionPostCard({post,platform,onOpen}:{post:InfoPost;platform:keyof typeof platformLabel;onOpen:()=>void}){
 const url=safePostCoverUrl(post.coverUrl),[failed,setFailed]=useState<string>();
 const {saved,declared}=postCounts(post),count=saved??savedCommentCount(post.comments);
 return <button className="info-post-card" data-post={post.id} onClick={onOpen}>
  <span className="info-post-cover">{url&&failed!==url?<img src={url} alt="" loading="lazy" decoding="async" crossOrigin="anonymous" referrerPolicy="no-referrer" onError={()=>setFailed(url)}/>:<span className="info-cover-placeholder"><ImageOff size={26}/>{url?'封面暂不可用':'暂无封面'}</span>}<span className="info-cover-platform">{platformLabel[platform]}</span></span>
  <span className="info-post-content"><PostStateTag value={post.versions[0]?.availability}/><span className="info-card-author"><SavedAvatar url={post.versions[0]?.snapshot.authorAvatarUrl}/>{displayNickname(post.versions[0]?.snapshot.authorNickname)||'昵称未采集'}</span><span className="info-post-top"><strong>{savedTitleLabel(post.title)}</strong><ArrowUpRight size={16} aria-hidden="true"/></span>{post.versions[0]?.snapshot.body&&<span className="info-card-excerpt">{post.versions[0].snapshot.body}</span>}<span className="info-card-count"><MessageSquare size={14} aria-hidden="true"/>{saved===undefined?'本页已采集':'累计已保存'} {count} 条评论／回复</span>{declared!==undefined&&declared!==null&&<small>最近读取时平台声明 {declared} 条</small>}{post.comments.length>count&&<small>{post.comments.length} 个原文版本</small>}<small>{formatDate(post.lastSeenAt)} · {commentCoverage(post.versions[0]?.snapshot.boundedRead,post.versions[0]?.stopReason,saved).label}</small></span>
 </button>;
}
