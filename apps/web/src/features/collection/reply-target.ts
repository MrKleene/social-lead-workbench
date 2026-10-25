import {savedReplyTarget} from '@crm/contracts';
import type {ArchivedComment} from './archive-data';
export function replyTargetFor(comment:ArchivedComment,items:ArchivedComment[]):{state:'MISSING'|'CONFLICT'|'UNAVAILABLE'|'RESOLVED';comment?:ArchivedComment} {
 const target=savedReplyTarget(comment.snapshot.replyTarget);
 if(comment.snapshot.replyTargetConflict)return {state:'CONFLICT'};
 if(!target)return {state:'MISSING'};
 if(target.commentId===comment.snapshot.commentId)return {state:'CONFLICT'};
 const matches=items.filter(c=>c.snapshot.postId===comment.snapshot.postId&&c.snapshot.commentId===target.commentId);
 if(!matches.length)return {state:'UNAVAILABLE'};
 if(matches.length!==1||(target.userId&&matches[0].snapshot.userId!==target.userId))return {state:'CONFLICT'};
 return {state:'RESOLVED',comment:matches[0]};
}
