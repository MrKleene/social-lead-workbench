import {z} from 'zod';
import {createHash} from 'node:crypto';
import type {Db} from '../common/db';
import {requireAdmin,type Actor} from '../auth/security';
import {contactLock,contactNow} from './contact-settings.service';
import {executionEventSchema} from './reply-stage-journal';
import {semanticHash} from '../collection/capture-archive';
import {singleReplyScopeSchema} from './single-reply-scope';
const pid=z.string().regex(/^[a-f0-9]{24}$/),sha=(s:string)=>createHash('sha256').update(s).digest('hex');
export const capturedReadbackSchema=z.object({source:z.literal('OWNED_MCP_BOUNDED_READBACK'),attemptId:z.string().min(1),readbackRequestId:z.string().uuid(),accountId:z.string().min(1),senderId:pid,postId:pid,commentId:pid,recipientId:pid,replyId:pid,contentSha256:z.string().regex(/^[a-f0-9]{64}$/),observedAt:z.string().datetime(),identityVerified:z.literal(true),stopped:z.literal(true),matches:z.literal(1)}).strict();
export type CapturedReadback=z.infer<typeof capturedReadbackSchema>;
/** Reviewed against the captured 2026-10-28 response and independent readback.
 * code/status alone cannot confirm visibility; the exact new ID and full tuple
 * must independently reappear. No raw headers, cookies or arbitrary fields. */
export function capturedReceipt(metadata:unknown[]){
 const parsed=metadata.map(m=>executionEventSchema.safeParse(m));if(parsed.some(p=>!p.success))return null;
 const events=parsed.flatMap(p=>p.success?[p.data]:[]);if(events.length!==3||events[0].stage!=='RPC_INTENT'||events[1].stage!=='RPC_RETURNED'||events[2].stage!=='TRANSPORT_STOP')return null;
 const [intent,returned,stop]=events;if(!returned.envelopeValid||!['UNKNOWN','ACCEPTED','CONFIRMED'].includes(returned.kind)||!stop.stopped||stop.journal.state!=='AVAILABLE'||events.some(e=>e.protocolAttemptId!==intent.protocolAttemptId))return null;
 const rows=stop.journal.records;if(rows[0]?.stage!=='STARTED'||rows.at(-1)?.stage!=='DRIVER_CLOSED'||rows.at(-1)?.stopped!==true||rows.some((r,i)=>r.sequence!==i+1||r.attemptId!==intent.protocolAttemptId)||rows.filter(r=>r.stage==='ATTEMPTED').length!==1||rows.filter(r=>r.stage==='AFTER_SUBMIT').length!==1)return null;
 const receipts=rows.filter(r=>r.stage==='RECEIPT_CAPTURE').map(r=>r.receipt);if(receipts.some(r=>!r||['AMBIGUOUS_REQUEST','RESPONSE_UNAVAILABLE','REQUEST_NOT_OBSERVED'].includes(r.state)))return null;
 const requests=receipts.filter(r=>r?.state==='REQUEST_MATCHED'),responses=receipts.filter(r=>r?.state==='RESPONSE_CAPTURED');if(requests.length!==1||responses.length!==1)return null;
 const request=requests[0]!,response=responses[0]!,endpoint=sha('https://edith.xiaohongshu.com/api/sns/web/v1/comment/post');
 if(request.endpointHost!=='edith.xiaohongshu.com'||request.endpointPath!=='/api/sns/web/v1/comment/post'||request.endpointSha256!==endpoint||response.endpointSha256!==endpoint||!request.requestSha256||response.requestSha256!==request.requestSha256||!response.responseSha256||response.status!==200)return null;
 const field=(fields:typeof request.fields,path:string)=>{const found=fields?.filter(f=>f.path===path);return found?.length===1?found[0]:undefined;};
 for(const [path,binding] of [['/note_id','POST'],['/target_comment_id','TARGET'],['/content','CONTENT']]){const f=field(request.fields,path);if(f?.type!=='string'||f.binding!==binding)return null;}
 for(const [path,binding] of [['/data/comment/note_id','POST'],['/data/comment/target_comment/id','TARGET'],['/data/comment/target_comment/user_info/user_id','RECIPIENT'],['/data/comment/user_info/user_id','SENDER'],['/data/comment/content','CONTENT']]){const f=field(response.fields,path);if(f?.type!=='string'||f.binding!==binding)return null;}
 const code=field(response.fields,'/code'),success=field(response.fields,'/success'),id=field(response.fields,'/data/comment/id');if(code?.type!=='number'||code.number!==0||success?.type!=='boolean'||success.boolean!==true||id?.type!=='string'||!id.publicId)return null;
 return {replyId:id.publicId,protocolAttemptId:intent.protocolAttemptId,requestSha256:request.requestSha256,responseSha256:response.responseSha256,closedAt:rows.at(-1)!.at};
}
/** Internal operator reconciliation. No HTTP route and no send/queue capability.
 * The original UNKNOWN audit remains immutable; only this now-proven attempt is
 * advanced to CONFIRMED. Quota, recipient lock and global pause are untouched. */
export class CapturedReplyReconciliation {
 constructor(private db:Db){}
 async confirm(actor:Actor,input:unknown){requireAdmin(actor);const proof=capturedReadbackSchema.parse(input);return this.db.$transaction(async tx=>{
  await contactLock(tx);const now=await contactNow(tx),user=await tx.user.findUnique({where:{id:actor.id}}),a=await tx.contactAttempt.findUnique({where:{id:proof.attemptId},include:{ledger:{include:{identity:true}}}});
  if(!user?.active||user.role!=='ADMIN'||!a||a.mode!=='REAL'||a.channel!=='COMMENT'||a.actorId!==actor.id||a.accountIdSnapshot!==proof.accountId||a.ledger.accountId!==proof.accountId||a.ledger.identity.platformUserId!==proof.recipientId)throw Error('RECONCILIATION_SCOPE_MISMATCH');
  const starts=await tx.auditLog.findMany({where:{entityId:a.requestKey,action:'SINGLE_REPLY_TEST_AUTHORIZED_RESERVED'}});if(starts.length!==1)throw Error('RECONCILIATION_SCOPE_MISMATCH');
  const auth=starts[0].metadata as Record<string,any>,scope=singleReplyScopeSchema.parse(auth.scope);if(auth.attemptId!==a.id||auth.scopeHash!==semanticHash(scope)||scope.purpose!=='CAPTURE_EXACT_COMMENT_RECEIPT_ONCE'||['accountId','senderId','postId','commentId','recipientId'].some(k=>(scope as any)[k]!== (proof as any)[k])||sha(scope.content)!==proof.contentSha256||a.content!==scope.content)throw Error('RECONCILIATION_SCOPE_MISMATCH');
  const events=await tx.auditLog.findMany({where:{entityId:a.requestKey,action:'SINGLE_REPLY_EXECUTION_STAGE'},orderBy:{createdAt:'asc'}}),receipt=capturedReceipt(events.map(e=>e.metadata));if(!receipt||receipt.replyId!==proof.replyId||[scope.postId,scope.commentId,scope.senderId,scope.recipientId].includes(proof.replyId))throw Error('RECEIPT_NOT_PROVEN');
  const observed=Date.parse(proof.observedAt);if(observed<Date.parse(receipt.closedAt)||observed>now.getTime()+5000||now.getTime()-observed>900000)throw Error('READBACK_EXPIRED');
  const checks=await tx.auditLog.findMany({where:{entityId:proof.readbackRequestId,actorId:actor.id,action:'ACCOUNT_TASK_LOGIN_CHECK_RESULT'}});if(checks.length!==1||(checks[0].metadata as any)?.state!=='VERIFIED'||checks[0].createdAt.getTime()<Date.parse(receipt.closedAt)||checks[0].createdAt.getTime()>observed)throw Error('READBACK_IDENTITY_UNPROVEN');
  if(await tx.deviceExecutionLease.count({where:{accountId:proof.accountId}}))throw Error('READBACK_NOT_CLOSED');
  const account=await tx.platformAccount.findUnique({where:{id:proof.accountId}});if(account?.loginPlatformUserId!==proof.senderId)throw Error('ACCOUNT_CHANGED');
  const prior=await tx.auditLog.findFirst({where:{entityId:a.requestKey,action:'SINGLE_REPLY_CAPTURE_RECONCILED'}});if(a.outcome==='CONFIRMED'&&a.platformReceipt===proof.replyId&&prior)return {outcome:'CONFIRMED' as const,reused:true,attemptId:a.id,replyId:proof.replyId};
  if(a.outcome!=='UNKNOWN'||a.confirmedAt||a.platformReceipt||prior)throw Error('ATTEMPT_NOT_RECONCILABLE');
  const ends=await tx.auditLog.findMany({where:{entityId:a.requestKey,action:'SINGLE_REPLY_TEST_FINISHED'}});if(ends.length!==1||(ends[0].metadata as any)?.result!=='UNKNOWN'||(ends[0].metadata as any)?.stopped!==true)throw Error('ATTEMPT_NOT_CLOSED');
  if(await tx.capturedComment.findFirst({where:{platformCommentId:proof.replyId,createdAt:{lt:a.attemptedAt??a.createdAt}}}))throw Error('REPLY_ID_PREEXISTED');
  const usage=await tx.accountDay.findUnique({where:{accountId_day:{accountId:proof.accountId,day:a.day}}});if(!usage||usage.occupied<1)throw Error('QUOTA_RESERVATION_MISSING');
  await tx.auditLog.create({data:{actorId:actor.id,entityId:a.requestKey,action:'SINGLE_REPLY_CAPTURE_RECONCILED',metadata:{from:'UNKNOWN',to:'CONFIRMED',proof,receipt,quotaRetained:true,recipientLockRetained:true,automaticContactEnabled:false}}});
  await tx.contactAttempt.update({where:{id:a.id},data:{outcome:'CONFIRMED',platformReceipt:proof.replyId,confirmedAt:now,resolutionNote:'平台响应与独立只读回查的回复ID、账号、帖子、目标评论、收件人与正文一致；保留额度与去重锁',version:{increment:1}}});
  return {outcome:'CONFIRMED' as const,reused:false,attemptId:a.id,replyId:proof.replyId};
 });}
}
