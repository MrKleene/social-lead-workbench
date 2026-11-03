import 'reflect-metadata';
import {beforeAll,afterAll,it,expect} from 'vitest';
import {randomUUID} from 'node:crypto';
import {Db,historyDisplay} from '../src/common/db';
import {HistoryArchiveService} from '../src/history-archive/history-archive.service';
import {wasHistoryArchived,archivedReviewIds} from '../src/history-archive/archive-guard';
import {runHistory} from '../src/collection/run-history';
import {projectOverview} from '../src/collection/project-overview';
import {CaptureService} from '../src/collection/capture.service';
import {ContactSettingsService} from '../src/auto-contact/contact-settings.service';
import {AutoContactService} from '../src/auto-contact/auto-contact.service';
import {AutoReviewService} from '../src/comment-review/auto-review.service';
import {ReviewEvaluationService} from '../src/comment-review/review-evaluation.service';
import {PendingRepliesService} from '../src/auto-contact/pending-replies.service';
const url=process.env.TEST_DATABASE_URL;if(!url||new URL(url).pathname!=='/crm_test'||!['127.0.0.1','localhost'].includes(new URL(url).hostname))throw Error('isolated crm_test required');
const db=new Db({datasources:{db:{url}}}),service=new HistoryArchiveService(db),actor={id:'archive-fixture-admin',name:'fixture',email:'archive@example.invalid',role:'ADMIN' as const};
const batch=randomUUID(),input={id:batch,backupSha256:'a'.repeat(64),consent:'ARCHIVE_HISTORY_KEEP_SAFETY',expectedPending:7,expectedPendingIds:Array.from({length:7},(_,i)=>'pending-'+i)};
const sender={mode:'REAL',capability:()=>false} as any;let before:any;
beforeAll(async()=>{
 await db.user.create({data:{...actor,passwordHash:'fixture-only'}});
 await db.collectionConfig.create({data:{id:'archive-config',name:'虚构配置',platform:'XHS',mode:'MOCK',keywords:['测试'],excludeWords:[],batchLimit:1}});
 await db.collectionRun.create({data:{id:'archive-run',configId:'archive-config',revision:1,requestKey:randomUUID(),scenario:'BASELINE',status:'COMPLETE',snapshot:{mode:'XHS_MCP'}}});
 await db.capturedPost.create({data:{id:'archive-post',configId:'archive-config',runId:'archive-run',lastRunId:'archive-run',platformPostId:'fictional-post',contentHash:'post',snapshot:{title:'虚构帖子'}}});
 await db.capturedComment.create({data:{id:'archive-comment',configId:'archive-config',runId:'archive-run',lastRunId:'archive-run',postId:'archive-post',platformCommentId:'fictional-comment',contentHash:'comment',contextVersion:'test',snapshot:{comment:'虚构评论',userId:'fictional-user',commentId:'fictional-comment',postId:'fictional-post'},isDemo:false}});
 await db.semanticReview.create({data:{id:'archive-review',configId:'archive-config',runId:'archive-run',revision:1,snapshotHash:'hash',captureId:'archive-comment',platform:'XHS',platformUserId:'fictional-user',snapshot:{},rules:{},state:'EVALUATED',score:100,context:'SUFFICIENT',isDemo:false}});
 await db.platformAccount.create({data:{id:'archive-account',platform:'XHS',label:'虚构账号',dailyLimit:1}});
 await db.platformIdentity.create({data:{id:'archive-identity',platform:'XHS',platformUserId:'fictional-user',nickname:'虚构用户',isDemo:false}});
 await db.contactLedger.create({data:{id:'archive-ledger',identityId:'archive-identity',accountId:'archive-account',mode:'REAL'}});
 await db.contactAttempt.create({data:{id:'archive-unknown',ledgerId:'archive-ledger',requestKey:'archive-unknown',actorId:actor.id,kind:'FIRST',day:'REAL:Asia/Shanghai:2026-11-03',mode:'REAL',outcome:'UNKNOWN'}});
 await db.accountDay.create({data:{accountId:'archive-account',day:'REAL:Asia/Shanghai:2026-11-03',occupied:1}});
 await db.semanticModelCall.create({data:{id:'archive-call',actorId:actor.id,requestKey:'archive-call',previewHash:'hash',status:'COMPLETED',rows:1,reservedUntil:new Date(0)}});
 await db.autoContactRule.create({data:{id:'archive-rule',platform:'XHS',policyId:'unused',policyRevision:1,mode:'REAL'}});
 for(let i=0;i<7;i++){await db.semanticReview.create({data:{id:'pending-review-'+i,configId:'archive-config',runId:'archive-run',revision:1,snapshotHash:'p'+i,platform:'XHS',platformUserId:'p'+i,snapshot:{},rules:{},isDemo:false}});await db.autoContactJob.create({data:{id:'pending-'+i,ruleId:'archive-rule',ruleVersion:1,reviewId:'pending-review-'+i,reviewVersion:0,mode:'REAL',platform:'XHS',recipientId:'p'+i,postId:'fictional-post',commentId:'p'+i,channel:'COMMENT',content:'虚构内容',evidence:{},eligibilityHash:'hash',status:'PENDING_ACTION'}});}
 before={attempt:await db.contactAttempt.findUnique({where:{id:'archive-unknown'}}),usage:await db.accountDay.findMany(),rule:await db.autoContactRule.findUnique({where:{id:'archive-rule'}}),config:await db.collectionConfig.findUnique({where:{id:'archive-config'}})};
});
afterAll(async()=>{await db.onModuleDestroy();});
it('admin only, precise consent and pending count; refused operations leave no batch',async()=>{
 await expect(service.archive({...actor,role:'SALES'},input)).rejects.toThrow();
 await expect(service.archive(actor,{...input,consent:'yes'})).rejects.toThrow();
 await expect(service.archive(actor,{...input,expectedPending:6})).rejects.toThrow('范围已变化');expect(await service.list(actor)).toHaveLength(0);
 await expect(service.archive(actor,{...input,expectedPendingIds:['different',...input.expectedPendingIds.slice(1)]})).rejects.toThrow('范围已变化');
});
it('active work prevents archive without changing running job or rules',async()=>{
 await db.collectionRun.update({where:{id:'archive-run'},data:{status:'RUNNING'}});
 await expect(service.archive(actor,input)).rejects.toThrow('仍有运行');
 expect((await db.collectionRun.findUniqueOrThrow({where:{id:'archive-run'}})).status).toBe('RUNNING');expect(await service.list(actor)).toHaveLength(0);
 await db.collectionRun.update({where:{id:'archive-run'},data:{status:'COMPLETE'}});
});
it('atomically archives once and cancels only seven never-attempted pending jobs',async()=>{
 const [a,b]=await Promise.all([service.archive(actor,input),service.archive(actor,input)]);expect(a.id).toBe(b.id);expect(a.counts.pendingRemoved).toBe(7);expect(await service.list(actor)).toHaveLength(1);
 expect(await db.autoContactJob.count({where:{status:'CANCELLED'}})).toBe(7);expect(await db.autoContactJob.count({where:{status:'PENDING_ACTION'}})).toBe(0);
 expect(await db.contactAttempt.findUnique({where:{id:'archive-unknown'}})).toEqual(before.attempt);expect(await db.accountDay.findMany()).toEqual(before.usage);expect(await db.autoContactRule.findUnique({where:{id:'archive-rule'}})).toEqual(before.rule);expect(await db.collectionConfig.findUnique({where:{id:'archive-config'}})).toEqual(before.config);
 expect(await db.contactLedger.count()).toBe(1);expect(await db.semanticModelCall.count()).toBe(1);expect(await db.capturedComment.count()).toBe(1);
});
it('all display reads and raw SQL aggregates are empty, while protection reads still see UNKNOWN',async()=>{
 const display=historyDisplay(db);expect(await display.collectionRun.count()).toBe(0);expect(await display.capturedPost.count()).toBe(0);expect(await display.capturedComment.count()).toBe(0);expect(await display.semanticReview.count()).toBe(0);expect(await display.contactAttempt.count()).toBe(0);
 expect(await display.$queryRaw`SELECT count(*)::int n FROM "CapturedComment"`).toEqual([{n:0}]);
 expect(await runHistory(db,actor,'archive-config',{})).toMatchObject({items:[],current:null});
 expect(await new CaptureService(db).posts(actor,'archive-config',{})).toMatchObject({total:0,postVersions:0});
 expect(await new ContactSettingsService(db,sender).history(actor)).toMatchObject({total:0,allTotal:0,confirmedTotal:0,items:[]});
 expect(await new PendingRepliesService(db,sender).list(actor)).toMatchObject({total:0,items:[]});
 expect((await projectOverview(db,actor)).archive).toMatchObject({posts:0,comments:0});
 expect((await db.contactAttempt.findUniqueOrThrow({where:{id:'archive-unknown'}})).outcome).toBe('UNKNOWN');
 await expect(display.collectionRun.update({where:{id:'archive-run'},data:{status:'RUNNING'}})).rejects.toThrow('READ_ONLY');
});
it('new run and re-observed capture become visible; old run and outgoing history stay hidden',async()=>{
 await db.collectionRun.create({data:{id:'archive-new-run',configId:'archive-config',revision:1,requestKey:randomUUID(),scenario:'BASELINE',status:'COMPLETE',snapshot:{mode:'XHS_MCP'}}});
 await db.capturedPost.update({where:{id:'archive-post'},data:{lastRunId:'archive-new-run'}});await db.capturedComment.update({where:{id:'archive-comment'},data:{lastRunId:'archive-new-run'}});
 expect(await historyDisplay(db).capturedComment.count()).toBe(1);expect(await historyDisplay(db).semanticReview.count()).toBe(1);expect(await historyDisplay(db).collectionRun.count()).toBe(1);expect((await projectOverview(db,actor)).archive.posts).toBe(1);
 expect(await db.$transaction(tx=>wasHistoryArchived(tx,'SemanticReview','archive-review'))).toBe(true);
 expect(await historyDisplay(db).contactAttempt.count()).toBe(0);
 expect(await archivedReviewIds(db)).not.toContain('archive-review');expect(await archivedReviewIds(db)).toContain('pending-review-0');
});
it('restore is admin-only, idempotent and display-only; never revives pending or sends',async()=>{
 await expect(service.restore({...actor,role:'SALES'},batch,{consent:'RESTORE_DISPLAY_ONLY_NO_SEND'})).rejects.toThrow();
 await service.restore(actor,batch,{consent:'RESTORE_DISPLAY_ONLY_NO_SEND'});await service.restore(actor,batch,{consent:'RESTORE_DISPLAY_ONLY_NO_SEND'});
 expect(await historyDisplay(db).collectionRun.count()).toBe(2);expect(await historyDisplay(db).contactAttempt.count()).toBe(1);expect(await db.autoContactJob.count({where:{status:'CANCELLED'}})).toBe(7);expect(await db.autoContactJob.count({where:{status:'PENDING_ACTION'}})).toBe(0);
 expect(await db.$transaction(tx=>wasHistoryArchived(tx,'SemanticReview','archive-review'))).toBe(true);expect(await db.contactAttempt.findUnique({where:{id:'archive-unknown'}})).toEqual(before.attempt);expect(await db.accountDay.findMany()).toEqual(before.usage);
 expect((await service.list(actor))[0].restoredAt).not.toBeNull();
});

it('restoring display cannot restart old model jobs or create delayed review/send jobs',async()=>{
 const send=new AutoContactService(db,sender);expect(await (send as any).reviewReady(db,{},'pending-review-0')).toBeNull();
 const evaluation=new ReviewEvaluationService(db,{} as any);await expect(evaluation.preview(actor,'anything',['pending-review-0'])).rejects.toThrow('已归档审核');
 const old=await db.collectionRun.findUniqueOrThrow({where:{id:'archive-run'}}),auto=new AutoReviewService(db,{} as any,{} as any);await auto.postFinished(old,{} as any);expect(await db.autoReviewJob.count()).toBe(0);
 expect(await db.contactAttempt.count()).toBe(1);expect(await db.semanticModelCall.count()).toBe(1);expect(await db.autoContactJob.count({where:{status:'CANCELLED'}})).toBe(7);
});
