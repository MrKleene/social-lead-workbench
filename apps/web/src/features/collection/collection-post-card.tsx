import { Button } from '@/components/ui/button';
import { TableRow, TableCell } from '@/components/ui/table';
import {PostStateTag} from './post-availability';
import {postCounts} from './post-counts';
import {savedTitleLabel} from '@/features/collection/saved-text';
import {displayNickname} from './display-metadata';
import {useState} from 'react';
import {commentCoverage} from './collection-outcome';
import {ImageOff} from 'lucide-react';
import {safePostCoverUrl} from '@crm/contracts';
import {formatDate,platformLabel} from '@/lib/types';
import {savedCommentCount,type InfoPost} from './collection-info-model';
export function CollectionPostCard({post,platform,onOpen}:{post:InfoPost;platform:keyof typeof platformLabel;onOpen:()=>void}){
 const url=safePostCoverUrl(post.coverUrl),[failed,setFailed]=useState<string>();
 const {saved,declared}=postCounts(post),count=saved??savedCommentCount(post.comments);
 const coverage=commentCoverage(post.versions[0]?.snapshot.boundedRead,post.versions[0]?.stopReason,saved);
 return <TableRow className="archive-post-row">
  <TableCell className="archive-post-identity"><span className="archive-post-thumb">{url&&failed!==url?<img src={url} alt="" loading="lazy" decoding="async" crossOrigin="anonymous" referrerPolicy="no-referrer" onError={()=>setFailed(url)}/>:<ImageOff size={18} aria-label={url?'封面暂不可用':'暂无封面'}/>}</span><span><strong>{savedTitleLabel(post.title)}</strong><small>{platformLabel[platform]} · {displayNickname(post.versions[0]?.snapshot.authorNickname)||'昵称未采集'}</small></span></TableCell>
  <TableCell data-label="帖子状态"><PostStateTag value={post.versions[0]?.availability}/></TableCell>
  <TableCell data-label="已保存评论"><span className="archive-post-count">{count}</span><small>{saved===undefined?'本页已采集':'累计已保存'}评论／回复</small>{declared!==undefined&&declared!==null&&<small>平台声明 {declared} 条</small>}{post.comments.length>count&&<small>{post.comments.length} 个原文版本</small>}</TableCell>
  <TableCell data-label="读取覆盖"><span className="archive-coverage" data-warning={coverage.warning}>{coverage.label}</span></TableCell>
  <TableCell data-label="最近保存"><time dateTime={post.lastSeenAt}>{formatDate(post.lastSeenAt)}</time></TableCell>
  <TableCell className="archive-post-actions"><Button variant="ghost" data-post={post.id} onClick={onOpen} aria-label={`查看${savedTitleLabel(post.title)}原文`}>帖子原文</Button></TableCell>
 </TableRow>;
}
