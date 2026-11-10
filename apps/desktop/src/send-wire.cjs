'use strict';
const {Client,StreamableHTTPClientTransport,endpointUrl,sendExactDm,XhsExactPreflightTransport}=require('@crm/local-runtime/platform-provider');
const {LocalError,hash}=require('@crm/local-runtime/database');
function owned(session,accountId){return {...session.endpoint(),accountId,binarySha256:session.binaryHash,stop:()=>session.stop()};}
async function inspectComment(session,target,signal){const endpoint=owned(session,target.accountId);return new XhsExactPreflightTransport(endpoint,{enabled:true,reviewedSha256:session.binaryHash}).inspect(target,signal);}
async function submitDm(session,command,signal,beforeDispatch){return sendExactDm(owned(session,command.accountId),session.binaryHash,command,beforeDispatch,signal);}
// Exact comment transport: no renderer endpoint, no retries and one submission.
async function submitComment(session,command,signal,beforeDispatch){
 const endpoint=session.endpoint(),url=endpointUrl(endpoint.url.href).href;
 if(!/^[a-f0-9]{64}$/.test(endpoint.token))throw new LocalError('SEND_ENDPOINT_INVALID');
 let allowed,requests=0,submitted=false;
 const client=new Client({name:'desktop-exact-comment',version:'1'},{capabilities:{}});
 const transport=new StreamableHTTPClientTransport(new URL(url),{reconnectionOptions:{maxRetries:0,initialReconnectionDelay:1000,maxReconnectionDelay:1000,reconnectionDelayGrowFactor:1},fetch:async(input,init)=>{
  if(String(input)!==url||++requests>16)throw new LocalError('SEND_REQUEST_BOUND');
  if(init?.method==='GET')return new Response(null,{status:405});
  if(!['POST','DELETE'].includes(init?.method))throw new LocalError('SEND_METHOD_FORBIDDEN');
  if(init.method==='POST'){
   const rpc=JSON.parse(String(init.body));if(!['initialize','notifications/initialized','tools/list','tools/call','notifications/cancelled'].includes(rpc.method))throw new LocalError('SEND_RPC_FORBIDDEN');
   if(rpc.method==='tools/call'){
    if(!allowed||rpc.params?.name!==allowed.name||hash(rpc.params.arguments)!==hash(allowed.arguments))throw new LocalError('SEND_SCOPE_CHANGED');
    if(allowed.name==='workbench_reply_exact'){if(submitted||signal.aborted||!await beforeDispatch())throw new LocalError('SEND_AUTHORITY_CHANGED');submitted=true;}
   }
  }
  const headers=new Headers(init.headers);if(headers.has('authorization')||headers.has('cookie'))throw new LocalError('SEND_AUTH_OVERRIDE');headers.set('authorization','Bearer '+endpoint.token);
  const response=await fetch(url,{...init,headers,signal,redirect:'error',credentials:'omit'});if(!response.ok)throw new LocalError(response.status===429?'RATE_LIMITED':response.status===403?'PLATFORM_REFUSED':'SEND_HTTP_FAILED');
  if(!response.body)return response;let size=0;const parts=[];for await(const part of response.body){if((size+=part.length)>65536)throw new LocalError('SEND_RESPONSE_BOUND');parts.push(part);}return new Response(Buffer.concat(parts),{status:response.status,headers:response.headers});
 }});
 const call=async(name,args)=>{allowed={name,arguments:args};try{const r=await client.callTool(allowed,undefined,{signal,timeout:45000});if(r.isError||!r.structuredContent)throw new LocalError('SEND_RESPONSE_UNVERIFIED');return r.structuredContent;}finally{allowed=null;}};
 try{
  await client.connect(transport,{signal,timeout:5000});if(client.getServerVersion()?.name!=='xiaohongshu-mcp')throw new LocalError('SEND_SERVER_CHANGED');
  const list=await client.listTools({}, {signal,timeout:5000}),names=['workbench_reply_capabilities','workbench_reply_exact','workbench_reply_status','workbench_reply_preflight','workbench_reply_verify'];
  if(list.nextCursor||list.tools.map(t=>t.name).sort().join(',')!==names.sort().join(','))throw new LocalError('SEND_CATALOG_CHANGED');
  const caps=await call('workbench_reply_capabilities',{});
  if(caps.protocol!==command.protocol||caps.enabled!==true||caps.exactTarget!==true||caps.cancellation!=='context-and-owned-stop'||caps.receiptMode!=='FAIL_CLOSED'||caps.confirmedResponseMapping!==true||caps.receiptCapture!=='workbench.reply-receipt-capture.v1'||caps.stageJournal!=='workbench.reply-stage-journal.v1'||JSON.stringify(caps.channels)!=='["COMMENT"]'||caps.sendTool!=='workbench_reply_exact'||caps.statusTool!=='workbench_reply_status')throw new LocalError('SEND_CAPABILITY_UNAVAILABLE');
  return await call('workbench_reply_exact',command);
 }finally{await client.close().catch(()=>{});}
}
module.exports={inspectComment,submitDm,submitComment};
