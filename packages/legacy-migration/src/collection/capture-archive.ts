import {runConfigSnapshot} from '@crm/domain/collection/contract';
import {commitCheckpoint,checkpointParents,type CheckpointLease} from './comment-checkpoint';
import { CapturedComment, CollectionConfig, CollectionRun, Prisma } from '@prisma/client';
import {mergeReplyTarget,type ReplyTargetMetadata} from '@crm/contracts';
import { SemanticSnapshot, CaptureDisplay, captureDisplay, safePostCoverUrl, safeImageDiagnostics, semanticRulesSchema } from '@crm/contracts';
import {runCoverage} from '@crm/domain/collection/run-coverage';
import {savedPostReference} from '@crm/domain/collection/post-reference';
import { Db } from '../common/db';
import { configInput, ReadFailure } from '@crm/domain/collection/contract';
import { ReadResult } from '@crm/domain/collection/collector';
import { semanticSnapshot, snapshotHash } from '@crm/domain/collection/semantic-evaluator';
import { DEFAULT_QWEN_MODEL, qwenModel } from '@crm/domain/collection/qwen-models';
export const CAPTURE_CONTEXT_VERSION='captured-context-v1';
import {semanticHash} from '@crm/domain/common/semantic-hash';
export async function selectedSemanticModel(db:Db|Prisma.TransactionClient){return (await db.modelSettings.findUnique({where:{id:'qwen-comment-matching'},select:{model:true}}))?.model??DEFAULT_QWEN_MODEL;}
export async function enqueueCaptured(tx:Prisma.TransactionClient,c:CapturedComment,config:CollectionConfig,model?:string){
 model??=await selectedSemanticModel(tx);
 const rules=semanticRulesSchema.safeParse(config.semanticRules);if(!rules.success||!qwenModel(model))return 0;
 const s=c.snapshot as unknown as SemanticSnapshot,ruleHash=semanticHash(rules.data);
 const analysisKey=semanticHash({configId:config.id,ruleHash,model,context:c.contextVersion,content:c.contentHash});
 // The legacy unique key stays intact; new keys contain rule/model/context/content identity.
 const result=await tx.semanticReview.createMany({data:[{configId:config.id,runId:c.runId,revision:config.revision,snapshotHash:analysisKey,analysisKey,selectedModel:model,ruleHash,contextVersion:c.contextVersion,captureId:c.id,platform:config.platform,platformUserId:s.userId,snapshot:c.snapshot as Prisma.InputJsonValue,rules:rules.data,isDemo:c.isDemo,state:'UNANALYSED',reason:'已入队，未分析；需检查脱敏预览后手动评估'}],skipDuplicates:true});return result.count;
}
export async function checkpointCapture(db:Db,run:CollectionRun,result:ReadResult,guard?:(tx:Prisma.TransactionClient)=>Promise<void>,leases?:Map<string,CheckpointLease>){
 if(!result.posts.length)return;
 const spec=configInput.parse(runConfigSnapshot(run.snapshot)),isDemo=spec.mode!=='XHS_MCP';
 await db.$transaction(async tx=>{
  if(guard)await guard(tx);
  const [config]=await tx.$queryRaw<CollectionConfig[]>`SELECT * FROM "CollectionConfig" WHERE id=${run.configId} FOR UPDATE`;
  const current=await tx.collectionRun.findUniqueOrThrow({where:{id:run.id}});
  if(current.status!=='RUNNING'||current.cancelRequested||!config.enabled||config.archivedAt||config.revision!==run.revision)throw new ReadFailure('PAUSED');
  // Review is a separate explicit operation over committed captures, never part of ingestion.
  for(const entry of result.posts){
   const valid=(id:string)=>spec.mode==='MOCK'?id.startsWith('demo-collect-'):spec.mode==='XHS_FIXTURE'?id.startsWith('fixture-xhs-'):!/^(demo-|fixture-)/.test(id);
   if(!valid(entry.post.id)||entry.comments.some(c=>![c.id,c.userId,...(c.parentId?[c.parentId]:[])].every(valid)))throw new ReadFailure('INVALID_DATA');
   const {boundedRead,boundedReadWindows,coverageDiagnostic:_coverageDiagnostic,sourceReference,coverUrl,authorNickname,authorAvatarUrl,publishedAt,imageDiagnostics,...textPost}=entry.post;
   const display=captureDisplay({authorNickname,authorAvatarUrl,publishedAt});
   const previousPost=await tx.capturedPost.findUnique({where:{configId_platformPostId_contentHash:{configId:config.id,platformPostId:entry.post.id,contentHash:semanticHash(textPost)}},select:{snapshot:true}});
   const previousSnapshot=(previousPost?.snapshot||{}) as CaptureDisplay & {coverUrl?:string;sourceReference?:unknown};
   const retainedCover=coverUrl||safePostCoverUrl(previousSnapshot.coverUrl);
   const diagnostic=safeImageDiagnostics(imageDiagnostics);
   const retainedReference=spec.mode==='XHS_MCP'?savedPostReference(sourceReference,entry.post.id)||savedPostReference(previousSnapshot.sourceReference,entry.post.id):undefined;
   const postSnapshot={...textPost,...(boundedRead?{boundedRead}:{}),...(boundedReadWindows?{boundedReadWindows}:{}),...(retainedReference?{sourceReference:retainedReference}:{}),...(diagnostic?{imageDiagnostics:diagnostic}:{}),...captureDisplay(previousSnapshot),...display,...(retainedCover?{coverUrl:retainedCover}:{})};
   const postHash=semanticHash(textPost),p=await tx.capturedPost.upsert({where:{configId_platformPostId_contentHash:{configId:config.id,platformPostId:entry.post.id,contentHash:postHash}},create:{configId:config.id,runId:run.id,platformPostId:entry.post.id,contentHash:postHash,snapshot:postSnapshot,lastRunId:run.id,stopReason:entry.stopReason||null,coverage:entry.complete?'COMPLETE':'PARTIAL'},update:{snapshot:postSnapshot,lastRunId:run.id,lastSeenAt:new Date(),coverage:entry.complete?'COMPLETE':'PARTIAL',stopReason:entry.stopReason||(entry.complete?null:'WINDOW_IN_PROGRESS')}});
   const parents=await checkpointParents(tx,config.id,entry.post.id,entry.comments,entry.chunk);
   for(const comment of entry.chunk?(entry.chunkComments||[]):entry.comments){
    const snapshot=semanticSnapshot(entry.post,comment,comment.parentId?parents.get(comment.parentId):undefined,entry.complete,isDemo),contentHash=snapshotHash(snapshot);
    const key={configId:config.id,platformCommentId:comment.id,contentHash,contextVersion:CAPTURE_CONTEXT_VERSION};
    const previous=await tx.capturedComment.findUnique({where:{configId_platformCommentId_contentHash_contextVersion:key},select:{snapshot:true}});
    // Preserve optional metadata when a later finite window omits it; semantic hash stays text-only.
    const commentDiagnostic=safeImageDiagnostics(comment.imageDiagnostics);
    const archived={...snapshot,...mergeReplyTarget((previous?.snapshot||{}) as ReplyTargetMetadata,comment.replyTarget,comment.replyTargetConflict),...(commentDiagnostic?{imageDiagnostics:commentDiagnostic}:{}),...captureDisplay((previous?.snapshot||{}) as CaptureDisplay),...captureDisplay({authorNickname:comment.nickname,authorAvatarUrl:comment.authorAvatarUrl,publishedAt:comment.publishedAt})};
    const c=await tx.capturedComment.upsert({where:{configId_platformCommentId_contentHash_contextVersion:{configId:config.id,platformCommentId:comment.id,contentHash,contextVersion:CAPTURE_CONTEXT_VERSION}},create:{configId:config.id,runId:run.id,postId:p.id,platformCommentId:comment.id,contentHash,contextVersion:CAPTURE_CONTEXT_VERSION,snapshot:archived,isDemo,lastRunId:run.id},update:{snapshot:archived,lastRunId:run.id,lastSeenAt:new Date()}});

   }
   if(entry.chunk){const lease=leases?.get(entry.post.id);if(!lease)throw new ReadFailure('AUTHORIZATION_ENDED');await commitCheckpoint(tx,lease,entry.chunk,entry.post.id,entry.chunkComments||[],entry.complete);}
  }
  const [posts,comments]=await Promise.all([tx.capturedPost.groupBy({by:['platformPostId'],where:{configId:config.id,lastRunId:run.id}}),tx.capturedComment.groupBy({by:['platformCommentId'],where:{configId:config.id,lastRunId:run.id}})]);
  const coverage=runCoverage(result);
  await tx.collectionRun.update({where:{id:run.id},data:{capturedPosts:posts.length,capturedCommentsCount:comments.length,...(coverage?{metrics:{coverage}}:{})}});
 },{timeout:20000});
}
export async function finishCapture(db:Db,run:CollectionRun,result:ReadResult){
 // A task's search or another post's failure cannot downgrade an independently
 // verified post. A failure before a final result leaves checkpoints partial.
 if(!result.posts.length){
  await db.capturedPost.updateMany({where:{configId:run.configId,lastRunId:run.id},data:{stopReason:result.reason||null,coverage:'PARTIAL'}});
  return;
 }
 for(const entry of result.posts){
  await db.capturedPost.updateMany({where:{configId:run.configId,lastRunId:run.id,platformPostId:entry.post.id},data:{stopReason:entry.stopReason||(entry.complete?null:result.reason||'MCP_WINDOW_ONLY'),coverage:entry.complete?'COMPLETE':'PARTIAL'}});
 }
}
