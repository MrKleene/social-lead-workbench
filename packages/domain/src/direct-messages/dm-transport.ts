import {watchJournalProgress} from '../auto-contact/live-journal-progress';
import type {LiveReporter} from '../common/journey-live';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StreamableHTTPClientTransport} from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import type {OwnedReplyEndpoint} from '../auto-contact/xhs-reply-transport';
import {DM_SEND_PROTOCOL,dmCommandSchema,parseDmExecution,type DmCommand,type DmExecution} from './dm-send-protocol';
/** One bounded MCP call. No reconnect/retry, hidden API, browser migration or endpoint supplied by HTTP client. */
export async function sendExactDm(owned:OwnedReplyEndpoint,expectedHash:string,command:DmCommand,beforeDispatch:()=>Promise<boolean>,signal:AbortSignal,live?:LiveReporter):Promise<DmExecution>{
 const c=dmCommandSchema.parse(command),endpoint=owned.url.href,u=new URL(endpoint);
 if(owned.binarySha256!==expectedHash||owned.accountId!==c.accountId||!/^[a-f0-9]{64}$/.test(owned.token)||u.hostname!=='127.0.0.1'||u.protocol!=='http:'||u.pathname!=='/mcp'||u.username||u.password||u.search||u.hash)throw Error('DM_OWNED_ENDPOINT_MISMATCH');
 let calls=0,requests=0;
 const client=new Client({name:'crm-exact-dm',version:'1'},{capabilities:{}});
 const transport=new StreamableHTTPClientTransport(u,{requestInit:{redirect:'error',credentials:'omit'},reconnectionOptions:{maxRetries:0,initialReconnectionDelay:1000,maxReconnectionDelay:1000,reconnectionDelayGrowFactor:1},fetch:async(url,init)=>{
  if(String(url)!==endpoint||++requests>12)throw Error('DM_TRANSPORT_BOUNDARY');if(init?.method==='GET')return new Response(null,{status:405});if(!['POST','DELETE'].includes(init?.method??''))throw Error('DM_TRANSPORT_METHOD');
  if(init?.method==='POST'){const rpc=JSON.parse(String(init.body));if(!['initialize','notifications/initialized','tools/list','tools/call','notifications/cancelled'].includes(rpc.method))throw Error('DM_RPC_BOUNDARY');if(rpc.method==='tools/call'){
   if(calls||rpc.params?.name!=='workbench_dm_exact'||JSON.stringify(rpc.params.arguments)!==JSON.stringify(c))throw Error('DM_ONE_CALL_ONLY');
   // Persist attempt/authority immediately before dispatch, even if HTTP outcome is lost.
   if(signal.aborted||!await beforeDispatch())throw Error('DM_AUTHORITY_CHANGED');calls++;
  }}
  const headers=new Headers(init?.headers);if(headers.has('cookie')||headers.has('authorization'))throw Error('DM_AUTH_OVERRIDE');headers.set('authorization','Bearer '+owned.token);
  const res=await fetch(endpoint,{...init,headers,credentials:'omit',redirect:'error',signal});if(!res.ok)throw Error('DM_HTTP');let bytes=0;
  return new Response(res.body?.pipeThrough(new TransformStream({transform(chunk,ctl){if((bytes+=chunk.byteLength)>32000)throw Error('DM_RESULT_SIZE');ctl.enqueue(chunk)}})),{status:res.status,headers:res.headers});
 }});
 const stopProgress=watchJournalProgress(owned,c.attemptId,live);
 try{
  await client.connect(transport);if(client.getServerVersion()?.name!=='xiaohongshu-mcp')throw Error('DM_SERVER_MISMATCH');
  const list=await client.listTools({});if(list.nextCursor||list.tools.length!==1||list.tools[0].name!=='workbench_dm_exact'||list.tools[0].annotations?.readOnlyHint===true||!list.tools[0].description?.startsWith(DM_SEND_PROTOCOL+' '))throw Error('DM_EXCLUSIVE_MODE_REQUIRED');
  const raw=await client.callTool({name:'workbench_dm_exact',arguments:c});if(raw.isError)throw Error('DM_TOOL_ERROR');return parseDmExecution(raw.structuredContent,c);
 }finally{await stopProgress();await client.close().catch(()=>{});}
}
