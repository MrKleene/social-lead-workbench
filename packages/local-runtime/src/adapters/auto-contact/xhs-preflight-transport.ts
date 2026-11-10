import {selectionEvidenceSchema} from '@crm/domain/auto-contact/selection-evidence';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StreamableHTTPClientTransport} from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import {CallToolResultSchema} from '@modelcontextprotocol/sdk/types.js';
import {z} from 'zod';
import {endpointUrl} from '../collection/mcp/policy';
import type {OwnedReplyEndpoint} from './xhs-reply-transport';
export const XHS_PREFLIGHT_PROTOCOL='workbench.xhs.exact-preflight.v2';
const id=z.string().regex(/^[a-f0-9]{24}$/);
export const preflightTargetSchema=z.object({protocol:z.literal(XHS_PREFLIGHT_PROTOCOL),accountId:z.string().regex(/^[A-Za-z0-9_-]{1,128}$/),senderId:id,postId:id,targetCommentId:id,recipientId:id,postReference:z.object({postId:id,token:z.string().min(1).max(4096).regex(/^[A-Za-z0-9_+\/=-]+$/),source:z.enum(['pc_feed','pc_search'])}).strict()}).strict().refine(t=>t.postId===t.postReference.postId);
export type PreflightTarget=z.infer<typeof preflightTargetSchema>;
const check=z.enum(['MATCH','MISMATCH','UNKNOWN']);
const shape=z.enum(['UNKNOWN','MISSING','PLAIN','VALUE_REF','RAW_VALUE_REF','UNSUPPORTED_REF','INVALID']);
const pageSchema=z.object({navigation:z.enum(['UNKNOWN','EXACT_POST','OTHER_POST','OTHER_ROUTE','EXTERNAL_ORIGIN']),token:z.enum(['UNKNOWN','MATCH','MISSING','MISMATCH','AMBIGUOUS']),source:z.enum(['UNKNOWN','MATCH','MISSING','MISMATCH','AMBIGUOUS']),document:z.enum(['UNKNOWN','loading','interactive','complete']),root:shape,note:shape,map:shape,entry:shape,wait:z.enum(['UNKNOWN','NOT_NEEDED','BECAME_READY','EXHAUSTED','ABORTED','BLOCKED']),samples:z.number().int().min(0).max(12)}).strict();
const resultSchema=z.object({
 protocol:z.literal(XHS_PREFLIGHT_PROTOCOL),kind:z.enum(['UNAVAILABLE','RISK','MISMATCH','DOM_UNAVAILABLE','MATCHED_READ_ONLY']),
 diagnostic:z.object({stage:z.enum(['VALIDATE','INSPECT','CLOSE']),code:z.enum(['PREFLIGHT_NAVIGATION_UNVERIFIED','PREFLIGHT_REFERENCE_UNVERIFIED','INVALID_COMMAND','CANCELLED','DRIVER_PANIC','DRIVER_ERROR','STOP_UNCONFIRMED','STATE_UNAVAILABLE','STATE_INVALID','STATE_USER_MISSING','STATE_POST_MISSING','STATE_POST_MISMATCH','STATE_COMMENTS_MISSING','DEPTH_LIMIT','ROW_LIMIT','POST_MISMATCH','EXACT_TARGET_MISSING_OR_AMBIGUOUS','TARGET_MISMATCH','DOM_LOCATOR_UNVERIFIED','READ_ONLY_MATCH','RATE_LIMITED','VERIFICATION','BANNED','PLATFORM_REFUSED']),checks:z.object({post:check,sender:check,target:check,author:check}).strict()}).strict(),
 selection:selectionEvidenceSchema.optional(),
 dom:z.object({target:z.enum(['UNKNOWN','MISSING','UNIQUE','AMBIGUOUS']),author:z.enum(['UNKNOWN','MISSING','MATCH','MISMATCH','AMBIGUOUS']),replyButton:z.enum(['UNKNOWN','MISSING','EXACT','MISMATCH','AMBIGUOUS']),composer:z.enum(['UNKNOWN','ABSENT','EMPTY','NONEMPTY','AMBIGUOUS'])}).strict(),
 sources:z.object({identity:z.enum(['UNKNOWN','UNOBSERVED','INITIAL_STATE_USER_INFO']),target:z.enum(['UNKNOWN','UNOBSERVED','INITIAL_STATE_NOTE_COMMENTS']),dom:z.enum(['UNKNOWN','UNOBSERVED','EXACT_COMMENT_ID_AND_SCOPED_DESCENDANTS'])}).strict(),processStopped:z.boolean(),writeOperations:z.literal(0),page:pageSchema,
}).strict();
export type PreflightResult=z.infer<typeof resultSchema>;
export type PreflightOutcome={kind:'READ_ONLY_RESULT';result:PreflightResult}|{kind:'UNAVAILABLE';reason:'INVALID_TARGET'|'DISABLED'|'PROTOCOL_UNAVAILABLE'|'STOP_UNCONFIRMED'};
/** Separate one-shot read client: only the new preflight tool can cross this boundary.
 * No content, authorization consumption, ledger, quota, sender or retry method. */
export class XhsExactPreflightTransport {
 private client=new Client({name:'crm-xhs-read-only-preflight',version:'1.0.0'},{capabilities:{}});
 private wire:StreamableHTTPClientTransport;
 private lifetime=new AbortController();private operation?:AbortSignal;private allowed?:PreflightTarget;private used=false;private requests=0;private stopping?:Promise<boolean>;
 constructor(private owned:OwnedReplyEndpoint,private approval:{enabled?:boolean;reviewedSha256?:string}={}){
  const endpoint=endpointUrl(owned.url.href).href;if(!/^[a-f0-9]{64}$/.test(owned.token))throw Error('PREFLIGHT_AUTH_INVALID');
  this.wire=new StreamableHTTPClientTransport(new URL(endpoint),{requestInit:{redirect:'error',credentials:'omit'},reconnectionOptions:{maxRetries:0,initialReconnectionDelay:1000,maxReconnectionDelay:1000,reconnectionDelayGrowFactor:1},fetch:async(input,init)=>{
   if(String(input)!==endpoint||++this.requests>12)throw Error('PREFLIGHT_BOUNDARY');
   if(init?.method==='GET')return new Response(null,{status:405});
   if(!['POST','DELETE'].includes(init?.method??''))throw Error('PREFLIGHT_METHOD');
   const headers=new Headers(init?.headers);if(headers.has('cookie')||headers.has('authorization'))throw Error('PREFLIGHT_AUTH_OVERRIDE');headers.set('authorization',`Bearer ${owned.token}`);
   if(init?.method==='POST'){
    const rpc=JSON.parse(String(init.body));if(!['initialize','notifications/initialized','tools/list','tools/call','notifications/cancelled'].includes(rpc.method))throw Error('PREFLIGHT_RPC');
    if(rpc.method==='tools/call'&&(!this.allowed||rpc.params?.name!=='workbench_reply_preflight'||JSON.stringify(rpc.params.arguments)!==JSON.stringify(this.allowed)))throw Error('PREFLIGHT_TOOL');
   }
   const signal=AbortSignal.any([this.lifetime.signal,this.operation??AbortSignal.timeout(3000),...(init?.signal?[init.signal]:[])]);
   const r=await fetch(endpoint,{...init,headers,signal,redirect:'error',credentials:'omit'});if(!r.ok)throw Error('PREFLIGHT_HTTP');
   let bytes=0;const body=r.body?.pipeThrough(new TransformStream<Uint8Array,Uint8Array>({transform(chunk,c){bytes+=chunk.byteLength;if(bytes>65536)throw Error('PREFLIGHT_SIZE');c.enqueue(chunk);}}));return new Response(body,{status:r.status,headers:r.headers});
  }});
 }
 async inspect(input:PreflightTarget,signal:AbortSignal):Promise<PreflightOutcome>{
  let outcome:PreflightOutcome={kind:'UNAVAILABLE',reason:'PROTOCOL_UNAVAILABLE'};
  const parsed=preflightTargetSchema.safeParse(input);
  if(this.used)return outcome;this.used=true;
  this.operation=AbortSignal.any([signal,AbortSignal.timeout(25000)]);const abort=()=>{void this.close();};this.operation.addEventListener('abort',abort,{once:true});
  try{
   if(!parsed.success||parsed.data.accountId!==this.owned.accountId)outcome={kind:'UNAVAILABLE',reason:'INVALID_TARGET'};
   else if(this.approval.enabled!==true||!/^[a-f0-9]{64}$/.test(this.approval.reviewedSha256??'')||this.approval.reviewedSha256!==this.owned.binarySha256)outcome={kind:'UNAVAILABLE',reason:'DISABLED'};
   else{
    if(this.operation.aborted)throw Error('CANCELLED');
    await this.client.connect(this.wire,{signal:this.operation,timeout:3000});
    if(this.client.getServerVersion()?.name!=='xiaohongshu-mcp')throw Error('PROFILE');
    const tools=await this.client.listTools({},{signal:this.operation,timeout:3000});
    // Dedicated runtime mode must expose exactly this one tool, never a legacy sender.
    if(tools.nextCursor||tools.tools.length!==1||tools.tools[0].name!=='workbench_reply_preflight'||tools.tools[0].annotations?.readOnlyHint!==true||!tools.tools[0].description?.startsWith(XHS_PREFLIGHT_PROTOCOL+' '))throw Error('CAPABILITY');
    this.allowed=parsed.data;
    const raw=await this.client.callTool({name:'workbench_reply_preflight',arguments:this.allowed},CallToolResultSchema,{signal:this.operation,timeout:23000});
    if(raw.isError)throw Error('RESULT');const r=resultSchema.parse(raw.structuredContent);
    if(!r.processStopped)throw Error('STOP');
    if(r.kind==='MATCHED_READ_ONLY'&&(r.page.navigation!=='EXACT_POST'||r.page.token!=='MATCH'||r.page.source!=='MATCH'||r.page.samples<1||!['NOT_NEEDED','BECAME_READY'].includes(r.page.wait)||r.diagnostic.code!=='READ_ONLY_MATCH'||Object.values(r.diagnostic.checks).some(v=>v!=='MATCH')||r.dom.target!=='UNIQUE'||r.dom.author!=='MATCH'||r.dom.replyButton!=='EXACT'||r.sources.identity!=='INITIAL_STATE_USER_INFO'||r.sources.target!=='INITIAL_STATE_NOTE_COMMENTS'||r.sources.dom!=='EXACT_COMMENT_ID_AND_SCOPED_DESCENDANTS'))throw Error('FALSE_MATCH');
    outcome={kind:'READ_ONLY_RESULT',result:r};
   }
  }catch{/* Fixed enums only; never return token-bearing RPC/driver errors. */}
  finally{this.allowed=undefined;this.operation.removeEventListener('abort',abort);}
  if(!await this.close())return {kind:'UNAVAILABLE',reason:'STOP_UNCONFIRMED'};return outcome;
 }
 async close():Promise<boolean>{
  this.lifetime.abort();return this.stopping??=(async()=>{let timer:ReturnType<typeof setTimeout>|undefined;try{return await Promise.race([this.owned.stop(),new Promise<boolean>(ok=>{timer=setTimeout(()=>ok(false),2500);})]);}catch{return false;}finally{clearTimeout(timer);void this.client.close().catch(()=>{});}})();
 }
}
