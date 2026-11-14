// Synthetic records and transport only; never requests a platform.
import {expect,vi} from 'vitest';
import {ReadFailure} from '@crm/domain/collection/contract';
export const window={version:1 as const,root_pages:3,reply_clicks:12,max_roots:40,max_comments:100,max_replies_per_root:30,timeout_ms:15000};
const exact=(value:number|boolean)=>({state:'EXACT',value});
export const sample=(n:number,more:boolean)=>({status:'OK',ready:{document:'complete',container:true},total:exact(8),hasMore:exact(more),cursor:more?'NONEMPTY':'EMPTY',list:'EXACT',loaded:{roots:n,replies:0,uniqueKnown:n,duplicateIds:0,missingIds:0,invalidNodes:0},groups:Array.from({length:n},(_,i)=>({ordinal:i+1,parent:null,depth:0,declared:exact(0),loaded:exact(0)})),findings:[]});
export const report=(w:number,n:number,more:boolean)=>({version:1,window:w,state:'PARTIAL',reason:more?'ROOT_PAGE_BUDGET':'BUTTON_NOT_FOUND',rootStop:more?'ROOT_PAGE_BUDGET':'ROOT_END',replyStop:'BUTTON_NOT_FOUND',rootActions:3,replyActions:1,actions:{replyClicks:0,rootScrolls:3,addedRoots:2,addedReplies:0},excludedRoots:0,elapsedMs:15000,initial:sample(n-2,true),final:sample(n,more),retained:sample(n,more)});
export const spec={name:'合成',platform:'XHS' as const,mode:'XHS_MCP' as const,keywords:['合成'],batchLimit:1,enabled:true};
export function fixture(fail=0,reusedToken=false){let calls=0;const call=vi.fn(async(name:string,args:Record<string,unknown>)=>{
 if(name==='check_login_status')return {content:[{type:'text',text:'✅ 已登录\n'}]};
 if(name==='search_feeds')return {content:[{type:'text',text:JSON.stringify({feeds:[{id:'synthetic',xsecToken:'SYNTHETIC_REFERENCE'}]})}]};
 calls++;if(calls===fail)throw new ReadFailure('MCP_PROTOCOL');
 const n=calls*2,more=calls<3;
 expect(args.read_continuation).toEqual(calls===1?{mode:'START'}:{mode:'RESUME',token:(calls-1).toString(16).padStart(64,'0')});
 return {content:[{type:'text',text:JSON.stringify({feed_id:'synthetic',data:{note:{noteId:'synthetic',title:'合成'},comments:{list:Array.from({length:n},(_,i)=>({id:'root'+i,content:'合成正文'+i,userInfo:{userId:'synthetic-user'},subComments:[]}))},boundedRead:report(calls,n,more),continuation:more?{state:'AVAILABLE',token:(reusedToken?1:calls).toString(16).padStart(64,'0')}:{state:'ENDED'}}})}]};
 });return {call,supportsBoundedComments:()=>true,supportsCommentContinuation:()=>true};}
