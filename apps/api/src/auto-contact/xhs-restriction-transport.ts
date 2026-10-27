import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StreamableHTTPClientTransport} from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import {CallToolResultSchema} from '@modelcontextprotocol/sdk/types.js';
import {z} from 'zod';
import {endpointUrl} from '../collection/mcp/policy';
import type {OwnedReplyEndpoint} from './xhs-reply-transport';
export const XHS_RESTRICTION_PROTOCOL='workbench.xhs.restriction-inspection.v1';
const id=z.string().regex(/^[a-f0-9]{24}$/);
export const restrictionTargetSchema=z.object({protocol:z.literal(XHS_RESTRICTION_PROTOCOL),accountId:z.string().regex(/^[A-Za-z0-9_-]{1,128}$/),senderId:id,postId:id,postReference:z.object({postId:id,token:z.string().min(1).max(4096).regex(/^[A-Za-z0-9_+\/=-]+$/),source:z.enum(['pc_feed','pc_search'])}).strict()}).strict().refine(t=>t.postId===t.postReference.postId);
export type RestrictionTarget=z.infer<typeof restrictionTargetSchema>;
const safeText=(max:number)=>z.string().max(max).refine(s=>!/(?:https?:\/\/|www\.)|[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}|[0-9]{7,}|[A-Za-z0-9_+/=-]{24,}/i.test(s));
const imageSchema=z.object({mimeType:z.literal('image/png'),data:z.string().max(2000000).regex(/^[A-Za-z0-9+/]+={0,2}$/),width:z.number().int().min(1).max(1280),height:z.number().int().min(1).max(900),scope:z.enum(['VISIBLE_WARNING','VIEWPORT'])}).strict().refine(s=>{const b=Buffer.from(s.data,'base64');return b.length<=1500000&&b.length>=24&&b.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))&&b.readUInt32BE(16)===s.width&&b.readUInt32BE(20)===s.height;});
export const restrictionResultSchema=z.object({
 protocol:z.literal(XHS_RESTRICTION_PROTOCOL),kind:z.enum(['UNAVAILABLE','RESTRICTION_VISIBLE','OBSERVED_NO_RESTRICTION','IDENTITY_MISMATCH','IDENTITY_UNVERIFIED']),code:z.enum(['INVALID_TARGET','CANCELLED','DRIVER_PANIC','DRIVER_ERROR','STOP_UNCONFIRMED','VISIBLE_NOTICE','NOT_A_SEND_PERMISSION_CHECK','ACCOUNT_MISMATCH','ACCOUNT_UNVERIFIED']),observedAt:z.string().datetime(),
 observation:z.object({identity:z.enum(['MATCH','MISMATCH','UNKNOWN']),identitySource:z.enum(['UNKNOWN','INITIAL_STATE_USER_INFO','SELF_PROFILE_LINK','STATE_AND_SELF_LINK']),title:safeText(160),pathname:z.enum(['/explore/[POST]','/explore','/login','/404','/[OTHER_ROUTE]','/[EXTERNAL_ORIGIN]']),warnings:z.array(z.object({code:z.enum(['BANNED','MUTED','VERIFICATION','RATE_LIMITED','COMMENT_RESTRICTED','REVIEW_PENDING','VISIBILITY_RESTRICTED','ACCESS_ERROR']),text:safeText(500)}).strict()).max(5),screenshot:imageSchema.optional(),screenshotState:z.enum(['UNKNOWN','CAPTURED','UNAVAILABLE','SENSITIVE_UI','IDENTITY_MISMATCH','EXTERNAL_ORIGIN','OVERSIZE','CANCELLED']),consoleErrors:z.number().int().min(0).max(32),networkFailures:z.number().int().min(0).max(32)}).strict(),processStopped:z.boolean(),writeOperations:z.literal(0),
}).strict();
export type RestrictionResult=z.infer<typeof restrictionResultSchema>;
export type RestrictionOutcome={kind:'READ_ONLY_RESULT';result:RestrictionResult;ownedStopped:boolean}|{kind:'UNAVAILABLE';reason:'INVALID_TARGET'|'DISABLED'|'PROTOCOL_UNAVAILABLE'|'STOP_UNCONFIRMED'};
/** Separate one-shot read client: only the restriction inspection tool can cross this boundary.
 * No content, authorization consumption, ledger, quota, sender or retry method. */
export class XhsRestrictionInspectionTransport {
 private client=new Client({name:'crm-xhs-restriction-inspection',version:'1.0.0'},{capabilities:{}});
 private wire:StreamableHTTPClientTransport;
 private lifetime=new AbortController();private operation?:AbortSignal;private allowed?:RestrictionTarget;private used=false;private requests=0;private stopping?:Promise<boolean>;
 constructor(private owned:OwnedReplyEndpoint,private approval:{enabled?:boolean;reviewedSha256?:string}={}){
  const endpoint=endpointUrl(owned.url.href).href;if(!/^[a-f0-9]{64}$/.test(owned.token))throw Error('INSPECTION_AUTH_INVALID');
  this.wire=new StreamableHTTPClientTransport(new URL(endpoint),{requestInit:{redirect:'error',credentials:'omit'},reconnectionOptions:{maxRetries:0,initialReconnectionDelay:1000,maxReconnectionDelay:1000,reconnectionDelayGrowFactor:1},fetch:async(input,init)=>{
   if(String(input)!==endpoint||++this.requests>12)throw Error('INSPECTION_BOUNDARY');
   if(init?.method==='GET')return new Response(null,{status:405});
   if(!['POST','DELETE'].includes(init?.method??''))throw Error('INSPECTION_METHOD');
   const headers=new Headers(init?.headers);if(headers.has('cookie')||headers.has('authorization'))throw Error('INSPECTION_AUTH_OVERRIDE');headers.set('authorization',`Bearer ${owned.token}`);
   if(init?.method==='POST'){
    const rpc=JSON.parse(String(init.body));if(!['initialize','notifications/initialized','tools/list','tools/call','notifications/cancelled'].includes(rpc.method))throw Error('INSPECTION_RPC');
    if(rpc.method==='tools/call'&&(!this.allowed||rpc.params?.name!=='workbench_account_restriction_inspect'||JSON.stringify(rpc.params.arguments)!==JSON.stringify(this.allowed)))throw Error('INSPECTION_TOOL');
   }
   const signal=AbortSignal.any([this.lifetime.signal,this.operation??AbortSignal.timeout(3000),...(init?.signal?[init.signal]:[])]);
   const r=await fetch(endpoint,{...init,headers,signal,redirect:'error',credentials:'omit'});if(!r.ok)throw Error('INSPECTION_HTTP');
   let bytes=0;const body=r.body?.pipeThrough(new TransformStream<Uint8Array,Uint8Array>({transform(chunk,c){bytes+=chunk.byteLength;if(bytes>2200000)throw Error('INSPECTION_SIZE');c.enqueue(chunk);}}));return new Response(body,{status:r.status,headers:r.headers});
  }});
 }
 async inspect(input:RestrictionTarget,signal:AbortSignal):Promise<RestrictionOutcome>{
  let outcome:RestrictionOutcome={kind:'UNAVAILABLE',reason:'PROTOCOL_UNAVAILABLE'};
  const parsed=restrictionTargetSchema.safeParse(input);
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
    if(tools.nextCursor||tools.tools.length!==1||tools.tools[0].name!=='workbench_account_restriction_inspect'||tools.tools[0].annotations?.readOnlyHint!==true||!tools.tools[0].description?.startsWith(XHS_RESTRICTION_PROTOCOL+' '))throw Error('CAPABILITY');
    this.allowed=parsed.data;
    const raw=await this.client.callTool({name:'workbench_account_restriction_inspect',arguments:this.allowed},CallToolResultSchema,{signal:this.operation,timeout:23000});
    if(raw.isError)throw Error('RESULT');const r=restrictionResultSchema.parse(raw.structuredContent);
    if(r.kind==='OBSERVED_NO_RESTRICTION'&&(r.observation.identity!=='MATCH'||r.observation.warnings.length))throw Error('FALSE_MATCH');
    if(r.observation.identity==='MISMATCH'&&(r.kind!=='IDENTITY_MISMATCH'||r.observation.screenshot))throw Error('ACCOUNT_MISMATCH');
    if(r.kind==='RESTRICTION_VISIBLE'&&!r.observation.warnings.length)throw Error('NOTICE_MISSING');
    if(r.observation.pathname==='/[EXTERNAL_ORIGIN]'&&r.observation.screenshot)throw Error('EXTERNAL_SCREENSHOT');
    if((r.observation.screenshotState==='CAPTURED')!==!!r.observation.screenshot)throw Error('SCREENSHOT_MISMATCH');
    outcome={kind:'READ_ONLY_RESULT',result:r,ownedStopped:false};
   }
  }catch{/* Fixed enums only; never return token-bearing RPC/driver errors. */}
  finally{this.allowed=undefined;this.operation.removeEventListener('abort',abort);}
  const stopped=await this.close();if(outcome.kind==='READ_ONLY_RESULT')return {...outcome,ownedStopped:stopped};if(!stopped)return {kind:'UNAVAILABLE',reason:'STOP_UNCONFIRMED'};return outcome;
 }
 async close():Promise<boolean>{
  this.lifetime.abort();return this.stopping??=(async()=>{let timer:ReturnType<typeof setTimeout>|undefined;try{return await Promise.race([this.owned.stop(),new Promise<boolean>(ok=>{timer=setTimeout(()=>ok(false),2500);})]);}catch{return false;}finally{clearTimeout(timer);void this.client.close().catch(()=>{});}})();
 }
}
