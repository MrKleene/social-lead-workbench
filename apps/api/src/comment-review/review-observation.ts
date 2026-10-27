import {observedReadCounts,commentCheckpointSchema,safeBoundedReadReport,safeRunCoverage,reviewObservationPolicy,type SemanticOutbound,type SemanticSnapshot,type SemanticRules} from '@crm/contracts';
import {semanticHash} from '../collection/capture-archive';
import {commentDigest} from '../collection/comment-checkpoint';
import {prepareOutbound} from '../collection/semantic-redaction';
import type {ReviewDb} from './review-policy.service';
type Row={id:string;captureId:string|null;snapshot:unknown;rules:unknown};
type Observation=NonNullable<SemanticOutbound['items'][number]['observation']>;
/** Private checkpoint identities are used only to prove membership. Never serialize them to model input. */
export async function reviewObservations(db:ReviewDb,captureIds:string[]):Promise<Map<string,Observation>>{
 const captures=await db.capturedComment.findMany({where:{id:{in:captureIds}},include:{post:true},orderBy:{id:'asc'}});
 const runs=await db.collectionRun.findMany({where:{id:{in:[...new Set(captures.map(c=>c.post.lastRunId))]}}});
 const checkpoints=await db.commentReadCheckpoint.findMany({where:{configId:{in:[...new Set(captures.map(c=>c.configId))]},platformPostId:{in:[...new Set(captures.map(c=>c.post.platformPostId))]}}});
 return new Map(captures.map(c=>{
  const post=c.post,run=runs.find(r=>r.id===post.lastRunId),s=c.snapshot as unknown as SemanticSnapshot;
  const report=safeBoundedReadReport((post.snapshot as {boundedRead?:unknown}).boundedRead);
  const evidence=safeRunCoverage((run?.metrics as {coverage?:unknown}|null)?.coverage)?.posts.find(p=>p.postRef===post.platformPostId);
  const execution=run?.execution as {accountId?:string;deviceId?:string}|null;
  let member=!!run&&c.lastRunId===run.id&&!evidence?.recovery;
  if(run&&evidence?.recovery){
   const cp=checkpoints.find(p=>p.configId===post.configId&&p.platformPostId===post.platformPostId&&p.accountId===execution?.accountId&&p.deviceId===execution?.deviceId&&p.revision===run.revision&&(!p.ownerRunId||p.ownerRunId===run.id)&&p.updatedAt>=run.createdAt);
   const parsed=commentCheckpointSchema.safeParse(cp?.checkpoint),recovery=evidence.recovery;
   if(cp?.state==='COMPLETE'&&parsed.success&&cp.sequence===recovery.sequence&&parsed.data.sequence===recovery.sequence&&parsed.data.marks.length===recovery.confirmedTotal&&recovery.remainingAnchors===0){
    const mark=parsed.data.marks.find(m=>m.id===s.commentId);
    member=!!mark&&mark.parent===(s.parentId||'')&&mark.digest===commentDigest(post.platformPostId,{id:s.commentId,userId:s.userId,text:s.comment,parentId:s.parentId||undefined,nickname:'',hasReplies:false});
   }
  }
  const validRun=!!run&&!run.cancelRequested&&['RUNNING','COMPLETE','PARTIAL'].includes(run.status);
  const complete=validRun&&member&&post.coverage==='COMPLETE'&&report?.state==='COMPLETE'&&evidence?.complete===true&&!!evidence.boundedRead&&semanticHash(evidence.boundedRead)===semanticHash(report)&&(!evidence.recovery||observedReadCounts(evidence).recovered);
  const coverage:Observation['coverage']=complete?'COMPLETE':validRun&&report&&post.coverage==='PARTIAL'?'PARTIAL':'UNKNOWN';
  // Changes to evidence or scope invalidate pending previews, not historical successful reviews.
  const evidenceHash=semanticHash({version:reviewObservationPolicy,runId:run?.id,status:run?.status,cancelled:run?.cancelRequested,postCoverage:post.coverage,report:report??null,recovery:evidence?.recovery??null,member,coverage});
  return [c.id,{coverage,evidenceHash}] as const;
 }));
}
export async function prepareReviewOutbound(db:ReviewDb,rows:Row[],wholePost:boolean){
 const observations=await reviewObservations(db,rows.flatMap(r=>r.captureId?[r.captureId]:[]));
 const inputs=rows.map(r=>({id:r.id,snapshot:{...(r.snapshot as SemanticSnapshot),coverage:observations.get(r.captureId||'')?.coverage==='COMPLETE'?'COMPLETE' as const:'PARTIAL' as const},rules:r.rules as SemanticRules}));
 const payload=prepareOutbound(inputs,wholePost);payload.observationPolicy=reviewObservationPolicy;
 payload.items=payload.items.map((item,i)=>({...item,observation:observations.get(rows[i].captureId||'')??{coverage:'UNKNOWN',evidenceHash:semanticHash({version:reviewObservationPolicy,missing:true})}}));
 return {inputs,payload};
}
