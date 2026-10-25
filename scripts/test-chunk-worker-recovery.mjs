// Disposable real PostgreSQL + Redis + production queue/execute/transaction path.
// Only account/platform I/O is synthetic. Never use against a persistent instance.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {spawn} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {createServer} from 'node:net';
const require=createRequire(import.meta.url);
require('reflect-metadata');
const database=new URL(process.env.DATABASE_URL),redis=new URL(process.env.REDIS_URL),name=process.env.COLLECTION_QUEUE_NAME;
assert.equal(process.env.CRM_DISPOSABLE_QUEUE_TEST,'1');assert.equal(database.hostname,'127.0.0.1');assert.equal(database.pathname,'/crm_test');assert.equal(redis.hostname,'127.0.0.1');assert(!['5432','55432'].includes(database.port));assert(!['6379','56379'].includes(redis.port));assert.match(name,/^crm-queue-acceptance-[a-f0-9]+$/);
Object.assign(process.env,{CRM_PERSISTENT:'1',CRM_ACCOUNT_READ_ENABLED:'1',CRM_DEVICE_MANAGEMENT:'1',XHS_ACCOUNT_LOGIN_MODE:'real'});
const {Db}=require('../apps/api/dist/common/db'),{CollectionQueue,redisConnection}=require('../apps/api/dist/collection/queue'),{CollectionService}=require('../apps/api/dist/collection/service'),{Queue,QueueEvents}=require('bullmq');
const db=new Db(),producer=new CollectionQueue(),queue=new Queue(name,{connection:redisConnection()}),events=new QueueEvents(name,{connection:{...redisConnection(),maxRetriesPerRequest:null}});
const service=new CollectionService(db,producer,{authorize:async(_tx,actor)=>({accountId:'isolated-account',deviceId:'isolated-device',actorId:actor.id})});
const children=new Set();
const wait=ms=>new Promise(r=>setTimeout(r,ms));
async function bounded(p,label,ms=10000){let timer;try{return await Promise.race([p,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error(label+' timeout')),ms);})]);}finally{clearTimeout(timer);}}
function child(file,env={}){const c=spawn(process.execPath,[file],{env:{...process.env,DOTENV_CONFIG_PATH:'/dev/null',...env},stdio:['ignore','ignore','ignore','ipc']});children.add(c);c.messages=[];c.on('message',m=>c.messages.push(m));c.ended=new Promise(resolve=>c.once('exit',(code,signal)=>{children.delete(c);resolve({code,signal});}));return c;}
async function message(c,kind){for(let i=0;i<500;i++){const found=c.messages.find(x=>x.kind===kind);if(found)return found;assert.equal(c.exitCode,null,'fixture exited');await wait(20);}throw Error(kind+' timeout');}
async function stop(c){const start=Date.now();c.kill('SIGTERM');const exit=await bounded(c.ended,'normal child shutdown');assert(exit.code===0||exit.signal==='SIGTERM',JSON.stringify(exit));return Date.now()-start;}
async function finish(id){const job=await queue.getJob(id);assert(job);await job.waitUntilFinished(events,10000);return db.collectionRun.findUniqueOrThrow({where:{id}});}
const stats={syntheticPlatform:true,realDatabase:true,realRedis:true,productionExecute:true,productionQueueConsumer:true,workerShutdownMs:[],apiShutdownMs:[]};
try{
 assert.equal(await db.user.count(),0);assert.equal(await queue.getJobCountByTypes(),0);await events.waitUntilReady();
 const {hashPassword}=require('../apps/api/dist/auth/security');
 const password=randomUUID()+randomUUID();
 const actor=await db.user.create({data:{name:'Synthetic recovery admin',email:'recovery@example.invalid',role:'ADMIN',active:true,passwordHash:await hashPassword(password)}});
 const config=await service.create(actor,{name:'隔离恢复',platform:'XHS',mode:'XHS_MCP',keywords:['合成'],excludeWords:[],batchLimit:1,enabled:true});
 let w=child('scripts/fixtures/chunk-worker.cjs',{SYNTHETIC_BLOCK_AFTER_FIRST:'1'});await message(w,'READY');
 const first=await service.start(actor,config.id,'READ_WINDOW',randomUUID(),'XHS_MCP','isolated-account','synthetic-only');
 assert.equal((await message(w,'AFTER_COMMIT')).marks,40);
 const saved=await db.commentReadCheckpoint.findFirstOrThrow({where:{configId:config.id}});
 assert.equal(saved.sequence,1);assert.equal(saved.checkpoint.marks.length,40);assert.equal(await db.capturedComment.count({where:{configId:config.id}}),40);
 assert.equal((await service.pauseRun(actor,first.id)).status,'PAUSED');
 assert.equal((await finish(first.id)).status,'PAUSED');
 const paused=await db.commentReadCheckpoint.findUniqueOrThrow({where:{id:saved.id}});assert.deepEqual(paused.checkpoint,saved.checkpoint);assert.equal(paused.ownerRunId,null);assert.equal(paused.expiresAt,null);
 stats.workerShutdownMs.push(await stop(w));
 // A new OS process has no in-memory reader state. The only recovery input is DB.
 w=child('scripts/fixtures/chunk-worker.cjs');await message(w,'READY');
 const second=await service.start(actor,config.id,'READ_WINDOW',randomUUID(),'XHS_MCP','isolated-account','synthetic-only');
 assert.equal((await message(w,'RESTORED')).marks,40);
 const completed=await finish(second.id);assert.equal(completed.status,'PARTIAL');
 const cp=await db.commentReadCheckpoint.findUniqueOrThrow({where:{id:saved.id}});assert.equal(cp.checkpoint.marks.length,125);assert(cp.fence>saved.fence);assert.equal(cp.ownerRunId,null);assert.equal(cp.expiresAt,null);
 const rows=await db.capturedComment.findMany({where:{configId:config.id},select:{platformCommentId:true,runId:true}});assert.equal(rows.length,125);assert.equal(new Set(rows.map(r=>r.platformCommentId)).size,125);assert.equal(rows.filter(r=>r.runId===first.id).length,40);assert.equal(rows.filter(r=>r.runId===second.id).length,85);
 // Duplicate delivery follows the production QUEUED claim gate, writes nothing.
 const duplicate=await queue.add('XHS_READ',{type:'XHS_READ',runId:second.id},{jobId:'duplicate-'+randomUUID(),attempts:1});await duplicate.waitUntilFinished(events,10000);assert.equal(await db.capturedComment.count({where:{configId:config.id}}),125);
 assert.equal(await db.collectionRun.count(),2);assert.equal(await db.collectionRun.count({where:{status:{in:['RUNNING','QUEUED']}}}),0);assert.equal((await db.collectionConfig.findUniqueOrThrow({where:{id:config.id}})).activeRunId,null);
 assert.equal(await db.semanticModelCall.count(),0);assert.equal(await db.contactAttempt.count(),0);
 stats.workerShutdownMs.push(await stop(w));
 stats.committedBeforePause=40;stats.restoredAfterProcessRestart=40;stats.newOnResume=85;stats.finalUnique=125;stats.staleOrDuplicateWrites=0;
 // Real built API, same IPC stdio as production launcher, three orderly lifecycles.
 for(let i=0;i<3;i++){
  const socket=createServer();await new Promise(r=>socket.listen(0,'127.0.0.1',r));const port=socket.address().port;await new Promise(r=>socket.close(r));
  const api=child('apps/api/dist/main.js',{CRM_PERSISTENT:'0',CRM_ACCOUNT_READ_ENABLED:'0',CRM_DEVICE_MANAGEMENT:'0',XHS_ACCOUNT_LOGIN_MODE:'',PORT:String(port),API_HOST:'127.0.0.1',APP_ORIGIN:`http://127.0.0.1:${port}`});
  let ready=false;for(let n=0;n<150;n++){try{const res=await fetch(`http://127.0.0.1:${port}/api/health/ready`);await res.arrayBuffer();if(res.status===200){ready=true;break;}}catch{}await wait(40);}assert(ready,'isolated API not ready');
  const origin=`http://127.0.0.1:${port}`;
  const login=await fetch(origin+'/api/auth/login',{method:'POST',headers:{origin,'content-type':'application/json'},body:JSON.stringify({email:actor.email,password})});
  assert.equal(login.status,201);await login.arrayBuffer();
  const cookie=login.headers.get('set-cookie').split(';')[0];
  const controller=new AbortController();
  const stream=await fetch(origin+'/api/events',{headers:{cookie},signal:controller.signal});assert.equal(stream.status,200);
  const reader=stream.body.getReader();await reader.read();
  try { const elapsed=await stop(api);stats.apiShutdownMs.push(elapsed);assert(elapsed<1500,'SSE held API beyond normal launcher grace'); } finally {controller.abort();await reader.cancel().catch(()=>{});}

 }
 console.log(JSON.stringify(stats));
}finally{
 for(const c of children){c.kill('SIGTERM');try{await bounded(c.ended,'cleanup',10000);}catch{c.kill('SIGKILL');await c.ended;console.error('ISOLATED_OWNED_CHILD_FORCED_CLEANUP');}}
 await producer.onModuleDestroy();await queue.obliterate({force:true});await events.close();await queue.close();await db.$disconnect();
}
