import {safeBoundedReadReport} from '@crm/contracts';
type Row={id:string;userId:string;text:string;parentId?:string;hasReplies?:boolean;replyTarget?:{commentId?:string;userId?:string}};
/** Pure read-only evidence summary. No result here releases UNKNOWN or authorizes resend. */
export function assessCommentReadback(rows:Row[],coverage:unknown,target:{commentId:string;recipientId:string;senderId:string;content:string}) {
 const parents=rows.filter(r=>r.id===target.commentId);
 const parent=parents.length===1&&parents[0].userId===target.recipientId?parents[0]:null;
 const replies=parent?rows.filter(r=>r.parentId===parent.id||r.replyTarget?.commentId===parent.id):[];
 const matches=replies.filter(r=>r.userId===target.senderId&&r.text===target.content);
 const report=safeBoundedReadReport(coverage);
 const complete=!!parent&&report?.state==='COMPLETE'&&!(parent.hasReplies&&replies.length===0);
 return {submission:'UNKNOWN' as const,parentFound:!!parent,loadedReplies:replies.length,matchingReplyIds:matches.map(r=>r.id),coverage:complete?'COMPLETE_VISIBLE_RANGE':'INSUFFICIENT',reason:!parent?'TARGET_NOT_CONFIRMED':matches.length>1?'AMBIGUOUS_MATCH':matches.length===1?'MATCH_REQUIRES_RECEIPT_VERIFICATION':!complete?'PARENT_REPLY_COVERAGE_INSUFFICIENT':'NO_MATCH_IN_LOADED_RANGE'};
}
