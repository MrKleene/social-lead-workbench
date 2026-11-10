import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StreamableHTTPClientTransport} from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import {randomUUID} from 'node:crypto';
import {z} from 'zod';
import type {OwnedReplyEndpoint} from '../auto-contact/xhs-reply-transport';
import {validDmMessageId,type DmCommand} from '@crm/domain/direct-messages/dm-send-protocol';
/** Opens only the already attempted exact recipient; no send-capable tool is registered. */
export const DM_OBSERVE_PROTOCOL='workbench.xhs.dm-conversation-inspection.v1';
export function parseExistingDm(raw:unknown,c:DmCommand){
 const r=z.object({protocol:z.literal(DM_OBSERVE_PROTOCOL),code:z.literal('CONVERSATION_OBSERVED_NOT_SEND_READY'),stopped:z.literal(true),inputs:z.literal(0),submissions:z.literal(0),openInvocations:z.literal(1),observedAt:z.string().datetime(),observation:z.object({identity:z.literal('MATCH'),route:z.literal('CHAT'),risk:z.literal(false),loginChallenge:z.literal(false),boundRecipient:z.literal(true),conversationKind:z.literal('c2c'),loading:z.literal(false),headerPresent:z.literal(true),messages:z.array(z.object({id:z.string().max(120),contentSha256:z.string().regex(/^[a-f0-9]{64}$/),failed:z.boolean(),pending:z.boolean()})).max(5)})}).parse(raw);
 const matching=r.observation.messages.filter(m=>m.contentSha256===c.contentSha256);if(matching.length!==1||matching[0].failed||matching[0].pending||!validDmMessageId(matching[0].id,c.senderId,c.recipientId))throw Error('DM_READBACK_UNVERIFIED');
 return {messageId:matching[0].id,senderId:c.senderId,recipientId:c.recipientId,contentSha256:c.contentSha256,observedAt:r.observedAt};
}
export async function inspectExistingDm(owned:OwnedReplyEndpoint,expectedHash:string,command:DmCommand,signal:AbortSignal){
 const c=command,inspectionId=randomUUID(),input={protocol:DM_OBSERVE_PROTOCOL,inspectionId,accountId:c.accountId,senderId:c.senderId,recipientId:c.recipientId,maxOpenings:1,maxInputs:0,maxSubmissions:0},endpoint=owned.url.href,u=new URL(endpoint);
 if(owned.binarySha256!==expectedHash||owned.accountId!==c.accountId||!/^[a-f0-9]{64}$/.test(owned.token)||u.hostname!=='127.0.0.1'||u.protocol!=='http:'||u.pathname!=='/mcp'||u.username||u.password||u.search||u.hash)throw Error('DM_OWNED_ENDPOINT_MISMATCH');
 let calls=0,requests=0;
 const client=new Client({name:'crm-exact-dm',version:'1'},{capabilities:{}});
 const transport=new StreamableHTTPClientTransport(u,{requestInit:{redirect:'error',credentials:'omit'},reconnectionOptions:{maxRetries:0,initialReconnectionDelay:1000,maxReconnectionDelay:1000,reconnectionDelayGrowFactor:1},fetch:async(url,init)=>{
  if(String(url)!==endpoint||++requests>12)throw Error('DM_TRANSPORT_BOUNDARY');if(init?.method==='GET')return new Response(null,{status:405});if(!['POST','DELETE'].includes(init?.method??''))throw Error('DM_TRANSPORT_METHOD');
  if(init?.method==='POST'){const rpc=JSON.parse(String(init.body));if(!['initialize','notifications/initialized','tools/list','tools/call','notifications/cancelled'].includes(rpc.method))throw Error('DM_RPC_BOUNDARY');if(rpc.method==='tools/call'){
   if(calls||rpc.params?.name!=='workbench_dm_conversation_inspect'||JSON.stringify(rpc.params.arguments)!==JSON.stringify(input))throw Error('DM_ONE_CALL_ONLY');
   // Persist attempt/authority immediately before dispatch, even if HTTP outcome is lost.
   if(signal.aborted)throw Error('DM_CANCELLED');calls++;
  }}
  const headers=new Headers(init?.headers);if(headers.has('cookie')||headers.has('authorization'))throw Error('DM_AUTH_OVERRIDE');headers.set('authorization','Bearer '+owned.token);
  const res=await fetch(endpoint,{...init,headers,credentials:'omit',redirect:'error',signal});if(!res.ok)throw Error('DM_HTTP');let bytes=0;
  return new Response(res.body?.pipeThrough(new TransformStream({transform(chunk,ctl){if((bytes+=chunk.byteLength)>32000)throw Error('DM_RESULT_SIZE');ctl.enqueue(chunk)}})),{status:res.status,headers:res.headers});
 }});
 try{
  await client.connect(transport);if(client.getServerVersion()?.name!=='xiaohongshu-mcp')throw Error('DM_SERVER_MISMATCH');
  const list=await client.listTools({});if(list.nextCursor||list.tools.length!==1||list.tools[0].name!=='workbench_dm_conversation_inspect'||list.tools[0].annotations?.readOnlyHint===true||!list.tools[0].description?.startsWith(DM_OBSERVE_PROTOCOL+' '))throw Error('DM_EXCLUSIVE_MODE_REQUIRED');
  const raw=await client.callTool({name:'workbench_dm_conversation_inspect',arguments:input});if(raw.isError)throw Error('DM_TOOL_ERROR');return {inspectionId,...parseExistingDm(raw.structuredContent,c)};
 }finally{await client.close().catch(()=>{});}
}
