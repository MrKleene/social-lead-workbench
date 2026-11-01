import 'reflect-metadata';
import {beforeAll,afterAll,it,expect} from 'vitest';
import {randomUUID,randomBytes} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {Test} from '@nestjs/testing';
import type {INestApplication} from '@nestjs/common';
import request from 'supertest';
import {Db} from '../src/common/db';
import {SessionGuard} from '../src/auth/auth';
import {digest} from '../src/auth/security';
import {configure} from '../src/bootstrap';
import {CommentReviewController} from '../src/comment-review/comment-review.controller';
import {ReviewPolicyService} from '../src/comment-review/review-policy.service';
import {ReviewEvaluationService} from '../src/comment-review/review-evaluation.service';
import {ManualReviewService} from '../src/comment-review/manual-review.service';
import {readRunReview} from '../src/comment-review/run-review-query';
import {commentDigest} from '../src/collection/comment-checkpoint';
const url=process.env.TEST_DATABASE_URL;if(!url||new URL(url).pathname!=='/crm_test'||!['localhost','127.0.0.1'].includes(new URL(url).hostname))throw Error('Only isolated local crm_test');
const sql:string[]=[];const db=new Db({datasources:{db:{url}},log:[{emit:'event',level:'query'}]});(db as any).$on('query',(e:{query:string})=>sql.push(e.query));
const prefix='run-review-'+randomUUID(),admin={id:prefix+'-admin',role:'ADMIN' as const},sales={id:prefix+'-sales',role:'SALES' as const};let app:INestApplication;const cookies:Record<string,string>={};
let configId='',runId='',oldId='',newId='',postId='',policyId=prefix+'-policy';
beforeAll(async()=>{
 await db.$connect();for(const a of [admin,sales]){await db.user.create({data:{id:a.id,email:a.id+'@example.invalid',name:'虚构测试用户',passwordHash:'unused',role:a.role}});const raw=randomBytes(32).toString('hex');await db.session.create({data:{id:digest(raw),userId:a.id,csrfToken:'fixture',expiresAt:new Date(Date.now()+60000)}});cookies[a.role]='crm_session='+raw;}
 const mod=await Test.createTestingModule({controllers:[CommentReviewController],providers:[SessionGuard,{provide:Db,useValue:db},{provide:ReviewPolicyService,useValue:{runReview:(actor:any,id:string,input:unknown)=>readRunReview(db,actor,id,input)}},{provide:ReviewEvaluationService,useValue:{}},{provide:ManualReviewService,useValue:{}}]}).compile();app=mod.createNestApplication();configure(app);await app.init();
 configId=(await db.collectionConfig.create({data:{name:prefix,platform:'XHS',mode:'MOCK',keywords:['虚构'],excludeWords:[],batchLimit:2}})).id;
 oldId=(await db.collectionRun.create({data:{configId,revision:1,snapshot:{},requestKey:randomUUID(),scenario:'BASELINE',status:'COMPLETE',createdAt:new Date(1000),finishedAt:new Date(2000),capturedPosts:1,capturedCommentsCount:1}})).id;
 runId=(await db.collectionRun.create({data:{configId,revision:1,snapshot:{},requestKey:randomUUID(),scenario:'BASELINE',status:'COMPLETE',createdAt:new Date(3000),finishedAt:new Date(10000),capturedPosts:2,capturedCommentsCount:34}})).id;
 await db.commentReviewPolicy.create({data:{id:policyId,name:'虚构方案',target:'虚构完整目标',revision:2}});for(const revision of [1,2])await db.commentReviewPolicyVersion.create({data:{policyId,revision,target:'虚构目标'+revision}});
 postId=(await db.capturedPost.create({data:{configId,runId:oldId,lastRunId:runId,platformPostId:prefix+'-post',contentHash:'post-hash',snapshot:{title:'虚构帖子A'},createdAt:new Date(1500)}})).id;
 for(let i=0;i<33;i++){const s={postId:prefix+'-post',commentId:prefix+'-comment-'+i,userId:prefix+'-user-'+i,title:'虚构帖子A',body:'虚构正文',comment:'虚构评论 '+i,parentId:i?prefix+'-comment-'+(i-1):null,parent:i?'父评论':null,coverage:'PARTIAL',isDemo:true};
 const c=await db.capturedComment.create({data:{configId,runId:i===0?oldId:runId,lastRunId:runId,postId,platformCommentId:s.commentId,contentHash:'hash'+i,contextVersion:'test',snapshot:s,isDemo:true,createdAt:new Date(i===0?1500:4000+i)}});
 if(i<3)await db.semanticReview.create({data:{id:prefix+'-review-'+i,policyId,policyRevision:i===2?2:1,sourceContentHash:c.contentHash,captureId:c.id,configId,runId:i===0?oldId:runId,revision:1,snapshotHash:'review'+i,platform:'XHS',platformUserId:s.userId,snapshot:s,rules:{version:1,target:'虚构目标',reviewThreshold:0},isDemo:true,state:i===1?'FAILED':i===2?'PROCESSING':'EVALUATED',score:i===0?12:null,result:i===0?{decision:'NO_MATCH',evidence:[]}:undefined,reason:i===1?'模型失败':'虚构理由',createdAt:new Date(5000+i)}});
 }
 const b=await db.capturedPost.create({data:{configId,runId,lastRunId:runId,platformPostId:prefix+'-second',contentHash:'second',snapshot:{title:'虚构帖子B'},createdAt:new Date(3500)}});
 await db.capturedComment.create({data:{configId,runId,lastRunId:runId,postId:b.id,platformCommentId:'b',contentHash:'b',contextVersion:'test',snapshot:{postId:prefix+'-second',commentId:'b',userId:'b',comment:'第二篇未送审评论',parentId:null},isDemo:true,createdAt:new Date(4500)}});
 await db.autoReviewJob.create({data:{policyId,postId,runId,policyVersion:1,status:'FAILED',reason:'虚构整帖审核失败',processed:0}});await db.autoReviewJob.create({data:{policyId,postId:b.id,runId,policyVersion:1,status:'SKIPPED',reason:'覆盖未通过',processed:0}});
 newId=(await db.collectionRun.create({data:{configId,revision:1,snapshot:{},requestKey:randomUUID(),scenario:'BASELINE',status:'COMPLETE',createdAt:new Date(20000),finishedAt:new Date(30000)}})).id;
 // A later-only comment and later-only post must never leak into the selected run.
 await db.capturedComment.create({data:{configId,runId:newId,lastRunId:newId,postId,platformCommentId:'foreign',contentHash:'foreign',contextVersion:'test',snapshot:{postId:prefix+'-post',commentId:'foreign',comment:'不属于本轮'},isDemo:true,createdAt:new Date(25000)}});
});
afterAll(async()=>{await app?.close();await db.$connect();await db.normalAcceptancePost.deleteMany({where:{acceptanceId:prefix}});await db.normalAutomationAcceptance.deleteMany({where:{id:prefix}});await db.autoReviewJob.deleteMany({where:{runId:{in:[oldId,runId,newId]}}});await db.commentReadCheckpoint.deleteMany({where:{configId}});await db.semanticReview.deleteMany({where:{configId}});await db.commentReviewPolicyVersion.deleteMany({where:{policyId}});await db.commentReviewPolicy.deleteMany({where:{id:policyId}});await db.capturedComment.deleteMany({where:{configId}});await db.capturedPost.deleteMany({where:{configId}});await db.collectionRun.deleteMany({where:{configId}});await db.collectionConfig.deleteMany({where:{id:configId}});await db.session.deleteMany({where:{userId:{in:[admin.id,sales.id]}}});await db.user.deleteMany({where:{id:{in:[admin.id,sales.id]}}});await db.$disconnect();});
const get=(suffix='',role='ADMIN')=>request(app.getHttpServer()).get(`/api/comment-review/runs/${runId}/review?policyId=${policyId}${suffix}`).set('Cookie',cookies[role]||'');
it('real session guard rejects anonymous and non-admin without writes',async()=>{expect((await get('','NONE')).status).toBe(401);expect((await get('','SALES')).status).toBe(403);});
it('scopes multiple posts, preserves low score history provenance and pages all comments',async()=>{
 const before=sql.length,p=await get('&postId='+prefix+'-post');expect(p.status).toBe(200);expect(p.headers['cache-control']).toBe('no-store');expect(p.body.posts).toHaveLength(2);expect(p.body.knownComments).toBe(33);expect(p.body.comments).toHaveLength(30);expect(p.body.comments[0].reviews[0]).toMatchObject({score:12,origin:'SAVED',captureRunId:oldId});expect(p.body.comments[1].reviews[0].state).toBe('FAILED');expect(p.body.comments[2].reviews[0].state).toBe('PROCESSING');expect(p.body.comments[3].reviews).toEqual([]);expect(p.body.comments[29].parentKnown).toBe(true);expect(JSON.stringify(p.body)).not.toContain('不属于本轮');
 const next=await get('&postId='+prefix+'-post&offset=30');expect(next.body.comments).toHaveLength(3);expect(next.body.hasMore).toBe(false);expect(next.body.comments.some((r:any)=>p.body.comments.some((a:any)=>a.id===r.id))).toBe(false);expect(sql.slice(before).some(q=>/\b(INSERT|UPDATE|DELETE|ALTER|CREATE)\b/.test(q))).toBe(false);
});
it('separates skipped post and rejects unrelated IDs and invalid filters',async()=>{const b=await get('&postId='+prefix+'-second');expect(b.body.comments).toHaveLength(1);expect(b.body.posts.find((p:any)=>p.id===prefix+'-second').jobs[0].status).toBe('SKIPPED');expect(b.body.comments[0].reviews).toEqual([]);expect((await get('&postId=unrelated')).status).toBe(404);expect((await get('&offset=-1')).status).toBe(400);expect((await get('&extra=1')).status).toBe(400);});
it('isolates selected policy version and reflects asynchronous result update without executing model',async()=>{const before=await get('&postId='+prefix+'-post&policyRevision=2');expect(before.body.comments[0].reviews).toEqual([]);expect(before.body.comments[2].reviews[0].state).toBe('PROCESSING');await db.semanticReview.update({where:{id:prefix+'-review-2'},data:{state:'EVALUATED',score:38,result:{decision:'NO_MATCH'}}});const after=await get('&postId='+prefix+'-post&policyRevision=2');expect(after.body.comments[2].reviews[0]).toMatchObject({state:'EVALUATED',score:38});});
it('historical runs retain only provable members rather than current full post history',async()=>{const p=await request(app.getHttpServer()).get(`/api/comment-review/runs/${oldId}/review?policyId=${policyId}`).set('Cookie',cookies.ADMIN);expect(p.status).toBe(200);expect(p.body.knownComments).toBe(1);expect(p.body.scope).toBe('EXACT');expect(p.body.expectedComments).toBe(1);});

it('uses frozen claims after the capture moves to a newer run, without mixing another policy',async()=>{
 await db.normalAutomationAcceptance.create({data:{id:prefix,scope:{},actorId:admin.id,runId,state:'CLOSED',capturedPostId:postId,modelCallId:prefix+'-call',reviewIds:[prefix+'-review-0']}});
 await db.capturedComment.updateMany({where:{configId,platformCommentId:prefix+'-comment-0'},data:{lastRunId:newId}});
 const p=await get('&postId='+prefix+'-post');expect(p.status).toBe(200);expect(p.body.knownComments).toBe(33);expect(p.body.comments[0]).toMatchObject({membership:'BOUND',reviews:[{origin:'BOUND',score:12}]});
});
it('verifies recovered old members against checkpoint digests and refuses changed proof',async()=>{
 const ref=prefix+'-recovered',post=await db.capturedPost.create({data:{configId,runId,lastRunId:newId,platformPostId:ref,contentHash:'recovered',snapshot:{title:'虚构恢复帖'},createdAt:new Date(9000)}});
 const marks=[];for(let i=0;i<6;i++){const c={id:'recover-'+i,userId:'recover-user-'+i,text:'虚构恢复评论'+i,parentId:i%2?'recover-'+(i-1):undefined,nickname:'',hasReplies:false};marks.push({id:c.id,parent:c.parentId||'',digest:commentDigest(ref,c)});await db.capturedComment.create({data:{configId,runId,lastRunId:runId,postId:post.id,platformCommentId:c.id,contentHash:'recover'+i,contextVersion:'test',snapshot:{postId:ref,commentId:c.id,userId:c.userId,comment:c.text,parentId:c.parentId||null},isDemo:true,createdAt:new Date(9001+i)}});}
 const report=JSON.parse(readFileSync(resolve(__dirname,'../../../scripts/mcp-avatar-diagnostics/root-scope-wire.json'),'utf8')).data.boundedRead;
 await db.collectionRun.update({where:{id:newId},data:{capturedPosts:1,capturedCommentsCount:6,execution:{accountId:'fixture-account',deviceId:'fixture-device'},metrics:{coverage:{version:1,search:'UNKNOWN',reasons:[],posts:[{postRef:ref,ordinal:1,saved:0,roots:0,replies:0,complete:true,reason:'DECLARED_TREE_EXHAUSTED',boundedRead:report,recovery:{confirmedTotal:6,remainingAnchors:0,sequence:1}}]}}}});
 const cp=await db.commentReadCheckpoint.create({data:{configId,platformPostId:ref,accountId:'fixture-account',deviceId:'fixture-device',revision:1,state:'COMPLETE',sequence:1,checkpoint:{version:1,sequence:1,marks}}});
 const path=`/api/comment-review/runs/${newId}/review?postId=${ref}&policyId=${policyId}`;
 const p=await request(app.getHttpServer()).get(path).set('Cookie',cookies.ADMIN);expect(p.status).toBe(200);expect(p.body.scope).toBe('EXACT');expect(p.body.knownComments).toBe(6);expect(p.body.comments.every((c:any)=>c.membership==='RECOVERY')).toBe(true);
 marks[0].digest='0'.repeat(64);await db.commentReadCheckpoint.update({where:{id:cp.id},data:{checkpoint:{version:1,sequence:1,marks}}});const q=await request(app.getHttpServer()).get(path).set('Cookie',cookies.ADMIN);expect(q.body.knownComments).toBe(5);expect(q.body.scope).toBe('PARTIAL');
});
