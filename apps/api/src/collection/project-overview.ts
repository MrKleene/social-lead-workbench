import {historyDisplay} from '../common/db';
import {accountSystemBlock,recordedAccountBlocks} from '../accounts/account-execution-policy';
import {Prisma} from '@prisma/client';
import type {Db} from '../common/db';
import {requireAdmin,type Actor} from '../auth/security';
import {quotaBucket,shanghaiDay} from '../auto-contact/contact-policy';
import type {ProjectOverview} from '@crm/contracts';
/** Project-wide real-data summary. Never mutates jobs, probes accounts or calls a platform. */
export async function projectOverview(db:Db,actor:Actor,now=new Date()):Promise<ProjectOverview>{
 requireAdmin(actor);db=historyDisplay(db);
 return db.$transaction(async tx=>{
  const [archive,attempts,unattempted,accounts,usage,taskStates,reviewPending,blockedJobs,recentRuns,recentSends]=await Promise.all([
   tx.$queryRaw<ProjectOverview['archive'][]>`
    WITH real_comments AS (
      SELECT c.*,cfg.platform,p."platformPostId" FROM "CapturedComment" c
      JOIN "CollectionConfig" cfg ON cfg.id=c."configId" JOIN "CapturedPost" p ON p.id=c."postId" WHERE c."isDemo"=false
    ), latest AS (
      SELECT DISTINCT ON(platform,"platformPostId","platformCommentId") * FROM real_comments
      ORDER BY platform,"platformPostId","platformCommentId","lastSeenAt" DESC,"createdAt" DESC,id DESC
    ), coverage AS (
      SELECT l.id,EXISTS(SELECT 1 FROM real_comments c JOIN "SemanticReview" r ON r."captureId"=c.id
        WHERE c.platform=l.platform AND c."platformPostId"=l."platformPostId" AND c."platformCommentId"=l."platformCommentId"
        AND c."contentHash"=l."contentHash" AND c."contextVersion"=l."contextVersion" AND r.state='EVALUATED' AND r."isDemo"=false) scored,
        EXISTS(SELECT 1 FROM "SemanticReview" r WHERE r."captureId"=l.id AND r.state='FAILED' AND r."isDemo"=false) failed FROM latest l
    ) SELECT (SELECT count(*)::int FROM (SELECT DISTINCT cfg.platform,p."platformPostId" FROM "CapturedPost" p
      JOIN "CollectionConfig" cfg ON cfg.id=p."configId" JOIN public."CollectionRun" r ON r.id=p."runId"
      WHERE coalesce(r.snapshot->>'mode',cfg.mode)='XHS_MCP') p) posts,
      count(*)::int comments,count(*) FILTER(WHERE scored)::int scored,count(*) FILTER(WHERE NOT scored)::int unscored,
      count(*) FILTER(WHERE NOT scored AND failed)::int failed FROM coverage`,
   tx.contactAttempt.groupBy({by:['outcome'],where:{mode:'REAL'},_count:{_all:true}}),
   tx.$queryRaw<{n:number}[]>`SELECT count(*)::int n FROM "AutoContactJob" j WHERE j.mode='REAL'
    AND j.status IN ('QUEUED','WAITING_QUOTA','WAITING_ACCOUNT','RESERVED','ATTEMPTED')
    AND NOT EXISTS(SELECT 1 FROM "ContactAttempt" a WHERE a.mode='REAL' AND (a.id=j."attemptId" OR a."jobId"=j.id))`,
   tx.platformAccount.findMany({where:{archivedAt:null,isDemo:false},select:{id:true,status:true,dailyLimit:true,pauseReason:true,platform:true,loginPlatformUserId:true}}),
   tx.accountDay.aggregate({where:{day:quotaBucket('REAL',now),account:{archivedAt:null,isDemo:false}},_sum:{occupied:true}}),
   tx.$queryRaw<{status:string;n:number}[]>`SELECT r.status,count(*)::int n FROM "CollectionRun" r JOIN "CollectionConfig" c ON c.id=r."configId" WHERE r.status IN ('QUEUED','RUNNING') AND coalesce(r.snapshot->>'mode',c.mode)='XHS_MCP' GROUP BY r.status`,
   tx.$queryRaw<{n:number}[]>`SELECT count(*)::int n FROM "AutoReviewJob" j JOIN "CollectionRun" r ON r.id=j."runId" JOIN "CollectionConfig" c ON c.id=r."configId" WHERE j.status IN ('PENDING','PROCESSING') AND coalesce(r.snapshot->>'mode',c.mode)='XHS_MCP'`,
   tx.autoContactJob.count({where:{mode:'REAL',status:'BLOCKED_POST'}}),
   tx.$queryRaw<{id:string;configId:string;status:string;snapshot:{name?:string};createdAt:Date}[]>`SELECT r.id,r."configId",r.status,r.snapshot,r."createdAt" FROM "CollectionRun" r JOIN "CollectionConfig" c ON c.id=r."configId" WHERE coalesce(r.snapshot->>'mode',c.mode)='XHS_MCP' ORDER BY r."createdAt" DESC,r.id DESC LIMIT 5`,
   tx.contactAttempt.findMany({where:{mode:'REAL'},orderBy:[{createdAt:'desc'},{id:'desc'}],take:5,select:{id:true,outcome:true,createdAt:true}}),
  ]);
  const riskBlocks=await recordedAccountBlocks(tx,accounts.map(a=>a.id));
  const blocked=(a:typeof accounts[number])=>!!accountSystemBlock(a)||riskBlocks.has(a.id);
  const a=Object.fromEntries(attempts.map(x=>[x.outcome,x._count._all])),t=Object.fromEntries(taskStates.map(x=>[x.status,x.n]));
  return {asOf:now.toISOString(),timezone:'Asia/Shanghai',day:shanghaiDay(now),archive:archive[0],
   sends:{confirmed:a.CONFIRMED||0,pending:(a.RESERVED||0)+(a.ATTEMPTED||0)+(unattempted[0]?.n||0),unknown:a.UNKNOWN||0,failed:a.FAILED||0,cancelled:a.CANCELLED||0,blockedJobs},
   accounts:{total:accounts.length,paused:accounts.filter(blocked).length,restricted:accounts.filter(a=>a.status==='RESTRICTED').length,notPaused:accounts.filter(a=>!blocked(a)).length,dailyLimit:accounts.reduce((n,a)=>n+a.dailyLimit,0),occupied:usage._sum.occupied||0},
   tasks:{running:t.RUNNING||0,queued:t.QUEUED||0,reviewPending:reviewPending[0]?.n||0},
   activity:[...recentRuns.map(r=>({id:r.id,kind:'collection' as const,at:r.createdAt.toISOString(),label:(r.snapshot as {name?:string})?.name||'自动化采集',status:r.status,configId:r.configId})),...recentSends.map(a=>({id:a.id,kind:'send' as const,at:a.createdAt.toISOString(),label:'出站回复记录',status:a.outcome}))].sort((a,b)=>b.at.localeCompare(a.at)).slice(0,5)};
 },{isolationLevel:Prisma.TransactionIsolationLevel.RepeatableRead});
}
