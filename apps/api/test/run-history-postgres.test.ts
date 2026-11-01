import 'reflect-metadata';
import {beforeAll,afterAll,it,expect} from 'vitest';
import {randomUUID} from 'node:crypto';
import {Db} from '../src/common/db';
import {runHistory,runHistoryInput} from '../src/collection/run-history';
const url=process.env.TEST_DATABASE_URL;if(!url||new URL(url).pathname!=='/crm_test'||!['localhost','127.0.0.1'].includes(new URL(url).hostname))throw Error('Only isolated crm_test');
const db=new Db({datasources:{db:{url}}}),id='history-'+randomUUID(),admin={id,role:'ADMIN' as const,name:'fixture',email:'fixture@example.invalid'};const runs:string[]=[];
beforeAll(async()=>{
 await db.$connect();await db.collectionConfig.create({data:{id,platform:'XHS',mode:'MOCK',name:'虚构历史',keywords:['测试'],excludeWords:[],batchLimit:1}});
 await db.commentReviewPolicy.create({data:{id,name:'虚构',target:'虚构需求'}});
 for(let i=0;i<25;i++){runs.push((await db.collectionRun.create({data:{configId:id,revision:1,requestKey:randomUUID(),scenario:'BASELINE',status:'COMPLETE',createdAt:new Date(1000+i),snapshot:{name:'虚构轮次'+i,keywords:['测试'],internal:'must-not-export'},execution:{secret:'must-not-export'}}})).id);}
});
afterAll(async()=>{await db.autoContactJob.deleteMany({where:{ruleId:id}});await db.autoContactRule.deleteMany({where:{id}});await db.semanticReview.deleteMany({where:{configId:id}});await db.autoReviewJob.deleteMany({where:{policyId:id}});await db.commentReviewPolicy.delete({where:{id}});await db.collectionRun.deleteMany({where:{configId:id}});await db.collectionConfig.delete({where:{id}});await db.$disconnect();});
it('paginates beyond 20 without changing current or losing an older selected run',async()=>{
 const a=await runHistory(db,admin,id,{runId:runs[0]});expect(a.items).toHaveLength(20);expect(a.current?.id).toBe(runs[24]);expect(a.selected?.id).toBe(runs[0]);expect(JSON.stringify(a)).not.toContain('must-not-export');
 await db.collectionRun.create({data:{id:id+'-new',configId:id,revision:1,requestKey:randomUUID(),scenario:'BASELINE',status:'COMPLETE',snapshot:{},createdAt:new Date(9999)}});
 const b=await runHistory(db,admin,id,{before:a.nextCursor!});expect(b.items).toHaveLength(5);expect(new Set([...a.items,...b.items].map(x=>x!.id)).size).toBe(25);
 await db.collectionRun.delete({where:{id:id+'-new'}});
});
it('review work remains current after collection ends; reading selection has no mutation',async()=>{
 const job=await db.autoReviewJob.create({data:{policyId:id,postId:'fictional',runId:runs[2],policyVersion:1,status:'PROCESSING'}});
 const q=await runHistory(db,admin,id,{runId:runs[0]});expect(q.current?.id).toBe(runs[2]);expect(q.activePhase).toBe('review');expect(q.selected?.id).toBe(runs[0]);expect((await db.autoReviewJob.findUniqueOrThrow({where:{id:job.id}})).status).toBe('PROCESSING');
 await db.autoReviewJob.update({where:{id:job.id},data:{status:'COMPLETE'}});expect((await runHistory(db,admin,id,{})).current?.id).toBe(runs[24]);
});
it('reply queue and waits keep their actual source run current, UNKNOWN does not run again',async()=>{
 await db.autoContactRule.create({data:{id,platform:'XHS',policyId:id,policyRevision:1}});
 const r=await db.semanticReview.create({data:{configId:id,runId:runs[3],revision:1,snapshotHash:'history',platform:'XHS',platformUserId:'fixture',snapshot:{},rules:{},isDemo:true,state:'EVALUATED'}});
 const job=await db.autoContactJob.create({data:{ruleId:id,ruleVersion:1,reviewId:r.id,reviewVersion:1,mode:'SIMULATION',platform:'XHS',recipientId:'fixture',postId:'fixture',commentId:'fixture',channel:'COMMENT',content:'fixture',evidence:{},eligibilityHash:'fixture',status:'WAITING_QUOTA'}});
 expect(await runHistory(db,admin,id,{})).toMatchObject({current:{id:runs[3]},activePhase:'contact'});
 await db.autoContactJob.update({where:{id:job.id},data:{status:'UNKNOWN'}});expect((await runHistory(db,admin,id,{})).activePhase).toBeNull();expect((await db.autoContactJob.findUniqueOrThrow({where:{id:job.id}})).status).toBe('UNKNOWN');
});
it('collection execution has priority over earlier downstream work',async()=>{await db.collectionRun.update({where:{id:runs[23]},data:{status:'RUNNING'}});expect(await runHistory(db,admin,id,{})).toMatchObject({current:{id:runs[23]},activePhase:'collect'});await db.collectionRun.update({where:{id:runs[23]},data:{status:'COMPLETE'}});});
it('rejects sales and foreign cursor, reports nonexistent selection without fallback',async()=>{
 await expect(runHistory(db,{...admin,role:'SALES'},id,{})).rejects.toThrow();await expect(runHistory(db,admin,id,{before:'foreign'})).rejects.toThrow();
 expect(await runHistory(db,admin,id,{runId:'foreign'})).toMatchObject({selected:null,selectedMissing:true});expect(runHistoryInput.safeParse({before:'x',unexpected:true}).success).toBe(false);
});
