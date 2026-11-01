import {NotFoundException} from '@nestjs/common';
import {Prisma} from '@prisma/client';
import {commentCheckpointSchema,observedReadCounts,safeRunCoverage,runReviewQuerySchema,displayReviewFailure,type RunReviewPage,type RunReviewPost,type RunCommentReview,type SemanticSnapshot} from '@crm/contracts';
import type {Db} from '../common/db';
import {requireAdmin,type Actor} from '../auth/security';
import {commentDigest} from '../collection/comment-checkpoint';
const text=(v:unknown,max=20000)=>typeof v==='string'?v.slice(0,max):'';
const object=(v:unknown)=>v&&typeof v==='object'&&!Array.isArray(v)?v as Record<string,unknown>:{};
const memberSelect={id:true,postId:true,platformCommentId:true,contentHash:true,runId:true,lastRunId:true,createdAt:true} as const;
type Member={id:string;postId:string;platformCommentId:string;contentHash:string;runId:string;lastRunId:string;createdAt:Date;membership:'CAPTURE'|'RECOVERY'|'BOUND'};
/** SELECT-only projection. No evaluator, queue, authorization mutation or model settings dependency. */
export async function readRunReview(db:Db,actor:Actor,runId:string,raw:unknown):Promise<RunReviewPage>{
 requireAdmin(actor);const input=runReviewQuerySchema.parse(raw);
 return db.$transaction(async tx=>{
  const run=await tx.collectionRun.findUnique({where:{id:runId},select:{id:true,configId:true,status:true,revision:true,createdAt:true,finishedAt:true,capturedPosts:true,capturedCommentsCount:true,metrics:true,execution:true}});
  if(!run)throw new NotFoundException('未找到采集任务');
  if(input.policyId&&!await tx.commentReviewPolicy.findUnique({where:{id:input.policyId},select:{id:true}}))throw new NotFoundException('匹配方案不存在');
  const coverage=safeRunCoverage(object(run.metrics).coverage),end=run.finishedAt||new Date();
  const [jobs,acceptance,newer]=await Promise.all([
   input.policyId?tx.autoReviewJob.findMany({where:{runId,policyId:input.policyId},orderBy:{createdAt:'asc'},take:1001,select:{id:true,postId:true,status:true,reason:true,processed:true}}):[],
   tx.normalAutomationAcceptance.findUnique({where:{runId},select:{capturedPostId:true,reviewIds:true,modelCallId:true,posts:{select:{postId:true,reviewIds:true,modelCallId:true}}}}),
   tx.collectionRun.findFirst({where:{configId:run.configId,OR:[{createdAt:{gt:run.createdAt}},{createdAt:run.createdAt,id:{gt:runId}}]},select:{id:true}}),
  ]);
  const bound=acceptance?[...acceptance.posts,...(acceptance.capturedPostId?[{postId:acceptance.capturedPostId,reviewIds:acceptance.reviewIds,modelCallId:acceptance.modelCallId}]:[])]:[];
  const refs=coverage?.posts.flatMap(p=>p.postRef?[p.postRef]:[])||[];
  const stored=await tx.capturedPost.findMany({where:{configId:run.configId,createdAt:{lte:end},OR:[{runId},{lastRunId:runId},{id:{in:[...jobs.map(j=>j.postId),...bound.map(b=>b.postId)]}},{platformPostId:{in:refs}}]},orderBy:[{createdAt:'desc'},{id:'asc'}],take:501,select:{id:true,platformPostId:true,snapshot:true,createdAt:true}});
  const grouped=new Map<string,typeof stored>();for(const p of stored.slice(0,500))grouped.set(p.platformPostId,[...(grouped.get(p.platformPostId)||[]),p]);
  for(const ref of refs)if(!grouped.has(ref))grouped.set(ref,[]);
  const allPosts:RunReviewPost[]=[...grouped].map(([id,versions])=>{
   const evidence=coverage?.posts.find(p=>p.postRef===id),ids=versions.map(p=>p.id);
   return {id,title:text(object(versions[0]?.snapshot).title,500)||'帖子标题未保存',expectedComments:evidence?observedReadCounts(evidence).count:run.capturedPosts===1?run.capturedCommentsCount:null,jobs:jobs.filter(j=>ids.includes(j.postId)).map(j=>({status:j.status,reason:j.reason?displayReviewFailure(j.reason):null,processed:j.processed}))};
  });
  allPosts.sort((a,b)=>(coverage?.posts.find(p=>p.postRef===a.id)?.ordinal??999)-(coverage?.posts.find(p=>p.postRef===b.id)?.ordinal??999)||a.id.localeCompare(b.id));
  const posts=allPosts.slice(input.postOffset,input.postOffset+20),selectedId=input.postId||posts[0]?.id||null;
  if(input.postId&&!grouped.has(input.postId))throw new NotFoundException('帖子不属于该任务的已知范围');
  const selected=allPosts.find(p=>p.id===selectedId);
  const base={runId,configId:run.configId,runStatus:run.status,expectedPosts:run.capturedPosts,expectedComments:run.capturedCommentsCount,posts,postTotal:allPosts.length,postHasMore:input.postOffset+posts.length<allPosts.length,postOffset:input.postOffset,limited:stored.length>500||jobs.length>1000,selectedPostId:selectedId,offset:input.offset,pageSize:30,policyId:input.policyId||null};
  if(!selectedId||!selected)return {...base,comments:[],knownComments:0,scope:run.capturedPosts?'UNAVAILABLE':'EXACT',hasMore:false};
  const direct=await tx.capturedComment.findMany({where:{configId:run.configId,post:{platformPostId:selectedId},createdAt:{lte:end},OR:[{runId},{lastRunId:runId}]},select:memberSelect,orderBy:[{createdAt:'desc'},{id:'asc'}],take:5001});
  let limited=base.limited||direct.length>5000;
  const members=new Map<string,Member>(direct.slice(0,5000).map(c=>[c.id,{...c,membership:'CAPTURE'}]));
  // Frozen model claims validated these exact captures against this run before dispatch.
  // They remain usable membership evidence after lastRunId moves to a later run.
  const claimedIds=[...new Set(bound.filter(b=>grouped.get(selectedId)?.some(p=>p.id===b.postId)&&b.modelCallId).flatMap(b=>b.reviewIds))];
  if(claimedIds.length){
   const claimed=await tx.semanticReview.findMany({where:{id:{in:claimedIds.slice(0,5000)},configId:run.configId,capture:{configId:run.configId,post:{platformPostId:selectedId},createdAt:{lte:end}}},select:{snapshot:true,capture:{select:{...memberSelect,snapshot:true}}},take:5001});
   limited||=claimedIds.length>5000||claimed.length>5000;
   for(const r of claimed.slice(0,5000)){const c=r.capture;if(!c)continue;const original=object(c.snapshot),review=object(r.snapshot);if(original.postId===selectedId&&original.commentId===c.platformCommentId&&review.postId===selectedId&&review.commentId===c.platformCommentId&&!members.has(c.id))members.set(c.id,{...c,membership:'BOUND'});}
  }
  const evidence=coverage?.posts.find(p=>p.postRef===selectedId),execution=object(run.execution);
  // Recovery marks are private proof, never returned. A later run invalidates mutable checkpoint evidence.
  if(!newer&&evidence?.recovery&&observedReadCounts(evidence).recovered&&typeof execution.accountId==='string'&&typeof execution.deviceId==='string'){
   const cp=await tx.commentReadCheckpoint.findFirst({where:{configId:run.configId,platformPostId:selectedId,accountId:execution.accountId,deviceId:execution.deviceId,revision:run.revision,sequence:evidence.recovery.sequence,state:'COMPLETE',updatedAt:{gte:run.createdAt},OR:[{ownerRunId:null},{ownerRunId:runId}]},select:{checkpoint:true}});
   const parsed=commentCheckpointSchema.safeParse(cp?.checkpoint);
   if(parsed.success&&parsed.data.sequence===evidence.recovery.sequence&&parsed.data.marks.length===evidence.recovery.confirmedTotal&&evidence.recovery.remainingAnchors===0){
    const marks=new Map(parsed.data.marks.map(m=>[m.id,m]));
    const recovered=await tx.capturedComment.findMany({where:{configId:run.configId,post:{platformPostId:selectedId},platformCommentId:{in:[...marks.keys()]},createdAt:{lte:end}},select:{...memberSelect,snapshot:true},orderBy:[{createdAt:'desc'},{id:'asc'}],take:5001});limited||=recovered.length>5000;
    for(const c of recovered.slice(0,5000)){const s=c.snapshot as unknown as SemanticSnapshot,m=marks.get(c.platformCommentId);if(m&&s.commentId===c.platformCommentId&&s.postId===selectedId&&typeof s.userId==='string'&&typeof s.comment==='string'&&m.parent===(s.parentId||'')&&m.digest===commentDigest(selectedId,{id:s.commentId,parentId:s.parentId||undefined,userId:s.userId,text:s.comment,nickname:'',hasReplies:false}))members.set(c.id,{...c,membership:members.get(c.id)?.membership||'RECOVERY'});}
   }
  }
  const byComment=new Map<string,Member[]>();for(const m of members.values())byComment.set(m.platformCommentId,[...(byComment.get(m.platformCommentId)||[]),m]);
  const ordered=[...byComment.values()].map(versions=>({versions:versions.sort((a,b)=>b.createdAt.getTime()-a.createdAt.getTime()||a.id.localeCompare(b.id)),first:Math.min(...versions.map(v=>v.createdAt.getTime()))})).sort((a,b)=>a.first-b.first||a.versions[0].platformCommentId.localeCompare(b.versions[0].platformCommentId));
  const page=ordered.slice(input.offset,input.offset+30),ids=page.map(v=>v.versions[0].id),hashes=page.map(v=>v.versions[0].contentHash);
  const [captures,reviews]=await Promise.all([
   tx.capturedComment.findMany({where:{configId:run.configId,id:{in:ids}},select:{id:true,snapshot:true}}),
   input.policyId&&ids.length?tx.semanticReview.findMany({where:{configId:run.configId,policyId:input.policyId,...(input.policyRevision?{policyRevision:input.policyRevision}:{}),OR:[{captureId:{in:ids}},{sourceContentHash:{in:hashes}}]},orderBy:[{policyRevision:'desc'},{createdAt:'desc'},{id:'asc'}],take:601,select:{id:true,captureId:true,sourceContentHash:true,runId:true,state:true,score:true,reason:true,result:true,snapshot:true,policyRevision:true,createdAt:true}}):[],
  ]);
  limited||=reviews.length>600;
  const boundIds=new Set(bound.filter(b=>grouped.get(selectedId)?.some(p=>p.id===b.postId)&&b.modelCallId).flatMap(b=>b.reviewIds));
  const comments=page.flatMap(({versions})=>{const c=versions[0],saved=captures.find(v=>v.id===c.id);if(!saved)return [];const s=object(saved.snapshot);
   const matches=reviews.slice(0,600).filter(r=>{const rs=object(r.snapshot);return (r.captureId===c.id||r.sourceContentHash===c.contentHash)&&rs.postId===selectedId&&rs.commentId===c.platformCommentId;}).sort((a,b)=>Number(boundIds.has(b.id))-Number(boundIds.has(a.id)));
   const projected:RunCommentReview[]=matches.slice(0,5).map(r=>({id:r.id,state:r.state,score:r.state==='EVALUATED'?r.score:null,reason:r.state==='FAILED'?displayReviewFailure(r.reason):r.reason,decision:['MATCH','NO_MATCH','UNCERTAIN'].includes(String(object(r.result).decision))?String(object(r.result).decision):null,policyRevision:r.policyRevision,origin:boundIds.has(r.id)?'BOUND':'SAVED',captureRunId:r.runId,createdAt:r.createdAt.toISOString()}));
   return [{id:c.id,commentId:c.platformCommentId,parentId:typeof s.parentId==='string'?s.parentId:null,parentKnown:typeof s.parentId==='string'&&byComment.has(s.parentId),text:text(s.comment),nickname:text(s.authorNickname,200),versions:versions.length,membership:c.membership,reviews:projected}];
  });
  const knownComments=ordered.length,scope=selected.expectedComments!==null&&knownComments===selected.expectedComments&&!limited?'EXACT':knownComments?'PARTIAL':'UNAVAILABLE';
  return {...base,limited,comments,knownComments,scope,hasMore:input.offset+page.length<knownComments};
 },{isolationLevel:Prisma.TransactionIsolationLevel.RepeatableRead});
}
