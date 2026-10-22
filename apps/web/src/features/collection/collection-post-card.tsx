import {savedTitleLabel} from '@/features/collection/saved-text';
import {useState} from 'react';
import {coverageLabel} from './archive-labels';
import {ImageOff,MessageSquare,ArrowUpRight} from 'lucide-react';
import {safePostCoverUrl} from '@crm/contracts';
import {formatDate,platformLabel} from '@/lib/types';
import {savedCommentCount,type InfoPost} from './collection-info-model';
export function CollectionPostCard({post,platform,onOpen}:{post:InfoPost;platform:keyof typeof platformLabel;onOpen:()=>void}){
 const url=safePostCoverUrl(post.coverUrl),[failed,setFailed]=useState<string>();
 const count=savedCommentCount(post.comments);
 return <button className="info-post-card" data-post={post.id} onClick={onOpen}>
  <span className="info-post-cover">{url&&failed!==url?<img src={url} alt="" loading="lazy" decoding="async" crossOrigin="anonymous" referrerPolicy="no-referrer" onError={()=>setFailed(url)}/>:<span className="info-cover-placeholder"><ImageOff size={26}/>{url?'封面暂不可用':'暂无封面'}</span>}<span className="info-cover-platform">{platformLabel[platform]}</span></span>
  <span className="info-post-content"><span className="info-post-top"><strong>{savedTitleLabel(post.title)}</strong><ArrowUpRight size={16} aria-hidden="true"/></span><span className="info-card-count"><MessageSquare size={14} aria-hidden="true"/>本页已采集 {count} 条评论／回复</span>{post.comments.length>count&&<small>{post.comments.length} 个原文版本</small>}<small>{formatDate(post.lastSeenAt)} · {coverageLabel(post.versions[0]?.coverage||post.comments[0]?.snapshot.coverage||'UNKNOWN')}</small></span>
 </button>;
}
