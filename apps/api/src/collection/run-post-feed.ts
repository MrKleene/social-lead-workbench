import {Prisma} from '@prisma/client';
import {NotFoundException} from '@nestjs/common';
import {safePostCoverUrl,savedPublishedAt,type RunPostFeed,type RunPostItem} from '@crm/contracts';
import {Db} from '../common/db';
/** A single repeatable read: never combines checkpoints or fetches per-post comments.
 * Archive membership retains only first/last run. Older run snapshots cannot be reconstructed. */
export async function readRunPostFeed(db:Db,configId:string,runId:string):Promise<RunPostFeed>{
 return db.$transaction(async tx=>{
  const run=await tx.collectionRun.findFirst({where:{id:runId,configId},select:{id:true,status:true,createdAt:true}});if(!run)throw new NotFoundException();
  const newer=await tx.collectionRun.findFirst({where:{configId,OR:[{createdAt:{gt:run.createdAt}},{createdAt:run.createdAt,id:{gt:run.id}}]},select:{id:true}});
  const base={version:1 as const,configId,runId,status:run.status,limited:false};
  if(newer)return {...base,availability:'SUPERSEDED',items:[]};
  const posts=await tx.capturedPost.findMany({where:{configId,lastRunId:runId},orderBy:[{createdAt:'asc'},{id:'asc'}],take:101});
  const comments=await tx.capturedComment.findMany({where:{configId,lastRunId:runId,post:{platformPostId:{in:posts.map(p=>p.platformPostId)}}},select:{platformCommentId:true,runId:true,snapshot:true,post:{select:{platformPostId:true}}},take:1001});
  const limited=posts.length>100||comments.length>1000,grouped=new Map<string,typeof posts>();
  for(const p of posts.slice(0,100))grouped.set(p.platformPostId,[...(grouped.get(p.platformPostId)||[]),p]);
  const items:RunPostItem[]=[...grouped].map(([platformPostId,versions])=>{
   const p=[...versions].sort((a,b)=>b.lastSeenAt.getTime()-a.lastSeenAt.getTime()||a.id.localeCompare(b.id))[0],s=p.snapshot as Record<string,unknown>;
   const rows=comments.filter(c=>c.post.platformPostId===platformPostId),unique=new Map<string,typeof rows>();
   for(const c of rows)unique.set(c.platformCommentId,[...(unique.get(c.platformCommentId)||[]),c]);
   let rootCount=0,replyCount=0,newCount=0;let unknown=limited;
   for(const entries of unique.values()){
    const parents=new Set(entries.map(c=>(c.snapshot as Record<string,unknown>).parentId));
    if(parents.size!==1)unknown=true;const parent=parents.values().next().value;
    if(parent===null)rootCount++;else if(typeof parent==='string'&&parent)replyCount++;else unknown=true;
    if(entries.some(c=>c.runId===runId))newCount++;
   }
   return {id:p.id,platformPostId,title:typeof s.title==='string'&&s.title.length<=500?s.title:'',...(typeof s.body==='string'&&s.body.length<=20000?{body:s.body}:{}),coverUrl:safePostCoverUrl(s.coverUrl),publishedAt:savedPublishedAt(s.publishedAt),savedAt:p.lastSeenAt.toISOString(),savedCount:limited?null:unique.size,rootCount:unknown?null:rootCount,replyCount:unknown?null:replyCount,newCount:limited?null:newCount,reusedCount:limited?null:unique.size-newCount,coverage:p.coverage,stopReason:p.stopReason};
  });
  return {...base,limited,availability:'AVAILABLE',items};
 },{isolationLevel:Prisma.TransactionIsolationLevel.RepeatableRead});
}
