import {describe,it,expect,vi} from 'vitest';
import {commentCheckpointSchema,type CommentCheckpoint} from '@crm/contracts';
import {checkpointHash,commentDigest,validateChunk} from '../src/collection/comment-checkpoint';
import {XhsMcpAdapter} from '../src/collection/adapters/xhs-mcp';
import {collect} from '../src/collection/collector';
import {ReadFailure,limits,type Comment} from '../src/collection/contract';
import {window,spec,report,sample} from './fixtures/comment-continuation';
const row=(i:number,parentId?:string):Comment=>({id:`r${i}`,userId:'synthetic',nickname:'合成',text:`合成<&>😀${i}`,parentId,hasReplies:false});
const empty=():CommentCheckpoint=>({version:1,sequence:0,marks:[]});
function packet(previous:CommentCheckpoint,comments:Comment[]){const checkpoint={version:1 as const,sequence:previous.sequence+(comments.length?1:0),marks:[...previous.marks,...comments.map(c=>({id:c.id,parent:c.parentId||'',digest:commentDigest('synthetic',c)}))]};return {checkpoint,hash:checkpointHash(checkpoint),replaying:false,remainingAnchors:0};}
function transport(total=125,initial=empty(),fail=0){let n=initial.marks.length,cp=initial,calls=0;return {supportsBoundedComments:()=>true,supportsCommentChunks:()=>true,call:vi.fn(async(name:string,args:any)=>{
 if(name==='check_login_status')return {content:[{type:'text',text:'✅ 已登录\n'}]};if(name==='search_feeds')return {content:[{type:'text',text:JSON.stringify({feeds:[{id:'synthetic',xsecToken:'SYNTHETIC'}]})}]};
 if(args.read_chunks.mode==='FINISH')return {content:[{type:'text',text:JSON.stringify({feed_id:'synthetic',data:{chunkAck:true}})}]};
 calls++;if(calls===fail)throw new ReadFailure('MCP_PROTOCOL');
 if(calls===1){expect(args.read_chunks.mode).toBe('START');if(initial.marks.length)expect(args.read_chunks.checkpoint).toEqual(initial);}else expect(args.read_chunks).toEqual({mode:'RESUME',token:(calls-1).toString(16).padStart(64,'0'),ack:checkpointHash(cp)});
 const comments=Array.from({length:Math.min(40,total-n)},(_,i)=>row(n+i));n+=comments.length;const receipt=packet(cp,comments);cp=receipt.checkpoint;
 return {content:[{type:'text',text:JSON.stringify({feed_id:'synthetic',data:{note:{noteId:'synthetic',title:'合成'},comments:{list:[]},boundedRead:{...report(calls,Math.min(n,180),n<total),actions:{replyClicks:0,rootScrolls:1,addedRoots:comments.length,addedReplies:0}},chunk:{version:1,...receipt,rows:comments.map(c=>({parent:'',comment:{id:c.id,content:c.text,userInfo:{userId:c.userId,nickname:c.nickname},subComments:[]}})),canContinue:n<total,token:calls.toString(16).padStart(64,'0')}}})}]};
 })};}
describe('transaction acknowledged chunks / synthetic source only',()=>{
 it('collects 125 unique comments in bounded chunks and acknowledges only after durable callback',async()=>{
 const t=transport(),a=new XhsMcpAdapter(t,true,'XHS_MCP',window);let saved=empty();let commits=0;
 const result=await collect(a,spec,async()=>false,{...limits,comments:800,runMs:10000},async r=>{const e=r.posts[0];if(e.chunk){if(e.chunk.hash!==checkpointHash(saved)){saved=validateChunk(saved,e.chunk,e.post.id,e.chunkComments||[]);commits++;}}});
 expect(result.status,JSON.stringify(result)).not.toBe('FAILED');expect(result.posts[0].comments).toHaveLength(125);expect(saved.marks).toHaveLength(125);expect(commits).toBe(4);expect(result.posts[0].post.boundedReadWindows).toHaveLength(4);
 });
 it('rollback sends no ACK or next request and retains previously committed chunk',async()=>{
 const t=transport(),a=new XhsMcpAdapter(t,true,'XHS_MCP',window);let saved=empty();
 const result=await collect(a,spec,async()=>false,{...limits,comments:800},async r=>{const e=r.posts[0];if(e.chunk?.checkpoint.sequence===2)throw new ReadFailure('INVALID_DATA');if(e.chunk)saved=e.chunk.checkpoint;});
 expect(result.status).toBe('FAILED');expect(saved.marks).toHaveLength(40);expect(t.call.mock.calls.filter(c=>c[0]==='get_feed_detail')).toHaveLength(2);
 });
 it('process restart supplies durable IDs; replayed prefix does not consume 100 new-comment budget',async()=>{
 const prior=packet(empty(),Array.from({length:100},(_,i)=>row(i))).checkpoint,t=transport(225,prior),a=new XhsMcpAdapter(t,true,'XHS_MCP',window);let saved=prior;
 const result=await collect(a,spec,async()=>false,{...limits,comments:800},async r=>{const e=r.posts[0];if(e.chunk){if(e.chunk.hash!==checkpointHash(saved))saved=validateChunk(saved,e.chunk,e.post.id,e.chunkComments||[]);}},undefined,async p=>a.restoreCheckpoint(p,prior));
 expect(result.status,JSON.stringify(result)).not.toBe('FAILED');expect(result.posts[0].comments).toHaveLength(125);expect(saved.marks).toHaveLength(225);
 });
 it('rejects metadata tampering, missing parents, swapped IDs and extra fields',()=>{
 const comments=[row(0),row(1,'r0')],p=packet(empty(),comments);expect(validateChunk(empty(),p,'synthetic',[comments[1],comments[0]])).toEqual(p.checkpoint);
 expect(()=>validateChunk(empty(),p,'different',comments)).toThrow();expect(()=>validateChunk(empty(),p,'synthetic',[comments[0],comments[0]])).toThrow();
 expect(commentCheckpointSchema.safeParse({...p.checkpoint,token:'SYNTHETIC_SECRET'}).success).toBe(false);expect(commentCheckpointSchema.safeParse({...p.checkpoint,marks:[p.checkpoint.marks[1]]}).success).toBe(false);
 expect(JSON.stringify(p)).not.toMatch(/合成|SYNTHETIC_SECRET|nickname|userId/);
 });
 it('never blindly retries an uncertain chunk request',async()=>{const t=transport(125,empty(),2),a=new XhsMcpAdapter(t,true,'XHS_MCP',window);const r=await collect(a,spec,async()=>false,{...limits,comments:800},async()=>{});expect(r.reason).toBe('MCP_PROTOCOL');expect(t.call.mock.calls.filter(c=>c[0]==='get_feed_detail')).toHaveLength(2);});
});

it('accepts the actual Go serialized synthetic packet, including its checkpoint hash',async()=>{
 const {readFileSync}=await import('node:fs'),{resolve}=await import('node:path'),wire=JSON.parse(readFileSync(resolve(__dirname,'./fixtures/comment-chunk-wire.json'),'utf8'));
 const t={supportsBoundedComments:()=>true,supportsCommentChunks:()=>true,call:vi.fn(async(name:string)=>({content:[{type:'text',text:JSON.stringify(name==='search_feeds'?{feeds:[{id:'note',xsecToken:'SYNTHETIC'}]}:wire)}]}))};
 const a=new XhsMcpAdapter(t,true,'XHS_MCP',window);const found=await a.search('合成',undefined,new AbortController().signal);const post=await a.post(found.items[0],new AbortController().signal);
 expect(a.receivedComments(post)).toHaveLength(5);expect(a.chunkReceipt(post)?.checkpoint.marks).toHaveLength(5);
});

// Synthetic exact upstream target shape; separate enclosing discussion and direct reply.
it('carries targetComment through the Go-shaped wire without changing checkpoint identity',async()=>{
 const {readFileSync}=await import('node:fs'),{resolve}=await import('node:path'),wire=JSON.parse(readFileSync(resolve(__dirname,'./fixtures/comment-chunk-wire.json'),'utf8'));
 const reply=wire.data.chunk.rows.find((r:any)=>r.parent),root=wire.data.chunk.rows.find((r:any)=>!r.parent);
 reply.comment.targetComment={id:root.comment.id,userInfo:{userId:root.comment.userInfo.userId,nickname:'DO_NOT_COPY'},url:'SECRET_VALUE'};
 const t={supportsBoundedComments:()=>true,supportsCommentChunks:()=>true,call:vi.fn(async(name:string)=>({content:[{type:'text',text:JSON.stringify(name==='search_feeds'?{feeds:[{id:'note',xsecToken:'SYNTHETIC'}]}:wire)}]}))};
 const a=new XhsMcpAdapter(t,true,'XHS_MCP',window),signal=new AbortController().signal;
 const found=await a.search('合成',undefined,signal),post=await a.post(found.items[0],signal),comments=a.receivedComments(post),c=comments.find(c=>c.id===reply.comment.id)!;
 expect(c.parentId).toBe(reply.parent);expect(c.replyTarget).toEqual({source:'targetComment',commentId:root.comment.id,userId:root.comment.userInfo.userId});
 expect(JSON.stringify(comments)).not.toMatch(/SECRET_VALUE|DO_NOT_COPY/);
 const {replyTarget,...core}=c;expect(commentDigest('note',c)).toBe(commentDigest('note',core));
 const {semanticSnapshot,snapshotHash}=await import('../src/collection/semantic-evaluator');expect(snapshotHash(semanticSnapshot(post,c,undefined,false,false))).toBe(snapshotHash(semanticSnapshot(post,core,undefined,false,false)));
 expect(semanticSnapshot(post,c,undefined,false,false)).not.toHaveProperty('replyTarget');
});
it('rejects unknown target shapes without losing content, retains missing metadata and flags conflicts',async()=>{
 const {sourceReplyTarget,mergeReplyTarget}=await import('@crm/contracts');
 for(const value of [null,[],{},'bad',{id:42},{id:'self'},{id:'https://invalid'},{commentId:'other'},{ID:'other'}])expect(sourceReplyTarget(value,'self')).toBeUndefined();
 const target=sourceReplyTarget({id:'other',userInfo:{userId:'target-user',nickname:'PRIVATE'},url:'SECRET'},'self')!;
 expect(mergeReplyTarget({},target)).toEqual({replyTarget:target});expect(mergeReplyTarget({replyTarget:target},undefined)).toEqual({replyTarget:target});
 expect(mergeReplyTarget({replyTarget:target},{...target,commentId:'changed'})).toEqual({replyTarget:target,replyTargetConflict:true});
 expect(mergeReplyTarget({replyTarget:target},{...target,userId:'changed'})).toEqual({replyTarget:target,replyTargetConflict:true});
 expect(sourceReplyTarget({id:'other',userInfo:{userId:42}},'self')).toEqual({source:'targetComment',commentId:'other'});
});
it('marks conflicting source targets within one window without changing the discussion or duplicating content',async()=>{
 const entry=(target:string)=>({id:'child',content:'synthetic',userInfo:{userId:'author'},subComments:[],targetComment:{id:target}});
 const t={call:vi.fn(async(name:string)=>({content:[{type:'text',text:JSON.stringify(name==='search_feeds'?{feeds:[{id:'note',xsecToken:'SYNTHETIC'}]}:{feed_id:'note',data:{note:{noteId:'note',title:''},comments:{list:[{id:'root',content:'synthetic',userInfo:{userId:'root-user'},subComments:[entry('target-a'),entry('target-b')]}]}}})}]}))};
 const a=new XhsMcpAdapter(t,true,'XHS_MCP'),signal=new AbortController().signal,found=await a.search('synthetic',undefined,signal),post=await a.post(found.items[0],signal);
 const comments=a.receivedComments(post);expect(comments).toHaveLength(2);expect(comments.find(c=>c.id==='child')).toMatchObject({parentId:'root',replyTarget:{source:'targetComment',commentId:'target-a'},replyTargetConflict:true});
});
it('normal cancellation after durable first chunk does not send another read; default resume keeps every confirmed ID',async()=>{
 let saved=empty(),cancelled=false;const first=transport(125),a=new XhsMcpAdapter(first,true,'XHS_MCP',window);
 const stopped=await collect(a,spec,async()=>cancelled,{...limits,comments:800},async result=>{const e=result.posts[0];if(e.chunk&&e.chunk.hash!==checkpointHash(saved)){saved=validateChunk(saved,e.chunk,e.post.id,e.chunkComments||[]);cancelled=true;}});
 expect(stopped.status).toBe('PAUSED');expect(saved.marks).toHaveLength(40);expect(first.call.mock.calls.filter(c=>c[0]==='get_feed_detail')).toHaveLength(1);
 const resumed=transport(125,saved),b=new XhsMcpAdapter(resumed,true,'XHS_MCP',window);const ids=new Set(saved.marks.map(m=>m.id));
 const result=await collect(b,spec,async()=>false,{...limits,comments:800},async result=>{const e=result.posts[0];if(e.chunk&&e.chunk.hash!==checkpointHash(saved)){saved=validateChunk(saved,e.chunk,e.post.id,e.chunkComments||[]);for(const c of e.chunkComments||[]){expect(ids.has(c.id)).toBe(false);ids.add(c.id);}}},undefined,async p=>b.restoreCheckpoint(p,saved));
 expect(result.status).not.toBe('FAILED');expect(result.posts[0].comments).toHaveLength(85);expect(saved.marks).toHaveLength(125);expect(ids.size).toBe(125);
});

it('accepts new Go root-scope evidence without changing leaf metadata or direct reply targets',async()=>{
 const {readFileSync}=await import('node:fs'),{resolve}=await import('node:path'),wire=JSON.parse(readFileSync(resolve(__dirname,'./fixtures/root-scope-wire.json'),'utf8'));
 const t={supportsBoundedComments:()=>true,supportsCommentChunks:()=>true,call:vi.fn(async(name:string)=>({content:[{type:'text',text:JSON.stringify(name==='search_feeds'?{feeds:[{id:'synthetic-post',xsecToken:'SYNTHETIC'}]}:wire)}]}))};
 const a=new XhsMcpAdapter(t,true,'XHS_MCP',window),signal=new AbortController().signal,found=await a.search('synthetic',undefined,signal),post=await a.post(found.items[0],signal);
 expect(post.boundedRead?.state).toBe('COMPLETE');expect(post.boundedRead?.chunkSummary?.rootScopedLeafGroups).toBe(3);expect(post.boundedRead?.retained.groups[1].declared.state).toBe('MISSING');expect(a.receivedComments(post)).toHaveLength(6);expect(a.chunkReceipt(post)?.checkpoint.marks).toHaveLength(6);
});
