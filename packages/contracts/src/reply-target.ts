import {z} from 'zod';
const id=z.string().regex(/^[A-Za-z0-9_-]{1,200}$/);
export const replyTargetSchema=z.object({source:z.literal('targetComment'),commentId:id,userId:id.optional()}).strict();
export type ReplyTarget=z.infer<typeof replyTargetSchema>;
export type ReplyTargetMetadata={replyTarget?:ReplyTarget;replyTargetConflict?:true};
export function savedReplyTarget(value:unknown):ReplyTarget|undefined {const p=replyTargetSchema.safeParse(value);return p.success?p.data:undefined;}
/** Exact observed public fields only. Never infer a target from an author or text. */
export function sourceReplyTarget(value:unknown,self:string):ReplyTarget|undefined {
 const p=z.object({id:z.string().regex(/^[A-Za-z0-9_-]{1,150}$/),userInfo:z.unknown().optional()}).safeParse(value);
 if(!p.success||p.data.id===self)return;
 const user=z.object({userId:z.string().regex(/^[A-Za-z0-9_-]{1,150}$/)}).safeParse(p.data.userInfo);
 return {source:'targetComment',commentId:p.data.id,...(user.success?{userId:user.data.userId}:{})};
}
/** Enrichment cannot change the content version or silently replace conflicting evidence. */
export function mergeReplyTarget(previous:ReplyTargetMetadata,next:unknown,nextConflict=false):ReplyTargetMetadata {
 const old=savedReplyTarget(previous.replyTarget),fresh=savedReplyTarget(next);
 const conflict=nextConflict||previous.replyTargetConflict===true||!!(old&&fresh&&(old.commentId!==fresh.commentId||(old.userId&&fresh.userId&&old.userId!==fresh.userId)));
 const replyTarget=old?{...old,...(!conflict&&fresh?.userId?{userId:fresh.userId}:{})}:fresh;
 return {...(replyTarget?{replyTarget}:{}),...(conflict?{replyTargetConflict:true as const}:{})};
}
