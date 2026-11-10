'use strict';
const {Client,StreamableHTTPClientTransport,endpointUrl}=require('@crm/local-runtime/platform-provider');
const {LocalError}=require('@crm/local-runtime/database');
const names=['inbox_start','inbox_drain','inbox_snapshot','inbox_stop'];
class DesktopInboxWire{
 constructor(endpoint,sender,signal){this.sender=sender;this.signal=signal;this.endpoint=endpoint;this.allowed=null;this.calls=0;if(!/^[a-f0-9]{24}$/.test(sender)||! /^[a-f0-9]{64}$/.test(endpoint.token))throw new LocalError('INVALID_INBOX_SESSION');const url=endpointUrl(endpoint.url.href).href;
  this.client=new Client({name:'desktop-inbox',version:'1'},{capabilities:{}});
  this.transport=new StreamableHTTPClientTransport(new URL(url),{reconnectionOptions:{maxRetries:0,initialReconnectionDelay:1000,maxReconnectionDelay:1000,reconnectionDelayGrowFactor:1},fetch:async(input,init)=>{
   if(String(input)!==url||!['POST','DELETE','GET'].includes(init?.method))throw new LocalError('INBOX_ENDPOINT_CHANGED');if(init.method==='GET')return new Response(null,{status:405});if(++this.calls>500)throw new LocalError('INBOX_REQUEST_BOUND');
   if(init.method==='POST'){const rpc=JSON.parse(String(init.body));if(!['initialize','notifications/initialized','tools/list','tools/call','notifications/cancelled'].includes(rpc.method))throw new LocalError('INBOX_RPC_FORBIDDEN');if(rpc.method==='tools/call'&&(rpc.params.name!==this.allowed||rpc.params.arguments?.senderId!==sender||rpc.params.arguments?.maxSubmissions!==0||rpc.params.arguments?.protocol!=='workbench.inbox.v1'))throw new LocalError('INBOX_SCOPE_CHANGED');}
   const headers=new Headers(init.headers);if(headers.has('authorization')||headers.has('cookie'))throw new LocalError('INBOX_CREDENTIAL_OVERRIDE');headers.set('authorization','Bearer '+endpoint.token);
   const response=await fetch(url,{...init,headers,credentials:'omit',redirect:'error',signal:this.allowed==='inbox_stop'?AbortSignal.timeout(8000):AbortSignal.any([signal,AbortSignal.timeout(55000)])});if(!response.body)return response;const parts=[];let size=0;for await(const part of response.body){size+=part.length;if(size>2097152)throw new LocalError('INBOX_RESPONSE_BOUND');parts.push(part);}return new Response(Buffer.concat(parts),{status:response.status,headers:response.headers});
  }});
 }
 async connect(){await this.client.connect(this.transport);const list=await this.client.listTools();if(list.nextCursor||list.tools.map(t=>t.name).sort().join(',')!==[...names].sort().join(','))throw new LocalError('INBOX_CATALOG_CHANGED');}
 async call(name,channel){if(!names.includes(name)||this.allowed||name!=='inbox_stop'&&this.signal.aborted||channel!==undefined&&!['COMMENT','DM'].includes(channel))throw new LocalError('INBOX_CALL_FORBIDDEN');this.allowed=name;try{const result=await this.client.callTool({name,arguments:{protocol:'workbench.inbox.v1',senderId:this.sender,maxSubmissions:0,...(channel?{channel}:{})}},undefined,{timeout:name==='inbox_stop'?8000:50000});if(result.isError||!result.structuredContent)throw new LocalError('INBOX_RESPONSE_UNVERIFIED');return result.structuredContent;}finally{this.allowed=null;}}
 async close(){try{await this.call('inbox_stop');}catch{}await this.client.close().catch(()=>{});}
}
module.exports={DesktopInboxWire};
