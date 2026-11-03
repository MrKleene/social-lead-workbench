import type {Db} from '../common/db';
import type {JourneyLiveProgress,JourneyLiveStep} from '@crm/contracts';
export const liveLabels:Record<string,string>={PREPARING_CAPTURE:'正在准备采集',CHECKING_ACCOUNT:'正在核验账号',SEARCHING:'正在搜索帖子',READING_POST:'正在读取帖子与评论',READING_COMMENTS:'正在读取评论',READING_REPLIES:'正在读取楼中楼',SAVING_CAPTURE:'正在保存采集结果',PREPARING_REVIEW:'正在准备审核内容',REVIEWING:'正在审核评论',SAVING_REVIEW:'正在保存审核结果',PREPARING_SEND:'正在准备发送',LOCATING_TARGET:'正在定位回复对象',FILLING_MESSAGE:'正在准备回复内容',SUBMITTING:'正在提交发送',CONFIRMING:'正在确认发送结果'};
export type ProgressRow={executionId:string;stage:string;phase:string;at:Date|string;status:string;session:string};
const active:Record<string,string[]>={collect:['RUNNING'],review:['PROCESSING'],contact:['WAITING_ACCOUNT','RESERVED','ATTEMPTED','MANUAL_READY']};
export function projectLive(rows:ProgressRow[],now=new Date()):JourneyLiveProgress{
 const valid=rows.filter(x=>x&&['collect','review','contact'].includes(x.stage)&&typeof x.executionId==='string'&&Number.isFinite(new Date(x.at).getTime())&&(x.phase==='IDLE'||!!liveLabels[x.phase]));
 const ordered=valid.sort((a,b)=>new Date(b.at).getTime()-new Date(a.at).getTime());
 const latest=new Map<string,ProgressRow>();for(const row of ordered)if(!latest.has(row.executionId))latest.set(row.executionId,row);
 const current:JourneyLiveStep[]=[];
 for(const stage of ['collect','review','contact'] as const){
  const group=[...latest.values()].filter(x=>x.stage===stage&&active[stage].includes(x.status));if(!group.length)continue;
  const running=group.filter(x=>x.phase!=='IDLE'),row=running[0]??group[0];
  const age=now.getTime()-new Date(row.at).getTime(),stale=age>15000||age< -5000;
  current.push({stage,phase:row.phase,label:stale?'进度更新中断，请核查任务':row.phase==='IDLE'?'正在更新任务结果':liveLabels[row.phase],at:new Date(row.at).toISOString(),state:stale?'stale':row.phase==='IDLE'?'settling':'running',concurrent:running.length||group.length});
 }
 // Retain short, genuinely recorded transitions even when polling missed them. Never pretend history is live.
 const recent:JourneyLiveProgress['recent']=[];const seen=new Set<string>();
 for(const row of ordered){if(row.phase==='IDLE')continue;const k=row.stage+':'+row.phase;if(seen.has(k))continue;seen.add(k);recent.push({stage:row.stage as JourneyLiveStep['stage'],label:liveLabels[row.phase],at:new Date(row.at).toISOString()});if(recent.length===10)break;}
 return {observedAt:now.toISOString(),current,recent:recent.reverse()};
}
/** Tenant/admin checks and archive-filtered run are required before exposing even display-only evidence. */
export async function journeyLive(db:Db,runId:string,mode:string,policyId?:string):Promise<JourneyLiveProgress>{
 const rows=await db.$queryRaw<ProgressRow[]>`
 SELECT DISTINCT ON (a.metadata->>'executionId',a.metadata->>'phase')
 a.metadata->>'executionId' AS "executionId",a.metadata->>'stage' AS stage,a.metadata->>'phase' AS phase,
 a.metadata->>'session' AS session,a."createdAt" AS at,
 CASE WHEN a.metadata->>'stage'='collect' THEN r.status WHEN a.metadata->>'stage'='review' THEN v.status ELSE j.status::text END AS status
 FROM "AuditLog" a JOIN "CollectionRun" r ON r.id=a."entityId"
 LEFT JOIN "AutoReviewJob" v ON v.id=a.metadata->>'executionId' AND v."runId"=r.id
 LEFT JOIN "AutoContactJob" j ON j.id=a.metadata->>'executionId' AND j.mode=${mode}
 LEFT JOIN "SemanticReview" s ON s.id=j."reviewId" AND s."runId"=r.id
 WHERE r.id=${runId} AND a.action='JOURNEY_PROGRESS' AND a.metadata->>'v'='1'
 AND ((a.metadata->>'stage'='collect' AND a.metadata->>'executionId'=r.id)
 OR (a.metadata->>'stage'='review' AND v.id IS NOT NULL AND (${policyId??null}::text IS NULL OR v."policyId"=${policyId??null}))
 OR (a.metadata->>'stage'='contact' AND s.id IS NOT NULL))
 ORDER BY a.metadata->>'executionId',a.metadata->>'phase',a."createdAt" DESC,a.id DESC`;
 return projectLive(rows);
}
