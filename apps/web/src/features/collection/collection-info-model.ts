import {safePostCoverUrl} from '@crm/contracts';
import type {ArchivedComment,ArchivedPost} from './archive-data';
import {belongsToRun} from './archive-labels';
export type InfoPost={id:string;title:string;coverUrl?:string;lastSeenAt:string;versions:ArchivedPost[];comments:ArchivedComment[]};
/** Group only returned snapshots; counts are distinct comment IDs in this page, not platform totals. */
export function infoPosts(posts:ArchivedPost[],comments:ArchivedComment[],runId=''):InfoPost[]{
 const groups=new Map<string,InfoPost>();
 const ensure=(id:string,title:string,date:string)=>{let row=groups.get(id);if(!row){row={id,title,lastSeenAt:date,versions:[],comments:[]};groups.set(id,row);}if(!row.title&&title)row.title=title;if(date>row.lastSeenAt)row.lastSeenAt=date;return row;};
 for(const p of [...posts].filter(p=>belongsToRun(p,runId)).sort((a,b)=>b.lastSeenAt.localeCompare(a.lastSeenAt))){const row=ensure(p.platformPostId,p.snapshot.title,p.lastSeenAt);row.versions.push(p);row.coverUrl??=safePostCoverUrl(p.snapshot.coverUrl);}
 for(const c of comments.filter(c=>belongsToRun(c,runId)))ensure(c.snapshot.postId,c.snapshot.title,c.lastSeenAt).comments.push(c);
 return [...groups.values()].sort((a,b)=>b.lastSeenAt.localeCompare(a.lastSeenAt));
}
export function savedCommentCount(comments:ArchivedComment[]){return new Set(comments.map(c=>c.platformCommentId||c.snapshot.commentId)).size;}
export function replyDepth(comment:ArchivedComment,items:ArchivedComment[]){let parent=comment.snapshot.parentId,depth=0;const seen=new Set([comment.snapshot.commentId]);while(parent&&!seen.has(parent)&&depth<3){seen.add(parent);depth++;parent=items.find(c=>c.snapshot.commentId===parent)?.snapshot.parentId||null;}return depth;}
export function archiveOffset(value:string|null){const n=Number(value);return Number.isSafeInteger(n)&&n>=0&&n<=100000?Math.floor(n/50)*50:0;}

export function postListOffset(value:string|null){const n=Number(value);return Number.isSafeInteger(n)&&n>=0&&n<=100000?Math.floor(n/20)*20:0;}
