import {Injectable} from '@nestjs/common';
import {readFile,lstat,realpath} from 'node:fs/promises';
import {join} from 'node:path';
import {createServer} from 'node:net';
import {createHash,randomBytes} from 'node:crypto';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StreamableHTTPClientTransport} from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import {inspectTools,minimalEnvironment,spawnOwned,stopOwned} from '../../../../runtime/platform.cjs';
export type InboxWire={call(name:'inbox_start'|'inbox_drain'|'inbox_snapshot',channel?:'COMMENT'|'DM'):Promise<any>;stop():Promise<boolean>};
export const INBOX_RUNTIME=Symbol('INBOX_RUNTIME');
export interface InboxRuntime{open(directory:string,senderId:string,signal:AbortSignal):Promise<InboxWire>}
@Injectable()
export class LocalInboxRuntime implements InboxRuntime{
 async open(directory:string,senderId:string,signal:AbortSignal):Promise<InboxWire>{
  if(process.platform!=='darwin'||process.env.XHS_ACCOUNT_LOGIN_MODE!=='real'||process.env.CRM_PERSISTENT!=='1')throw Error('INBOX_RUNTIME_UNAVAILABLE');
  const root=process.env.CRM_PROJECT_ROOT;if(!root||await realpath(root)!==root)throw Error('ROOT');await inspectTools(process.env.HOME??'');
  const manifest=JSON.parse(await readFile(join(root,'runtime/inbox-build.json'),'utf8')),bin=join(root,'.local/tools/inbox-mcp'),s=await lstat(bin);
  if(!s.isFile()||s.isSymbolicLink()||s.nlink!==1||s.uid!==process.getuid?.()||(s.mode&0o022)||manifest.protocol!=='workbench.inbox.v1'||manifest.platform!==process.platform||manifest.arch!==process.arch||createHash('sha256').update(await readFile(bin)).digest('hex')!==manifest.sha256)throw Error('INBOX_BUILD_UNVERIFIED');
  const net=createServer();await new Promise<void>((ok,no)=>{net.once('error',no);net.listen(0,'127.0.0.1',ok)});const port=(net.address()as{port:number}).port;await new Promise<void>(ok=>net.close(()=>ok()));
  const token=randomBytes(32).toString('hex'),endpoint=`http://127.0.0.1:${port}/mcp`;
  const child=spawnOwned(bin,['-headless=true','-port',`127.0.0.1:${port}`],{cwd:directory,env:{...minimalEnvironment(),AUTH_TOKEN:token,COOKIES_PATH:join(directory,'cookies.json'),CRM_INBOX_INSPECTION_ONLY:'1'},stdio:'ignore'});
  if(process.connected&&child.pid)process.send?.({kind:'OWNED_LOGIN_PROCESS_STARTED',pid:child.pid});
  const client=new Client({name:'workbench-inbox',version:'1'},{capabilities:{}});let permitted:string|undefined,stopping:Promise<boolean>|undefined;
  const input=(channel?:'COMMENT'|'DM')=>({protocol:'workbench.inbox.v1',senderId,maxSubmissions:0,...(channel?{channel}:{})});
  const wire=new StreamableHTTPClientTransport(new URL(endpoint),{reconnectionOptions:{maxRetries:0,maxReconnectionDelay:1000,initialReconnectionDelay:1000,reconnectionDelayGrowFactor:1},fetch:async(url,init)=>{
   if(String(url)!==endpoint)throw Error('ENDPOINT');if(init?.method==='GET')return new Response(null,{status:405});
   if(!['POST','DELETE'].includes(init?.method??''))throw Error('METHOD');
   if(init?.method==='POST'){const rpc=JSON.parse(String(init.body));if(!['initialize','notifications/initialized','tools/list','tools/call','notifications/cancelled'].includes(rpc.method))throw Error('RPC');if(rpc.method==='tools/call'&&(rpc.params.name!==permitted||rpc.params.arguments?.senderId!==senderId||rpc.params.arguments?.maxSubmissions!==0))throw Error('TOOL');}
   const headers=new Headers(init?.headers);headers.set('authorization','Bearer '+token);return fetch(url,{...init,headers,credentials:'omit',redirect:'error',signal:permitted==='inbox_stop'?AbortSignal.timeout(8000):AbortSignal.any([signal,AbortSignal.timeout(55000)])});
  }});
  const call=async(name:'inbox_start'|'inbox_drain'|'inbox_snapshot',channel?:'COMMENT'|'DM')=>{if(signal.aborted)throw Error('STOPPED');permitted=name;try{const r=await client.callTool({name,arguments:input(channel)},undefined,{timeout:50000});if(r.isError||!r.structuredContent)throw Error('INBOX_READ_FAILED');return r.structuredContent}finally{permitted=undefined}};
  const stop=()=>stopping??=(async()=>{
   let graceful=false;try{permitted='inbox_stop';const r=await client.callTool({name:'inbox_stop',arguments:input()},undefined,{timeout:8000});graceful=!r.isError&&(r.structuredContent as any)?.stopped===true}catch{}finally{permitted=undefined}
   await client.close().catch(()=>{});stopOwned(child);await new Promise(r=>setTimeout(r,500));stopOwned(child,'SIGKILL');
   let exited=false;for(let i=0;i<20;i++){try{process.kill(-child.pid!,0)}catch(e){if((e as NodeJS.ErrnoException).code==='ESRCH'){exited=true;break}}await new Promise(r=>setTimeout(r,100))}
   if(exited&&process.connected&&child.pid)process.send?.({kind:'OWNED_LOGIN_PROCESS_STOPPED',pid:child.pid});return exited;
  })();
  try{for(let i=0;i<50;i++){if(signal.aborted)throw Error('STOPPED');try{if((await fetch(`http://127.0.0.1:${port}/health`,{signal:AbortSignal.timeout(200)})).ok)break}catch{}await new Promise(r=>setTimeout(r,100))}await client.connect(wire);const tools=await client.listTools();if(tools.nextCursor||tools.tools.map(t=>t.name).sort().join(',')!==['inbox_start','inbox_drain','inbox_snapshot','inbox_stop'].sort().join(','))throw Error('CATALOG');return{call,stop}}catch(e){await stop();throw e}
 }
}
