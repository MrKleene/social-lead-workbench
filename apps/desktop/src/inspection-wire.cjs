'use strict';
const {Client,StreamableHTTPClientTransport,endpointUrl}=require('@crm/local-runtime/platform-provider');
const {LocalError}=require('@crm/local-runtime/database');

/**
 * 登录后查一次「这个账号还能不能回复」。
 *
 * 用原生侧已有的主页限制检查（`workbench.xhs.account-profile-inspection.v1`）：
 * 只读打开账号自己的主页，看有没有封禁/禁言/评论关闭这类可见提示。
 *
 * 语义必须说清楚：**看到提示就能判定受限，看不到提示不等于能发**。原生结果里
 * `OBSERVED_NO_RESTRICTION` 的 code 就叫 `NOT_A_SEND_PERMISSION_CHECK`，
 * 所以这里只把「明确看到限制」当成结论，其余一律不写任何状态。
 */
const PROFILE_PROTOCOL='workbench.xhs.account-profile-inspection.v1';
const TOOL='workbench_account_restriction_inspect';
const SENDER=/^[a-f0-9]{24}$/;

function owned(session,accountId){return {...session.endpoint(),accountId,binarySha256:session.binaryHash};}

async function inspectAccountRestriction(session,target){
 const {accountId,senderId}=target;
 if(typeof accountId!=='string'||!accountId||accountId.length>200)throw new LocalError('ACCOUNT_IDENTITY_CHANGED');
 if(!SENDER.test(senderId??''))throw new LocalError('ACCOUNT_IDENTITY_CHANGED');
 const endpoint=owned(session,accountId),url=endpointUrl(endpoint.url.href).href;
 if(!/^[a-f0-9]{64}$/.test(endpoint.token))throw new LocalError('INSPECTION_ENDPOINT_INVALID');
 let requests=0;
 const client=new Client({name:'desktop-account-inspection',version:'1'},{capabilities:{}});
 const transport=new StreamableHTTPClientTransport(new URL(url),{reconnectionOptions:{maxRetries:0,initialReconnectionDelay:1000,maxReconnectionDelay:1000,reconnectionDelayGrowFactor:1},fetch:async(input,init)=>{
  if(String(input)!==url||++requests>12)throw new LocalError('INSPECTION_REQUEST_BOUND');
  if(init?.method==='GET')return new Response(null,{status:405});
  if(!['POST','DELETE'].includes(init?.method))throw new LocalError('INSPECTION_METHOD_FORBIDDEN');
  if(init.method==='POST'){
   const rpc=JSON.parse(String(init.body));
   if(!['initialize','notifications/initialized','tools/list','tools/call','notifications/cancelled'].includes(rpc.method))throw new LocalError('INSPECTION_RPC_FORBIDDEN');
   if(rpc.method==='tools/call'&&rpc.params?.name!==TOOL)throw new LocalError('INSPECTION_TOOL_FORBIDDEN');
  }
  const headers=new Headers(init.headers);if(headers.has('authorization')||headers.has('cookie'))throw new LocalError('INSPECTION_AUTH_OVERRIDE');headers.set('authorization','Bearer '+endpoint.token);
  const response=await fetch(url,{...init,headers,redirect:'error',credentials:'omit'});
  if(!response.ok)throw new LocalError('INSPECTION_HTTP_FAILED');
  if(!response.body)return response;let size=0;const parts=[];for await(const part of response.body){if((size+=part.length)>65536)throw new LocalError('INSPECTION_RESPONSE_BOUND');parts.push(part);}return new Response(Buffer.concat(parts),{status:response.status,headers:response.headers});
 }});
 const signal=AbortSignal.timeout(40000);
 try{
  await client.connect(transport,{signal,timeout:5000});
  if(client.getServerVersion()?.name!=='xiaohongshu-mcp')throw new LocalError('INSPECTION_SERVER_CHANGED');
  const list=await client.listTools({},{signal,timeout:5000});
  // 这个模式只该暴露一个只读工具，出现别的工具说明拉起的不是检查进程。
  if(list.nextCursor||list.tools.length!==1||list.tools[0].name!==TOOL||list.tools[0].annotations?.readOnlyHint!==true)throw new LocalError('INSPECTION_CATALOG_CHANGED');
  const raw=await client.callTool({name:TOOL,arguments:{protocol:PROFILE_PROTOCOL,accountId,senderId}},undefined,{signal,timeout:35000});
  if(raw.isError||!raw.structuredContent)throw new LocalError('INSPECTION_RESPONSE_UNVERIFIED');
  return parse(raw.structuredContent,{accountId,senderId});
 }finally{await client.close().catch(()=>{});}
}

/** 只取判定需要的字段：kind/code 与警告码，其它（截图、路径、文本）一律不落地。 */
function parse(value,{accountId,senderId}){
 if(!value||value.protocol!==PROFILE_PROTOCOL||value.accountId!==accountId||value.senderId!==senderId)throw new LocalError('INSPECTION_RESPONSE_UNVERIFIED');
 if(typeof value.kind!=='string'||typeof value.code!=='string'||value.processStopped!==true)throw new LocalError('INSPECTION_RESPONSE_UNVERIFIED');
 const warnings=Array.isArray(value.observation?.warnings)?value.observation.warnings:[];
 return {
  kind:value.kind,
  code:value.code,
  identity:value.observation?.identity??'UNKNOWN',
  warnings:warnings.filter(w=>w&&typeof w.code==='string').slice(0,5).map(w=>w.code),
 };
}

module.exports={inspectAccountRestriction,PROFILE_PROTOCOL};
