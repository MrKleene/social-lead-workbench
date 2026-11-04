import {ConflictException} from '@nestjs/common';
import {observedReadCounts,safeRunCoverage,type SemanticSnapshot} from '@crm/contracts';
import {semanticHash} from '../collection/capture-archive';
import {reviewObservations} from './review-observation';
import type {ReviewDb} from './review-policy.service';

/** Exact current-run targets. Historical originals remain stored but are not targets.
 * No UI pagination and no mutations: recovery membership is proved by the existing
 * checkpoint digest/identity guard, then reconciled with the full observed count. */
export async function autoReviewScope(db:ReviewDb,postId:string,runId?:string){
 const post=await db.capturedPost.findUnique({where:{id:postId}});
 const run=post?await db.collectionRun.findUnique({where:{id:runId||post.lastRunId},include:{config:true}}):null;
 if(!post||!run||post.configId!==run.configId||post.lastRunId!==run.id||run.cancelRequested||!['RUNNING','COMPLETE','PARTIAL'].includes(run.status))throw new ConflictException('本轮评论范围已变化，未送审');
 const captures=await db.capturedComment.findMany({where:{postId,configId:run.configId},orderBy:[{createdAt:'desc'},{id:'asc'}]});
 const mode=(run.snapshot as {mode?:string}).mode||run.config.mode;
 if(mode==='MOCK')return captures.filter(c=>c.lastRunId===run.id);
 const evidence=safeRunCoverage((run.metrics as {coverage?:unknown}|null)?.coverage)?.posts.find(p=>p.postRef===post.platformPostId);
 if(!evidence?.complete||post.coverage!=='COMPLETE')throw new ConflictException('缺少本轮完整评论覆盖证据，未送审');
 const expected=observedReadCounts(evidence).count;
 const observations=await reviewObservations(db,captures.map(c=>c.id));
 const members=captures.filter(c=>observations.get(c.id)?.coverage==='COMPLETE');
 // One current version per platform comment, matching the run review projection.
 const unique=new Map<string,(typeof captures)[number]>();
 for(const c of members){
  const s=c.snapshot as unknown as SemanticSnapshot;
  if(s.postId!==post.platformPostId||s.commentId!==c.platformCommentId)throw new ConflictException('本轮评论身份不一致，未送审');
  if(!unique.has(c.platformCommentId))unique.set(c.platformCommentId,c);
 }
 if(unique.size!==expected)throw new ConflictException('本轮已确认评论缺失或覆盖证据不一致，未送审');
 return [...unique.values()];
}
export function assertAutoReviewTargets(captures:Awaited<ReturnType<typeof autoReviewScope>>,rows:{captureId:string|null;snapshot:unknown;state:string}[]){
 const members=new Map(captures.map(c=>[c.id,c]));
 for(const row of rows){
  const c=row.captureId?members.get(row.captureId):undefined;
  if(!c||semanticHash(c.snapshot)!==semanticHash(row.snapshot)||!['UNANALYSED','UNCONFIGURED'].includes(row.state))throw new ConflictException('送审目标不属于本轮已确认的待审核评论');
 }
}
