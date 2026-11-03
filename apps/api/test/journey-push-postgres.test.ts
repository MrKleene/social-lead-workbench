import 'reflect-metadata';
import {beforeAll,afterAll,it,expect} from 'vitest';
import {randomUUID} from 'node:crypto';
import {Client} from 'pg';
import {Db} from '../src/common/db';
import {JourneyPushHub} from '../src/common/journey-push';
import {journeyPushSchema} from '@crm/contracts';
const url=process.env.TEST_DATABASE_URL;if(!url||new URL(url).pathname!=='/crm_test'||!['localhost','127.0.0.1'].includes(new URL(url).hostname))throw Error('Only isolated crm_test');
const db=new Db({datasources:{db:{url}}}),listener=new Client({connectionString:url}),writer=new Client({connectionString:url}),id='push-'+randomUUID(),events:any[]=[];
let run:string,job:string,other:string;
const settle=()=>new Promise(r=>setTimeout(r,100));
const waitFor=async(fn:()=>boolean)=>{for(let i=0;i<50;i++){if(fn())return;await settle();}throw Error('notification not received');};
beforeAll(async()=>{
 await db.$connect();await listener.connect();await writer.connect();listener.on('notification',m=>{if(m.payload)events.push(journeyPushSchema.parse(JSON.parse(m.payload)));});await listener.query('LISTEN crm_journey_v1');
 await db.collectionConfig.create({data:{id,platform:'XHS',mode:'MOCK',name:'虚构',keywords:['测试'],excludeWords:[]}});
 await db.commentReviewPolicy.create({data:{id,name:'虚构',target:'虚构'}});
 for(const n of ['one','two']){const r=await db.collectionRun.create({data:{configId:id,revision:1,requestKey:randomUUID(),scenario:'BASELINE',status:'RUNNING',snapshot:{}}});if(n==='one')run=r.id;else other=r.id;}
 await db.autoContactRule.create({data:{id,platform:'XHS',policyId:id,policyRevision:1}});
 const r=await db.semanticReview.create({data:{configId:id,runId:run,revision:1,snapshotHash:'push',platform:'XHS',platformUserId:'fixture',snapshot:{},rules:{},isDemo:true,state:'EVALUATED'}});
 job=(await db.autoContactJob.create({data:{ruleId:id,ruleVersion:1,reviewId:r.id,reviewVersion:1,mode:'SIMULATION',platform:'XHS',recipientId:'fixture',postId:'fixture',commentId:'fixture',channel:'COMMENT',content:'fixture',evidence:{},eligibilityHash:'fixture',status:'ATTEMPTED'}})).id;
 await settle();events.length=0;
});
afterAll(async()=>{await writer.query('ROLLBACK');await listener.end();await writer.end();await db.auditLog.deleteMany({where:{entityId:{in:[run,other]}}});await db.autoContactJob.deleteMany({where:{ruleId:id}});await db.autoContactRule.delete({where:{id}});await db.semanticReview.deleteMany({where:{configId:id}});await db.commentReviewPolicy.delete({where:{id}});await db.collectionRun.deleteMany({where:{configId:id}});await db.collectionConfig.delete({where:{id}});await db.$disconnect();});
it('publishes only after transaction commits; rollback never announces work',async()=>{
 await writer.query('BEGIN');await writer.query('UPDATE "CollectionRun" SET observed=10 WHERE id=$1',[run]);await settle();expect(events).toHaveLength(0);await writer.query('ROLLBACK');await settle();expect(events).toHaveLength(0);
 await writer.query('BEGIN');await writer.query('UPDATE "CollectionRun" SET observed=10 WHERE id=$1',[run]);await writer.query('UPDATE "CollectionRun" SET observed=11 WHERE id=$1',[run]);await settle();expect(events).toHaveLength(0);await writer.query('COMMIT');await waitFor(()=>events.length>0);
 expect(events).toHaveLength(1);expect(events[0]).toMatchObject({v:1,kind:'change',runId:run,configId:id});expect((await db.collectionRun.findUniqueOrThrow({where:{id:run}})).observed).toBe(11);events.length=0;
});
it('publishes phase and identity-bound heartbeat without content; ignores unchanged updates',async()=>{
 await db.collectionRun.update({where:{id:run},data:{observed:11}});await settle();expect(events).toHaveLength(0);
 const at=new Date();await db.auditLog.create({data:{entityId:run,action:'JOURNEY_PROGRESS',createdAt:at,metadata:{v:1,stage:'collect',executionId:run,phase:'SEARCHING',session:'s',heartbeat:true}}});await waitFor(()=>events.length>0);expect(events[0]).toMatchObject({kind:'heartbeat',runId:run,executionId:run,session:'s',phase:'SEARCHING'});expect(new Date(events[0].at).getTime()).toBe(at.getTime());expect(JSON.stringify(events[0])).not.toContain('虚构');events.length=0;
 await db.auditLog.create({data:{entityId:run,action:'JOURNEY_PROGRESS',metadata:{v:1,stage:'collect',executionId:run,phase:'SAVING_CAPTURE',session:'s',heartbeat:false}}});await waitFor(()=>events.length>0);expect(events[0].kind).toBe('change');events.length=0;
});
it('maps contact terminal UNKNOWN to its run, preserving the result and all protection',async()=>{
 await db.autoContactJob.update({where:{id:job},data:{status:'UNKNOWN',reason:'fixture uncertain'}});await waitFor(()=>events.length>0);expect(events[0]).toMatchObject({runId:run,kind:'change'});expect((await db.autoContactJob.findUniqueOrThrow({where:{id:job}})).status).toBe('UNKNOWN');expect(events.every(x=>x.runId!==other)).toBe(true);events.length=0;
});
it('archive generates reset, while ordinary audit logs do not leak through the channel',async()=>{
 await db.auditLog.create({data:{entityId:run,action:'UNRELATED',metadata:{private:'do not push'}}});await settle();expect(events).toHaveLength(0);
 const batch=await db.historyArchiveBatch.create({data:{id:randomUUID(),actorId:id,backupSha256:'fixture',items:{create:{entity:'CollectionRun',recordId:run}}}});await waitFor(()=>events.length>0);expect(events.every(x=>x.kind==='reset'&&x.runId===null)).toBe(true);await db.historyArchiveItem.deleteMany({where:{batchId:batch.id}});await db.historyArchiveBatch.delete({where:{id:batch.id}});await settle();events.length=0;
});
it('API listener receives other-connection commits, recovers after connection loss and closes cleanly',async()=>{
 const hub=new JourneyPushHub(),signals:any[]=[];hub.signals.subscribe(e=>signals.push(e));hub.onModuleInit();await waitFor(()=>hub.available);
 await db.collectionRun.update({where:{id:other},data:{observed:7}});await waitFor(()=>signals.some(e=>e.type==='journey'&&e.data.runId===other));
 await (hub as any).client.end();await waitFor(()=>!hub.available);await waitFor(()=>hub.available);expect(signals.filter(e=>e.type==='connection'&&e.available)).toHaveLength(2);
 await hub.onModuleDestroy();expect(hub.available).toBe(false);
});
