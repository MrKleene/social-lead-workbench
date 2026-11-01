import 'reflect-metadata';
import {beforeAll,afterAll,it,expect} from 'vitest';
import {Db} from '../src/common/db';
import {readPostEvidence} from '../src/collection/post-read-evidence';
import {readSavedPostPage} from '../src/collection/saved-post-page';
import {readAvailability,postSendBlock} from '../src/collection/post-availability';
import {readEvidenceFixture} from './post-read-evidence.fixture';
const url=process.env.TEST_DATABASE_URL;
if(!url||new URL(url).pathname!=='/crm_test'||!['localhost','127.0.0.1'].includes(new URL(url).hostname))throw Error('Only isolated crm_test');
const db=new Db({datasources:{db:{url}}}),f=readEvidenceFixture();
const admin={id:'fixture-admin',name:'虚构管理员',email:'fixture@example.invalid',role:'ADMIN' as const};
async function clean(){await db.postAvailability.deleteMany({where:{postId:'synthetic-post'}});await db.commentReadCheckpoint.deleteMany({where:{configId:'config'}});await db.capturedComment.deleteMany({where:{configId:'config'}});await db.capturedPost.deleteMany({where:{configId:'config'}});await db.collectionRun.deleteMany({where:{configId:'config'}});await db.collectionConfig.deleteMany({where:{id:'config'}});}
beforeAll(async()=>{
 await db.$connect();await clean();
 await db.collectionConfig.create({data:{id:'config',name:'虚构配置',platform:'XHS',mode:'MOCK',keywords:['虚构'],excludeWords:[],batchLimit:1}});
 await db.collectionRun.create({data:{...f.run,snapshot:{},requestKey:'fixture-run',scenario:'BASELINE'}});
 await db.collectionRun.create({data:{id:'old',configId:'config',revision:1,snapshot:{},requestKey:'old',scenario:'BASELINE',status:'COMPLETE',createdAt:new Date(100),finishedAt:new Date(400)}});
 await db.capturedPost.create({data:{...f.post,runId:'old',contentHash:'fixture'}});
 for(const [i,c] of f.comments.entries())await db.capturedComment.create({data:{...c,id:'capture'+i,configId:'config',postId:'post',runId:'old',lastRunId:'old',contentHash:'hash'+i,contextVersion:'fixture',isDemo:true,createdAt:new Date(600+i)}});
 await db.capturedComment.create({data:{id:'old-comment',configId:'config',postId:'post',runId:'old',lastRunId:'old',platformCommentId:'historical',snapshot:{postId:'synthetic-post',commentId:'historical',comment:'不属于本轮'},contentHash:'old-hash',contextVersion:'fixture',isDemo:true,createdAt:new Date(650)}});
 await db.commentReadCheckpoint.create({data:{...f.checkpoint,id:'cp',configId:'config',platformPostId:'synthetic-post',accountId:'account',deviceId:'device',revision:1,state:'COMPLETE'}});
});
afterAll(async()=>{await clean();await db.$disconnect();});
async function observation(){return db.$transaction(async tx=>{await tx.$executeRawUnsafe('SET TRANSACTION READ ONLY');return readPostEvidence(tx,(await tx.capturedPost.findUniqueOrThrow({where:{id:'post'}})))});}
it('real SQL projection verifies 33 reused members, retains 34 archive comments, and agrees with availability response',async()=>{
 expect(await observation()).toMatchObject({coverage:'COMPLETE',confirmedComments:33,accessObserved:true});
 const list=await readSavedPostPage(db,'config','XHS',{});expect(list.posts[0]).toMatchObject({savedComments:34,readEvidence:{coverage:'COMPLETE',confirmedComments:33}});
 const state=await readAvailability(db,admin,'post');expect(state.current.state).toBe('UNKNOWN');expect(state.readEvidence.coverage).toBe('COMPLETE');expect(await db.postAvailability.count()).toBe(0);
});
it('missing a current member makes coverage unknown without deleting history',async()=>{await db.capturedComment.update({where:{id:'capture0'},data:{snapshot:{...f.comments[0].snapshot,comment:'changed'}}});expect(await observation()).toMatchObject({coverage:'UNKNOWN',confirmedComments:32,reason:'MEMBERS_MISSING'});await db.capturedComment.update({where:{id:'capture0'},data:{snapshot:f.comments[0].snapshot}});expect(await db.capturedComment.count()).toBe(34);});
it('independent newer restriction remains stored and still blocks sends',async()=>{await db.postAvailability.create({data:{platform:'XHS',postId:'synthetic-post',state:'UNAVAILABLE',reason:'RESTRICTED',version:1,source:'MANUAL',evidence:{note:'虚构限制证据'},checkedAt:new Date(4000)}});const r=await readAvailability(db,admin,'post');expect(r.current.state).toBe('UNAVAILABLE');expect(r.readEvidence.accessObserved).toBe(true);const risk=await db.postAvailability.findFirst();expect(postSendBlock(risk)).toContain('UNAVAILABLE');});
it('historical selection never adopts later report or mutable recovery marks',async()=>{await db.collectionRun.create({data:{id:'later',configId:'config',revision:2,snapshot:{},requestKey:'later',scenario:'BASELINE',status:'COMPLETE',createdAt:new Date(5000),finishedAt:new Date(6000)}});await db.capturedPost.update({where:{id:'post'},data:{lastRunId:'later',lastSeenAt:new Date(5500),snapshot:{title:'后续保存的原文'}}});const page=await readSavedPostPage(db,'config','XHS',{runId:'run'});expect(page.posts).toHaveLength(1);expect(page.posts[0].readEvidence).toMatchObject({runId:'run',scope:'RUN',coverage:'UNKNOWN',observedAt:new Date(3000).toISOString()});expect(await observation()).toMatchObject({runId:'later',coverage:'UNKNOWN',accessObserved:false});});
