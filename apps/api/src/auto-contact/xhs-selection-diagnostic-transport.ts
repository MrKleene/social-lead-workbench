import {selectionEvidenceSchema} from './selection-evidence';
import {diagnosticSchema} from './xhs-reply-protocol';
import {preflightTargetSchema} from './xhs-preflight-transport';
import type {ReplyJournal} from './reply-stage-journal';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StreamableHTTPClientTransport} from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import {CallToolResultSchema} from '@modelcontextprotocol/sdk/types.js';
import {z} from 'zod';
import {endpointUrl} from '../collection/mcp/policy';
import type {OwnedReplyEndpoint} from './xhs-reply-transport';
export const XHS_SELECTION_DIAGNOSTIC_PROTOCOL='workbench.xhs.reply-selection-diagnostic.v1';
export const selectionTargetSchema=z.object(preflightTargetSchema.shape).extend({protocol:z.literal(XHS_SELECTION_DIAGNOSTIC_PROTOCOL),inspectionId:z.string().uuid(),maxReplySelections:z.literal(1),maxInputs:z.literal(0),maxSubmissions:z.literal(0)}).strict().refine(t=>t.postId===t.postReference.postId);
export type SelectionTarget=z.infer<typeof selectionTargetSchema>;
const traceSchema=z.object({before:selectionEvidenceSchema.optional(),scrolled:selectionEvidenceSchema.optional(),after:selectionEvidenceSchema.optional(),clickAttempted:z.boolean(),clickEvent:z.enum(['UNKNOWN','NOT_OBSERVED','SELECT_EVENT_EXACT','SELECT_EVENT_NONE','SELECT_EVENT_OTHER','SELECT_EVENT_MULTIPLE','SELECT_EVENT_UNAVAILABLE'])}).strict();
export const selectionResultSchema=z.object({protocol:z.literal(XHS_SELECTION_DIAGNOSTIC_PROTOCOL),inspectionId:z.string().uuid(),kind:z.enum(['STOPPED','RISK','SELECTED_EMPTY']),diagnostic:diagnosticSchema.extend({stage:z.enum(['VALIDATE','INSPECT','SELECT','CLOSE']),code:z.union([diagnosticSchema.shape.code,z.enum(['SELECTION_ALREADY_USED','POST_SELECTION_BINDING_EMPTY','SELECTED_WITHOUT_INPUT'])])}).strict(),trace:traceSchema,inputOperations:z.literal(0),submitOperations:z.literal(0),processStopped:z.boolean()}).strict();
export type SelectionResult=z.infer<typeof selectionResultSchema>;
export type SelectionOutcome={kind:'DIAGNOSTIC_RESULT';result:SelectionResult}|{kind:'UNAVAILABLE';reason:'INVALID_TARGET'|'DISABLED'|'PROTOCOL_UNAVAILABLE'|'STOP_UNCONFIRMED'|'JOURNAL_UNVERIFIED'};
export type SelectionInspectionOutcome=SelectionOutcome&{journal:ReplyJournal};
export function selectionJournalValid(j:ReplyJournal,o:SelectionOutcome):boolean{
 if(o.kind!=='DIAGNOSTIC_RESULT')return true;
 if(j.state!=='AVAILABLE'||!j.records.length||j.records.some(r=>r.attemptId!==o.result.inspectionId||['INPUT_INTENT','INPUT_FINISHED','BEFORE_SUBMIT','ATTEMPTED','AFTER_SUBMIT','SUBMIT_FINISHED','READBACK','RECEIPT_CAPTURE'].includes(r.stage)||r.attempted===true))return false;
 const intents=j.records.filter(r=>r.stage==='SELECT_CLICK_INTENT').length;
 if(intents>1||j.records.at(-1)?.stage!=='DRIVER_CLOSED'||j.records.at(-1)?.stopped!==true)return false;
 if(o.result.trace.clickAttempted&&intents!==1)return false;
 if(o.result.kind==='SELECTED_EMPTY'&&(intents!==1||j.records.filter(r=>r.stage==='SELECT_EVENT_EXACT').length!==1||!j.records.some(r=>r.stage==='SELECTION_STOPPED'&&r.selection?.binding==='MATCH'&&r.selection.editor==='EMPTY')))return false;
 return true;
}
/** Exclusive, one-shot selection-only client. No send command, body, ledger or retry. */
export class XhsSelectionDiagnosticTransport {
 private client=new Client({name:'crm-xhs-selection-diagnostic',version:'1.0.0'},{capabilities:{}});
 private wire:StreamableHTTPClientTransport;
 private lifetime=new AbortController();private operation?:AbortSignal;private allowed?:SelectionTarget;private used=false;private dispatched=false;private requests=0;private stopping?:Promise<boolean>;
 constructor(private owned:OwnedReplyEndpoint,private approval:{enabled?:boolean;reviewedSha256?:string}={}){
  const endpoint=endpointUrl(owned.url.href).href;if(!/^[a-f0-9]{64}$/.test(owned.token))throw Error('PREFLIGHT_AUTH_INVALID');
  this.wire=new StreamableHTTPClientTransport(new URL(endpoint),{requestInit:{redirect:'error',credentials:'omit'},reconnectionOptions:{maxRetries:0,initialReconnectionDelay:1000,maxReconnectionDelay:1000,reconnectionDelayGrowFactor:1},fetch:async(input,init)=>{
   if(String(input)!==endpoint||++this.requests>12)throw Error('PREFLIGHT_BOUNDARY');
   if(init?.method==='GET')return new Response(null,{status:405});
   if(!['POST','DELETE'].includes(init?.method??''))throw Error('PREFLIGHT_METHOD');
   const headers=new Headers(init?.headers);if(headers.has('cookie')||headers.has('authorization'))throw Error('PREFLIGHT_AUTH_OVERRIDE');headers.set('authorization',`Bearer ${owned.token}`);
   if(init?.method==='POST'){
    const rpc=JSON.parse(String(init.body));if(!['initialize','notifications/initialized','tools/list','tools/call','notifications/cancelled'].includes(rpc.method))throw Error('PREFLIGHT_RPC');
    if(rpc.method==='tools/call'&&(!this.allowed||rpc.params?.name!=='workbench_reply_selection_diagnostic'||JSON.stringify(rpc.params.arguments)!==JSON.stringify(this.allowed)))throw Error('PREFLIGHT_TOOL');
    if(rpc.method==='tools/call'){if(this.dispatched)throw Error('REPEAT_SELECTION_FORBIDDEN');this.dispatched=true;}
   }
   const signal=AbortSignal.any([this.lifetime.signal,this.operation??AbortSignal.timeout(3000),...(init?.signal?[init.signal]:[])]);
   const r=await fetch(endpoint,{...init,headers,signal,redirect:'error',credentials:'omit'});if(!r.ok)throw Error('PREFLIGHT_HTTP');
   let bytes=0;const body=r.body?.pipeThrough(new TransformStream<Uint8Array,Uint8Array>({transform(chunk,c){bytes+=chunk.byteLength;if(bytes>65536)throw Error('PREFLIGHT_SIZE');c.enqueue(chunk);}}));return new Response(body,{status:r.status,headers:r.headers});
  }});
 }
 async inspect(input:SelectionTarget,signal:AbortSignal):Promise<SelectionInspectionOutcome>{
  let outcome:SelectionOutcome={kind:'UNAVAILABLE',reason:'PROTOCOL_UNAVAILABLE'};
  const parsed=selectionTargetSchema.safeParse(input);
  if(this.used)return {...outcome,journal:{state:'MISSING',records:[]}};this.used=true;
  this.operation=AbortSignal.any([signal,AbortSignal.timeout(35000)]);const abort=()=>{void this.close();};this.operation.addEventListener('abort',abort,{once:true});
  try{
   if(!parsed.success||parsed.data.accountId!==this.owned.accountId)outcome={kind:'UNAVAILABLE',reason:'INVALID_TARGET'};
   else if(this.approval.enabled!==true||!/^[a-f0-9]{64}$/.test(this.approval.reviewedSha256??'')||this.approval.reviewedSha256!==this.owned.binarySha256)outcome={kind:'UNAVAILABLE',reason:'DISABLED'};
   else{
    if(this.operation.aborted)throw Error('CANCELLED');
    await this.client.connect(this.wire,{signal:this.operation,timeout:3000});
    if(this.client.getServerVersion()?.name!=='xiaohongshu-mcp')throw Error('PROFILE');
    const tools=await this.client.listTools({},{signal:this.operation,timeout:3000});
    // Dedicated runtime mode must expose exactly this one tool, never a legacy sender.
    if(tools.nextCursor||tools.tools.length!==1||tools.tools[0].name!=='workbench_reply_selection_diagnostic'||tools.tools[0].annotations?.readOnlyHint===true||tools.tools[0].annotations?.destructiveHint!==false||!tools.tools[0].description?.startsWith(XHS_SELECTION_DIAGNOSTIC_PROTOCOL+' '))throw Error('CAPABILITY');
    const schema=tools.tools[0].inputSchema;const props=schema.properties as Record<string,{const?:unknown}>|undefined;
    if(schema.additionalProperties!==false||!props||props.maxReplySelections?.const!==1||props.maxInputs?.const!==0||props.maxSubmissions?.const!==0||'content' in props)throw Error('UNBOUNDED_CAPABILITY');
    this.allowed=parsed.data;
    const raw=await this.client.callTool({name:'workbench_reply_selection_diagnostic',arguments:this.allowed},CallToolResultSchema,{signal:this.operation,timeout:30000});
    if(raw.isError)throw Error('RESULT');const r=selectionResultSchema.parse(raw.structuredContent);
    if(!r.processStopped)throw Error('STOP');
    if(r.inspectionId!==parsed.data.inspectionId)throw Error('CORRELATION');
    if(r.kind==='SELECTED_EMPTY'&&(r.diagnostic.code!=='SELECTED_WITHOUT_INPUT'||Object.values(r.diagnostic.checks).some(v=>v!=='MATCH')||!r.trace.clickAttempted||r.trace.clickEvent!=='SELECT_EVENT_EXACT'||r.trace.before?.binding!=='EMPTY'||r.trace.before.editor!=='EMPTY'||r.trace.scrolled?.centerHit!=='EXACT'||r.trace.after?.binding!=='MATCH'||r.trace.after.editor!=='EMPTY'||r.trace.after.replyUI!=='ACTIVE'))throw Error('FALSE_SELECTION');
    outcome={kind:'DIAGNOSTIC_RESULT',result:r};
   }
  }catch{/* Fixed enums only; never return token-bearing RPC/driver errors. */}
  finally{this.allowed=undefined;this.operation.removeEventListener('abort',abort);}
  const stopped=await this.close();
  const journal=stopped&&parsed.success&&this.owned.readJournal?await this.owned.readJournal(parsed.data.inspectionId).catch(()=>({state:'INVALID' as const,records:[]})):{state:'MISSING' as const,records:[]};
  if(!stopped)return {kind:'UNAVAILABLE',reason:'STOP_UNCONFIRMED',journal};
  if(!selectionJournalValid(journal,outcome))return {kind:'UNAVAILABLE',reason:'JOURNAL_UNVERIFIED',journal};
  return {...outcome,journal};
 }
 async close():Promise<boolean>{
  this.lifetime.abort();return this.stopping??=(async()=>{let timer:ReturnType<typeof setTimeout>|undefined;try{return await Promise.race([this.owned.stop(),new Promise<boolean>(ok=>{timer=setTimeout(()=>ok(false),2500);})]);}catch{return false;}finally{clearTimeout(timer);void this.client.close().catch(()=>{});}})();
 }
}
