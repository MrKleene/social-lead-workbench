import {createHash} from 'node:crypto';
import type {CollectionRun,Prisma} from '@prisma/client';
import {commentCheckpointSchema,type CommentCheckpoint,type CommentChunkReceipt,type SemanticSnapshot} from '@crm/contracts';
import type {Db} from '../common/db';
import {ReadFailure,type Comment} from './contract';
export function checkpointHash(value:CommentCheckpoint){return createHash('sha256').update(JSON.stringify(commentCheckpointSchema.parse(value))).digest('hex');}
export function commentDigest(post:string,c:Comment){const values=[post,c.id,c.parentId||'',c.userId,c.text];return createHash('sha256').update(values.map(x=>`${Buffer.byteLength(x)}:${x}`).join('')).digest('hex');}
export function validateChunk(previous:CommentCheckpoint,receipt:CommentChunkReceipt,post:string,comments:Comment[]){
 const next=commentCheckpointSchema.parse(receipt.checkpoint);
 if(checkpointHash(next)!==receipt.hash||next.sequence!==previous.sequence+(comments.length?1:0)||next.marks.length!==previous.marks.length+comments.length||JSON.stringify(next.marks.slice(0,previous.marks.length))!==JSON.stringify(previous.marks))throw new ReadFailure('INVALID_DATA');
 const byId=new Map(comments.map(c=>[c.id,c]));if(byId.size!==comments.length)throw new ReadFailure("INVALID_DATA");
 next.marks.slice(previous.marks.length).forEach(m=>{const c=byId.get(m.id);if(!c)throw new ReadFailure("INVALID_DATA");if(m.id!==c.id||m.parent!==(c.parentId||'')||m.digest!==commentDigest(post,c))throw new ReadFailure('INVALID_DATA');});
 if(receipt.replaying&&comments.length)throw new ReadFailure('INVALID_DATA');return next;
}
export type CheckpointLease={id:string;fence:number;runId:string;checkpoint:CommentCheckpoint};
const empty=():CommentCheckpoint=>({version:1,sequence:0,marks:[]});
/** Requires the current account/device authorization. Acquiring a new fence never
 * authorizes a platform request; the existing account lease still governs that. */
export async function acquireCheckpoint(db:Db,run:CollectionRun,post:string,guard:(tx:Prisma.TransactionClient)=>Promise<void>,restart=false):Promise<CheckpointLease>{
 const e=run.execution as {accountId?:string;deviceId?:string}|null;if(!e?.accountId||!e.deviceId)throw new ReadFailure('REAL_DISABLED');
 return db.$transaction(async tx=>{
  await guard(tx);await tx.$queryRaw`SELECT id FROM "CollectionConfig" WHERE id=${run.configId} FOR UPDATE`;
  const key={configId:run.configId,platformPostId:post,accountId:e.accountId!,deviceId:e.deviceId!};
  const row=await tx.commentReadCheckpoint.upsert({where:{configId_platformPostId_accountId_deviceId:key},create:{...key,revision:run.revision,checkpoint:empty()},update:{}});
  const current=await tx.collectionRun.findUniqueOrThrow({where:{id:run.id}});if(current.status!=='RUNNING'||current.cancelRequested)throw new ReadFailure('PAUSED');
  if(row.ownerRunId&&row.ownerRunId!==run.id&&row.expiresAt&&row.expiresAt>new Date()){const owner=await tx.collectionRun.findUnique({where:{id:row.ownerRunId},select:{status:true}});if(owner?.status==='RUNNING')throw new ReadFailure('DEVICE_UNAVAILABLE');}
  // Completed posts are fresh observations; incomplete checkpoints resume only
  // for the same configuration revision and authorized account/device.
  const checkpoint=!restart&&row.revision===run.revision&&row.state!=='COMPLETE'?commentCheckpointSchema.parse(row.checkpoint):empty();
  const claimed=await tx.commentReadCheckpoint.update({where:{id:row.id},data:{fence:{increment:1},ownerRunId:run.id,expiresAt:new Date(Date.now()+180000),revision:run.revision,checkpoint,sequence:checkpoint.sequence,state:'PARTIAL'}});
  return {id:row.id,fence:claimed.fence,runId:run.id,checkpoint};
 });
}
/** Called inside the SAME transaction as originals. No ACK is sent on rollback. */
export async function commitCheckpoint(tx:Prisma.TransactionClient,lease:CheckpointLease,receipt:CommentChunkReceipt,post:string,comments:Comment[],complete:boolean){
 const rows=await tx.$queryRaw<Array<{fence:number;ownerRunId:string|null;checkpoint:unknown;expiresAt:Date|null}>>`SELECT "fence","ownerRunId","checkpoint","expiresAt" FROM "CommentReadCheckpoint" WHERE id=${lease.id} FOR UPDATE`;
 const row=rows[0];if(!row||row.fence!==lease.fence||row.ownerRunId!==lease.runId||!row.expiresAt||row.expiresAt<=new Date())throw new ReadFailure('AUTHORIZATION_ENDED');
 const prior=commentCheckpointSchema.parse(row.checkpoint),next=commentCheckpointSchema.parse(receipt.checkpoint);
 if(checkpointHash(prior)!==receipt.hash)validateChunk(prior,receipt,post,comments); // exact transaction replay is idempotent
 else {
  if(JSON.stringify(next)!==JSON.stringify(prior)||receipt.replaying&&comments.length)throw new ReadFailure('INVALID_DATA');
  const marks=new Map(prior.marks.map(m=>[m.id,m]));if(new Set(comments.map(c=>c.id)).size!==comments.length)throw new ReadFailure('INVALID_DATA');
  for(const c of comments){const m=marks.get(c.id);if(!m||m.parent!==(c.parentId||'')||m.digest!==commentDigest(post,c))throw new ReadFailure('INVALID_DATA');}
 }
 await tx.commentReadCheckpoint.update({where:{id:lease.id},data:{sequence:next.sequence,checkpoint:next,state:complete?'COMPLETE':'PARTIAL',expiresAt:new Date(Date.now()+180000)}});
}
export async function releaseCheckpoints(db:Db,leases:Map<string,CheckpointLease>){for(const l of leases.values())await db.commentReadCheckpoint.updateMany({where:{id:l.id,fence:l.fence,ownerRunId:l.runId},data:{ownerRunId:null,expiresAt:null}});}

/** Restore only verified saved parents needed by this delta, not every prior
 * comment. Prevents missing context from changing a resumed comment version. */
export async function checkpointParents(tx:Pick<Prisma.TransactionClient,'capturedComment'>,configId:string,post:string,comments:Comment[],receipt?:CommentChunkReceipt){
 const parents=new Map(comments.map(c=>[c.id,c]));if(!receipt)return parents;
 const missing=[...new Set(comments.map(c=>c.parentId).filter((id):id is string=>!!id&&!parents.has(id)))];if(!missing.length)return parents;
 const marks=new Map(receipt.checkpoint.marks.map(m=>[m.id,m]));
 const candidates=await tx.capturedComment.findMany({where:{configId,platformCommentId:{in:missing},post:{platformPostId:post}},select:{snapshot:true}});
 for(const candidate of candidates){const s=candidate.snapshot as unknown as SemanticSnapshot,c:Comment={id:s.commentId,userId:s.userId,text:s.comment,parentId:s.parentId||undefined,nickname:'',hasReplies:false};if(marks.get(c.id)?.digest===commentDigest(post,c))parents.set(c.id,c);}
 if(missing.some(id=>!parents.has(id)))throw new ReadFailure('INVALID_DATA');return parents;
}
