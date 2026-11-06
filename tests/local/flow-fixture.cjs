const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),{randomUUID}=require('node:crypto');
const {LocalDatabase}=require('../../runtime/local/database.cjs');
const {LocalQueue}=require('../../runtime/local/queue.cjs');
const {LocalCollection}=require('../../runtime/local/collection.cjs');
const {LocalReview}=require('../../runtime/local/review.cjs');
function fixture(t){const dir=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'local-flow-test-')));let now=Date.UTC(2026,10,6,4);const store=new LocalDatabase(path.join(dir,'db.sqlite'),{clock:()=>now});t.after(()=>{store.close();fs.rmSync(dir,{recursive:true,force:true});});store.db.prepare("INSERT INTO accounts(id,platform,platform_user_id,name,session_ref,state,daily_limit) VALUES('account','XHS',?,'合成账号','fixture-session','VERIFIED',20)").run('a'.repeat(24));store.db.exec(`INSERT INTO configurations(id,kind,name,body,updated_at) VALUES('config','KEYWORDS','合成配置','{"keywords":["合成关键词"],"excludeWords":[]}',0);
 INSERT INTO review_policies VALUES('policy','合成匹配','寻找明确提出学习方法和选题指导需求的评论',1,1,1,1);
 INSERT INTO model_profile VALUES('qwen','qwen3.8-flash',1,1,10,'qwen3.8-flash:beijing-2026-10-21','beijing-original-comments-v2');`);return {store,queue:new LocalQueue(store),collection:new LocalCollection(store),review:new LocalReview(store),advance:ms=>now+=ms};}
function completeReport(comments){const roots=comments.filter(c=>!c.parentId).length,replies=comments.length-roots;
 const sample={status:'OK',ready:{document:'complete',container:true,rootEndVisible:true,rootScopeExact:true,replyControls:0},total:{state:'EXACT',value:comments.length},hasMore:{state:'EXACT',value:false},cursor:'EMPTY',list:'EXACT',loaded:{roots,replies,uniqueKnown:comments.length,duplicateIds:0,missingIds:0,invalidNodes:0},groups:comments.map((c,i)=>({ordinal:i+1,parent:c.parentId?comments.findIndex(p=>p.id===c.parentId)+1:null,depth:c.parentId?1:0,declared:{state:'EXACT',value:comments.filter(x=>x.parentId===c.id).length},loaded:{state:'EXACT',value:comments.filter(x=>x.parentId===c.id).length}})),findings:[]};
 return {version:1,state:'COMPLETE',reason:'DECLARED_TREE_EXHAUSTED',rootStop:'ROOT_END',replyStop:'DECLARED_REPLIES_LOADED',rootActions:0,replyActions:0,excludedRoots:0,elapsedMs:100,initial:sample,final:sample,retained:sample};}
function entry(postId='post-a',texts=['想请教学习方法和选题指导']){const comments=texts.map((text,i)=>({id:postId+'-comment-'+i,userId:'b'.repeat(24),nickname:'合成用户',text,hasReplies:false}));return {post:{id:postId,title:'合成学习讨论',body:'请根据评论原文判断明确的学习需求。',boundedRead:completeReport(comments)},comments};}
function collect(f,entries=[entry()],{status='COMPLETE',reason=null,batchLimit=entries.length,saved=false,finish=true,contactRules=[]}={}){
 const scope={configId:'config',configRevision:1,accountId:'account',accountRevision:1,readPlan:saved?{kind:'SAVED_POST',postId:entries[0].post.id,batchLimit:1}:{kind:'SEARCH',batchLimit},strictStages:{version:1,policies:[{id:'policy',revision:1,version:1,modelVersion:1}],contactRules}};
 const grant=f.queue.authorize('COLLECT',scope);f.queue.enqueue('COLLECT',scope,grant,randomUUID());const lease=f.queue.claim('fixture');f.queue.beginDispatch(lease);const runId=f.collection.start(lease);f.collection.checkpoint(lease,runId,entries);
 const coverage={version:1,search:reason==='SEARCH_PARTIAL'?'PARTIAL':'COMPLETE',reasons:reason?[reason]:[],posts:entries.map((e,i)=>({postRef:e.post.id,ordinal:i+1,saved:e.comments.length,roots:e.comments.filter(c=>!c.parentId).length,replies:e.comments.filter(c=>!!c.parentId).length,complete:true,boundedRead:e.post.boundedRead}))};
 if(finish){f.collection.finish(lease,runId,{status,reason,coverage});f.queue.finish(lease,'SUCCEEDED');}
 return {runId,lease,coverage,entries};
}
function reviewJob(f,runId,postId){const plan=f.review.plan(runId,postId,'policy'),grant=f.queue.authorize('REVIEW',plan.scope);f.queue.enqueue('REVIEW',plan.scope,grant,randomUUID());return {lease:f.queue.claim('fixture'),plan,grant};}
function output(command){return {items:command.payload.items.map(x=>({id:x.id,score:92,decision:'MATCH',reason:'评论原文明确表达需求',context:'SUFFICIENT',evidence:[{source:'COMMENT',quote:x.comment.slice(0,120)}]}))};}
function evaluate(f,runId,postId){const job=reviewJob(f,runId,postId),batchId=f.review.reserve(job.lease),command=f.review.dispatch(job.lease,batchId);return {...job,batchId,command,result:f.review.complete(job.lease,batchId,output(command))};}
module.exports={fixture,completeReport,entry,collect,reviewJob,output,evaluate};
