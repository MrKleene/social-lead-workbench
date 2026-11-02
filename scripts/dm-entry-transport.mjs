import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StreamableHTTPClientTransport} from '@modelcontextprotocol/sdk/client/streamableHttp.js';
export const protocol='workbench.xhs.dm-entry-inspection.v1';
export function validateDMEntryResult(r){
 if(!r||r.protocol!==protocol||r.submissions!==0||r.conversationOpened!==false||typeof r.stopped!=='boolean'||!Number.isFinite(Date.parse(r.observedAt))||!['INVALID_TARGET','OPEN_FAILED','INSPECTION_FAILED','STOP_UNCONFIRMED','IDENTITY_UNVERIFIED','PLATFORM_BLOCKED','ROUTE_CHANGED','NO_VISIBLE_ENTRY','ENTRY_OBSERVED_NOT_SEND_READY'].includes(r.code))throw Error('INVALID_RESULT');
 const o=r.observation;if(!o||!['MATCH','MISMATCH','UNKNOWN',''].includes(o.identity)||!['/explore','OTHER',''].includes(o.route)||typeof o.risk!=='boolean'||typeof o.loginChallenge!=='boolean'||(o.entries!==null&&!Array.isArray(o.entries)))throw Error('INVALID_OBSERVATION');
 if(o.entries?.length>8)throw Error('RESULT_BUDGET');
 for(const e of o.entries??[])if(!['私信','消息','聊天','通知'].includes(e.label)||!['A','BUTTON','ROLE_BUTTON'].includes(e.tag)||!(e.path==='NONE'||e.path==='OTHER'||/^\/[a-zA-Z/-]{1,60}$/.test(e.path))||typeof e.disabled!=='boolean')throw Error('INVALID_ENTRY');
 if(r.code==='ENTRY_OBSERVED_NOT_SEND_READY'&&(o.identity!=='MATCH'||o.route!=='/explore'||o.risk||o.loginChallenge||!o.entries?.length))throw Error('FALSE_READY');
 return {protocol:r.protocol,code:r.code,observedAt:r.observedAt,stopped:r.stopped,submissions:0,conversationOpened:false,observation:{identity:o.identity,route:o.route,risk:o.risk,loginChallenge:o.loginChallenge,entries:(o.entries??[]).map(({label,tag,path,disabled})=>({label,tag,path,disabled}))}};
}
export async function inspectDMEntry(owned,scope,signal){
 if(owned.binarySha256!==scope.candidateSha256||owned.accountId!==scope.accountId||!/^[a-f0-9]{64}$/.test(owned.token))throw Error('OWNED_ENDPOINT_MISMATCH');
 const endpoint=owned.url.href,u=new URL(endpoint);if(u.hostname!=='127.0.0.1'||u.protocol!=='http:'||u.pathname!=='/mcp'||u.username||u.password||u.search||u.hash)throw Error('ENDPOINT');
 const input={protocol,accountId:scope.accountId,senderId:scope.senderId};let calls=0,requests=0;
 const client=new Client({name:'crm-dm-entry-inspection',version:'1'},{capabilities:{}});
 const transport=new StreamableHTTPClientTransport(new URL(endpoint),{requestInit:{redirect:'error',credentials:'omit'},reconnectionOptions:{maxRetries:0,initialReconnectionDelay:1000,maxReconnectionDelay:1000,reconnectionDelayGrowFactor:1},fetch:async(url,init)=>{
  if(String(url)!==endpoint||++requests>12)throw Error('BOUNDARY');if(init?.method==='GET')return new Response(null,{status:405});if(!['POST','DELETE'].includes(init?.method))throw Error('METHOD');
  if(init.method==='POST'){const rpc=JSON.parse(String(init.body));if(!['initialize','notifications/initialized','tools/list','tools/call','notifications/cancelled'].includes(rpc.method))throw Error('RPC');if(rpc.method==='tools/call'){if(calls!==0||rpc.params?.name!=='workbench_dm_entry_inspect'||JSON.stringify(rpc.params.arguments)!==JSON.stringify(input))throw Error('NO_SEND_BOUNDARY');calls++;}}
  const headers=new Headers(init?.headers);if(headers.has('cookie')||headers.has('authorization'))throw Error('AUTH_OVERRIDE');headers.set('authorization','Bearer '+owned.token);const response=await fetch(endpoint,{...init,headers,credentials:'omit',redirect:'error',signal});if(!response.ok)throw Error('HTTP');let bytes=0;return new Response(response.body?.pipeThrough(new TransformStream({transform(chunk,c){if((bytes+=chunk.byteLength)>32768)throw Error('RESULT_SIZE');c.enqueue(chunk)}})),{status:response.status,headers:response.headers});
 }});
 try{await client.connect(transport);if(client.getServerVersion()?.name!=='xiaohongshu-mcp')throw Error('SERVER');const tools=await client.listTools({});if(tools.nextCursor||tools.tools.length!==1||tools.tools[0].name!=='workbench_dm_entry_inspect'||tools.tools[0].annotations?.readOnlyHint!==true||!tools.tools[0].description?.startsWith(protocol+' '))throw Error('EXCLUSIVE_MODE_REQUIRED');const raw=await client.callTool({name:'workbench_dm_entry_inspect',arguments:input});if(raw.isError)throw Error('RESULT');return {kind:'READ_ONLY_RESULT',result:validateDMEntryResult(raw.structuredContent),inspectionCalls:calls};}finally{await client.close().catch(()=>{});}
}
