import {useState} from 'react';
import {Link} from 'react-router-dom';
import {ImageOff} from 'lucide-react';
import {safePostCoverUrl,type SemanticReviewItem} from '@crm/contracts';
import {Button} from '@/components/ui/button';
import {SavedAvatar} from '@/features/collection/saved-avatar';
import {displayNickname,displayPublication,readingTime} from '@/features/collection/display-metadata';
export function ReviewAuthor({item:r}:{item:SemanticReviewItem}){const published=displayPublication(r.source?.publishedAt);return <div className="review-author"><SavedAvatar url={r.source?.authorAvatarUrl}/><div><span className="review-author-name">{displayNickname(r.source?.authorNickname)||'用户名称未保存'}</span><span className="graphite-review-meta">{published?<time dateTime={published}>评论发布 {readingTime(published)} · 北京时间</time>:'评论发布时间未知'}</span></div></div>;}
export function ReviewSource({item:r,detail=false}:{item:SemanticReviewItem;detail?:boolean}){const safe=safePostCoverUrl(r.source?.coverUrl),[failed,setFailed]=useState(false),url=r.source?.configId&&r.source.platformPostId?'/work?'+new URLSearchParams({module:'archive',config:r.source.configId,post:r.source.platformPostId}).toString():null;return <div className="review-source-media"><span className="review-source-cover">{safe&&!failed?<img src={safe} alt="来源帖子封面" loading="lazy" decoding="async" referrerPolicy="no-referrer" crossOrigin="anonymous" onError={()=>setFailed(true)}/>:<ImageOff aria-label="封面未保存或不可用"/>}</span><div><p>{r.snapshot.title||'来源帖子标题缺失'}</p>{url&&<Button variant="link" size="sm" asChild><Link to={url}>查看原文</Link></Button>}{detail&&<span className="graphite-review-meta">已保存的来源帖子</span>}</div></div>;}
