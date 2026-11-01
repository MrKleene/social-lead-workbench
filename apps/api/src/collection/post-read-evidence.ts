import type {CapturedPost,Prisma} from '@prisma/client';
import {safeRunCoverage,safeBoundedReadReport,observedReadCounts,commentCheckpointSchema,type SemanticSnapshot} from '@crm/contracts';
import type {Db} from '../common/db';
import {commentDigest} from './comment-checkpoint';
import {semanticHash} from './capture-archive';
type ReadDb=Db|Prisma.TransactionClient;
/** Display-only observation. Never writes PostAvailability or changes execution eligibility. */
export async function readPostEvidence(db:ReadDb,post:CapturedPost,selectedRunId=''){
 const runId=selectedRunId||post.lastRunId;
 const base={runId:runId||null,scope:selectedRunId?'RUN' as const:'LATEST' as const,observedAt:null as string|null,timeBasis:'UNKNOWN' as 'UNKNOWN'|'SAVED_AT'|'RUN_FINISHED',accessObserved:false,coverage:'UNKNOWN' as 'UNKNOWN'|'PARTIAL'|'COMPLETE',report:null as ReturnType<typeof safeBoundedReadReport>|null,windows:[] as NonNullable<ReturnType<typeof safeRunCoverage>>['posts'][number]['boundedReadWindows'],confirmedComments:null as number|null,declaredComments:null as number|null,reason:'EVIDENCE_MISSING'};
 if(!runId)return base;
 const run=await db.collectionRun.findUnique({where:{id:runId}});
 if(!run||run.configId!==post.configId)return base;
 const evidence=safeRunCoverage((run.metrics as {coverage?:unknown}|null)?.coverage)?.posts.find(p=>p.postRef===post.platformPostId);
 const report=safeBoundedReadReport(evidence?.boundedRead),latest=post.lastRunId===run.id;
 // A mutable post snapshot must not supply the observation for a historical run.
 const snapshotReport=safeBoundedReadReport((post.snapshot as {boundedRead?:unknown}).boundedRead);
 const same=latest&&!!report&&!!snapshotReport&&semanticHash(report)===semanticHash(snapshotReport);
 const observedAt=(same?post.lastSeenAt:run.finishedAt)?.toISOString()??null;
 const readAt=observedAt&&Date.parse(observedAt);
 const accessObserved=!!report&&!!readAt&&readAt>=run.createdAt.getTime()&&post.createdAt.getTime()<=readAt&&report.final.ready.document==='complete'&&report.final.ready.container&&['OK','LIMIT'].includes(report.final.status);
 const result={...base,timeBasis:report&&observedAt?(same?'SAVED_AT' as const:'RUN_FINISHED' as const):'UNKNOWN' as const,report:report??null,windows:evidence?.boundedReadWindows??[],observedAt:report?observedAt:null,accessObserved,declaredComments:report?.final.total.state==='EXACT'?report.final.total.value:null};
 if(!report||!evidence)return result;
 if(!same)return {...result,reason:'HISTORICAL_MEMBERS_UNAVAILABLE'};
 if(report.state!=='COMPLETE'||!evidence.complete||post.coverage!=='COMPLETE')return {...result,coverage:report.state==='PARTIAL'?'PARTIAL' as const:'UNKNOWN' as const,reason:evidence.reason||report.reason};
 if(run.cancelRequested||!['COMPLETE','PARTIAL','RUNNING'].includes(run.status))return {...result,reason:'RUN_INTERRUPTED'};
 const observed=observedReadCounts(evidence),expected=report.chunkSummary?.unique??report.retained.loaded?.uniqueKnown;
 if(expected==null||observed.count!==expected)return {...result,reason:'COUNT_MISMATCH'};
 let marks:Map<string,{id:string;parent:string;digest:string}>|undefined;
 if(evidence.recovery){
  const execution=run.execution as {accountId?:string;deviceId?:string}|null;
  // Checkpoints are mutable and cannot prove an older run once a later run exists.
  const newer=await db.collectionRun.findFirst({where:{configId:run.configId,OR:[{createdAt:{gt:run.createdAt}},{createdAt:run.createdAt,id:{gt:run.id}}]},select:{id:true}});
  if(newer||!observed.recovered||!execution?.accountId||!execution.deviceId)return {...result,reason:'RECOVERY_EVIDENCE_UNAVAILABLE'};
  const cp=await db.commentReadCheckpoint.findFirst({where:{configId:run.configId,platformPostId:post.platformPostId,accountId:execution.accountId,deviceId:execution.deviceId,revision:run.revision,state:'COMPLETE',sequence:evidence.recovery.sequence,updatedAt:{gte:run.createdAt},OR:[{ownerRunId:null},{ownerRunId:run.id}]}});
  const parsed=commentCheckpointSchema.safeParse(cp?.checkpoint);
  if(!parsed.success||parsed.data.sequence!==evidence.recovery.sequence||parsed.data.marks.length!==expected||evidence.recovery.remainingAnchors!==0)return {...result,reason:'RECOVERY_EVIDENCE_UNAVAILABLE'};
  marks=new Map(parsed.data.marks.map(m=>[m.id,m]));
 }
 const rows=await db.capturedComment.findMany({where:{configId:run.configId,post:{platformPostId:post.platformPostId},createdAt:{lte:run.finishedAt||post.lastSeenAt},...(marks?{platformCommentId:{in:[...marks.keys()]}}:{lastRunId:run.id})},orderBy:[{createdAt:'desc'},{id:'asc'}],take:4001,select:{platformCommentId:true,snapshot:true}});
 if(rows.length>4000)return {...result,reason:'MEMBER_LIMIT'};
 const members=new Map<string,boolean>();
 for(const c of rows){
  const s=c.snapshot as unknown as SemanticSnapshot;
  if(s.postId!==post.platformPostId||s.commentId!==c.platformCommentId)continue;
  if(marks){const m=marks.get(c.platformCommentId);if(!m||typeof s.userId!=='string'||typeof s.comment!=='string'||m.parent!==(s.parentId||'')||m.digest!==commentDigest(post.platformPostId,{id:s.commentId,parentId:s.parentId||undefined,userId:s.userId,text:s.comment,nickname:'',hasReplies:false}))continue;}
  if(!members.has(c.platformCommentId))members.set(c.platformCommentId,!!s.parentId);
 }
 const roots=[...members.values()].filter(reply=>!reply).length,counts=report.chunkSummary??report.retained.loaded;
 const complete=members.size===expected&&roots===counts?.roots&&members.size-roots===counts?.replies;
 return {...result,confirmedComments:members.size,coverage:complete?'COMPLETE' as const:'UNKNOWN' as const,reason:complete?'VERIFIED_RUN_SCOPE':'MEMBERS_MISSING'};
}
