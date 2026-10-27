import {readReplyJournal} from '../auto-contact/reply-stage-journal';
import type {OwnedReplyEndpoint} from '../auto-contact/xhs-reply-transport';
import {confirmSessionFile} from './session-save-proof';
import {privateDirectory,privateFile,isWithin,inspectTools,minimalEnvironment,spawnOwned,stopOwned,windowsDataRoot} from '../../../../runtime/platform.cjs';
import { XhsHttpTransport, ReadOnlyMcpTransport } from '../collection/mcp/transport';
import { AccountFixtureTransport } from '../collection/adapters/account-fixture';
import { Injectable } from '@nestjs/common';
import { LocalDeviceRuntime } from '../devices/device-runtime';
import { spawn } from 'node:child_process';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { access, mkdir, lstat, realpath, readFile, writeFile, readdir } from 'node:fs/promises';
import { constants } from 'node:fs';
import { join,isAbsolute,relative,sep } from 'node:path';
import { createServer } from 'node:net';
export type LoginMode = 'real' | 'offline';
export type SessionDriver = { qr(signal: AbortSignal): Promise<{image: string; seconds: number}>; status(signal: AbortSignal): Promise<{loggedIn: boolean; userId?: string; nickname?: string}>; stop(): Promise<void>; readTransport?(): ReadOnlyMcpTransport; replyEndpoint?(): OwnedReplyEndpoint; simulate?(scenario: string): void | Promise<void> };
export const demoImage = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jG5EAAAAASUVORK5CYII=';
export function parseQr(value: unknown) {
  const v = value as { img?: unknown; timeout?: unknown; is_logged_in?: unknown };
  if (!v || v.is_logged_in === true) throw new Error('UNEXPECTED_EXISTING_LOGIN');
  if (typeof v.img !== 'string' || v.img.length > 1400000 || !/^data:image\/(png|jpeg);base64,[A-Za-z0-9+/]+=*$/.test(v.img)) throw new Error('QR_FORMAT_UNSUPPORTED');
  const bytes = Buffer.from(v.img.split(',')[1], 'base64');
  if (bytes.length < 8 || !(bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])) || bytes.subarray(0,3).equals(Buffer.from([255,216,255])))) throw new Error('QR_FORMAT_UNSUPPORTED');
  const match = typeof v.timeout === 'string' && /^(?:(\d+)m)?(?:(\d+)s)?$/.exec(v.timeout);
  const seconds = match ? Number(match[1] || 0)*60+Number(match[2] || 0) : 0;
  if (!seconds || seconds > 240) throw new Error('INVALID_EXPIRY');
  return {image:v.img, seconds};
}
export function parseStatus(value: unknown) {
  const v = value as {is_logged_in?:unknown;user_id?:unknown;username?:unknown};
  if (!v || typeof v.is_logged_in !== 'boolean') throw new Error('INVALID_STATUS');
  return {loggedIn:v.is_logged_in, userId:typeof v.user_id==='string' && /^[A-Za-z0-9_-]{1,128}$/.test(v.user_id)?v.user_id:undefined, nickname:typeof v.username==='string'?v.username.slice(0,80):undefined};
}
async function privateDir(path:string, create=false) {
  await privateDirectory(path,create);
}
async function freePort(){const s=createServer();await new Promise<void>((ok,no)=>{s.once('error',no);s.listen(0,'127.0.0.1',ok);});const p=(s.address() as {port:number}).port;await new Promise<void>(ok=>s.close(()=>ok()));if([18060,18061].includes(p))return freePort();return p;}
@Injectable()
export class LoginRuntime {
  readonly runtimeId=process.env.CRM_RUNTIME_ID || randomUUID();
  persistent(){return process.env.CRM_PERSISTENT==='1';}
  deviceId(){const id=process.env.CRM_DEVICE_ID;if(!id||!/^[a-f0-9-]{36}$/.test(id))throw Error('INVALID_DEVICE');return id;}
  private async directory(accountId:string,key:string,create=false,executionRoot?:string){
    const root=process.env.CRM_PROJECT_ROOT || '',base=executionRoot||this.storage();
    if(!isAbsolute(root)||await realpath(root)!==root||!/^\w+$/.test(accountId)||!/^[a-f0-9-]{36}$/.test(key))throw Error('INVALID_CONFIGURATION');
    const local=join(root,'.local');const ls=await lstat(local);if(ls.isSymbolicLink()||!ls.isDirectory())throw Error('UNSAFE_SESSION_DIRECTORY');
    // Check every ancestor, including an overridden offline fixture root.
    if(!isWithin(local,base)){
      if(!executionRoot||!this.persistent()||this.mode()!=='real')throw Error('INVALID_CONFIGURATION');
      await new LocalDeviceRuntime().validateRoot(base,create);
    }
    let p=local;for(const part of (isWithin(local,base)?relative(local,base).split(sep):[])){if(!part||part==='.'||part==='..')throw Error('INVALID_CONFIGURATION');p=join(p,part);await privateDir(p,create);}
    const account=join(base,accountId);await privateDir(account,create);const directory=join(account,key);
    if(create){
      const existing=await lstat(directory).catch(e=>{if(e.code==='ENOENT')return null;throw e;});
      if(existing)throw Error('SESSION_ALREADY_EXISTS');
      await privateDir(directory,true);if((await readdir(directory)).length)throw Error('SESSION_ALREADY_EXISTS');
      await writeFile(join(directory,'session.json'),JSON.stringify({kind:'crm-qr-login-v2',accountId,attemptId:key,deviceId:this.persistent()?this.deviceId():null}),{flag:'wx',mode:0o600});}
    else await privateDir(directory);
    return directory;
  }
  async inspect(accountId:string,key:string,deviceId:string,provider:string,executionRoot?:string){
    if(deviceId!==this.deviceId()||provider!==this.mode())return 'DEVICE_MISMATCH';
    try{const dir=await this.directory(accountId,key,false,executionRoot),path=join(dir,'session.json'),stat=await privateFile(path);
      if(!stat.isFile()||stat.isSymbolicLink()||stat.nlink!==1||stat.size>4096)return 'NEEDS_REVIEW';
      const m=JSON.parse(await readFile(path,'utf8'));if(m.kind!=='crm-qr-login-v2'||m.accountId!==accountId||m.attemptId!==key||m.deviceId!==deviceId)return 'NEEDS_REVIEW';
      // Existence and ownership checks only. Never read platform credential contents.
      const f=await privateFile(join(dir,provider==='offline'?'fixture-state.json':'cookies.json'));
      return f.isFile()&&!f.isSymbolicLink()&&f.nlink===1?'UNVERIFIED':'NEEDS_REVIEW';
    }catch(e){return (e as NodeJS.ErrnoException).code==='ENOENT'?'MISSING':'NEEDS_REVIEW';}
  }
  async confirmSaved(accountId:string,key:string,signal:AbortSignal,executionRoot?:string){
    if(!this.persistent()||!this.mode())throw Error('SESSION_SAVE_UNCONFIRMED');
    try{
      if(await this.inspect(accountId,key,this.deviceId(),this.mode()!,executionRoot)!=='UNVERIFIED')throw Error();
      const dir=await this.directory(accountId,key,false,executionRoot);
      await confirmSessionFile(join(dir,this.mode()==='offline'?'fixture-state.json':'cookies.json'),this.mode()!,signal);
    }catch{throw Error('SESSION_SAVE_UNCONFIRMED');}
  }
  async openSaved(accountId:string,key:string,signal:AbortSignal,executionRoot?:string){return this.open(accountId,key,signal,true,executionRoot);}

  async openSavedForReply(accountId:string,key:string,signal:AbortSignal,executionRoot:string,reviewedSha256:string){
    if(process.platform!=='darwin'||this.mode()!=='real'||!this.persistent()||!/^[a-f0-9]{64}$/.test(reviewedSha256))throw Error('REPLY_RUNTIME_DISABLED');
    return this.open(accountId,key,signal,true,executionRoot,reviewedSha256);
  }

  /** Read-only diagnostic process: no sender enable flag and only preflight MCP registration. */
  async openSavedForPreflight(accountId:string,key:string,signal:AbortSignal,executionRoot:string,reviewedSha256:string){
    if(process.platform!=='darwin'||this.mode()!=='real'||!this.persistent()||!/^[a-f0-9]{64}$/.test(reviewedSha256))throw Error('PREFLIGHT_RUNTIME_DISABLED');
    return this.open(accountId,key,signal,true,executionRoot,reviewedSha256,true);
  }

  /** Separate screenshot/notice inspection. No sender or legacy HTTP API is registered. */
  async openSavedForRestrictionInspection(accountId:string,key:string,signal:AbortSignal,executionRoot:string,reviewedSha256:string){
    if(process.platform!=='darwin'||this.mode()!=='real'||!this.persistent()||!/^[a-f0-9]{64}$/.test(reviewedSha256))throw Error('INSPECTION_RUNTIME_DISABLED');
    return this.open(accountId,key,signal,true,executionRoot,reviewedSha256,false,true);
  }

  mode():LoginMode|undefined { const v=process.env.XHS_ACCOUNT_LOGIN_MODE; return v==='real'||v==='offline'?v:undefined; }
  storage(){return process.env.XHS_SESSION_ROOT || (this.mode()==='real'?join(process.env.CRM_PROJECT_ROOT || '', '.local/xhs-qr'):'离线演示：不写平台会话');}
  async open(accountId:string, attemptId:string, signal:AbortSignal,saved=false,executionRoot?:string,replySha256?:string,preflightOnly=false,restrictionOnly=false):Promise<SessionDriver> {
    if(this.mode()==='offline') {
      let scenario='PENDING',stopped=false;
      const directory=this.persistent()?await this.directory(accountId,attemptId,!saved,executionRoot):undefined;
      if(directory&&!saved)await writeFile(join(directory,'fixture-state.json'),JSON.stringify({fixture:true,status:'PENDING'}),{flag:'wx',mode:0o600});
      return {qr:async()=>{if(stopped||signal.aborted)throw Error('CANCELLED');return {image:demoImage,seconds:240};},status:async()=>{
        if(directory&&saved){const f=JSON.parse(await readFile(join(directory,'fixture-state.json'),'utf8'));if(f.fixture!==true)throw Error('INVALID_FIXTURE');scenario=f.status;}
        if(stopped||signal.aborted)throw Error('CANCELLED'); if(scenario==='ERROR')throw Error('PLATFORM_UNAVAILABLE');
        return {loggedIn:scenario==='SUCCESS'||scenario==='MISSING_ID',...(scenario==='SUCCESS'?{userId:`offline-${accountId}`,nickname:'离线模拟账号'}:{})};
      },readTransport:()=>new AccountFixtureTransport(),stop:async()=>{stopped=true;},simulate:async s=>{scenario=s;if(directory)await writeFile(join(directory,'fixture-state.json'),JSON.stringify({fixture:true,status:s}),{mode:0o600});}};
    }
    if(this.mode()!=='real')throw Error('LOGIN_DISABLED');
    const root=process.env.CRM_PROJECT_ROOT || '';
    if(!isAbsolute(root)||await realpath(root)!==root||!/^\w+$/.test(accountId)||!/^[a-f0-9-]{36}$/.test(attemptId))throw Error('INVALID_CONFIGURATION');
    const tools=await inspectTools(process.env.HOME || ''),bin=tools.mcp;
    if(replySha256&&(!saved||tools.hash!==replySha256))throw Error('REPLY_BINARY_REVIEW_MISMATCH');
    // Saved references are validated by the service before an explicit manual check.
    const local=join(root,'.local'); await mkdir(local,{mode:0o700}).catch(e=>{if(e.code!=='EEXIST')throw e;});
    const localStat=await lstat(local);if(localStat.isSymbolicLink()||!localStat.isDirectory())throw Error('UNSAFE_SESSION_DIRECTORY');
    const directory=await this.directory(accountId,attemptId,!saved,executionRoot);
    if(signal.aborted)throw Error('CANCELLED');
    process.umask(0o077);
    const port=await freePort(),token=randomBytes(32).toString('hex');
    const env=minimalEnvironment();
    if(process.platform==='win32')env.LOCALAPPDATA=windowsDataRoot(); // match Go os.UserCacheDir to the OS-known folder
    if(signal.aborted)throw Error('CANCELLED');
    const child=spawnOwned(bin,['-headless=true','-port',`127.0.0.1:${port}`],{cwd:directory,env:{...env,COOKIES_PATH:join(directory,'cookies.json'),AUTH_TOKEN:token,...(restrictionOnly?{CRM_ACCOUNT_INSPECTION_ONLY:'1'}:preflightOnly?{CRM_EXACT_PREFLIGHT_ONLY:'1'}:replySha256?{CRM_EXACT_REPLY_ENABLED:'1'}:{})},detached:true,stdio:'ignore'});
    const notify=(kind:string)=>{if(process.connected&&child.pid)try{process.send?.({kind,pid:child.pid});}catch{}};
    notify('OWNED_LOGIN_PROCESS_STARTED');
    let alive=true,stopping:Promise<void>|undefined;const done=new Promise<void>(ok=>{child.once('error',()=>{alive=false;ok();});child.once('exit',()=>{alive=false;ok();queueMicrotask(()=>{void stop();});});});
    const stop=()=>stopping ||= (async()=>{
      if(child.pid){
        stopOwned(child,'SIGTERM');
        let timer:NodeJS.Timeout|undefined;await Promise.race([done,new Promise<void>(ok=>{timer=setTimeout(ok,1500);})]);clearTimeout(timer);
        // The leader may exit before its browser children. Stop the entire owned
        // group before unregistering it from the workbench supervisor.
        stopOwned(child,'SIGKILL');
        if(alive)await done;notify('OWNED_LOGIN_PROCESS_STOPPED');
      }
    })();
    signal.addEventListener('abort',()=>{void stop();},{once:true});
    const endpoint=`http://127.0.0.1:${port}`;
    const request=async(path:'/api/v1/login/qrcode'|'/api/v1/login/status',s:AbortSignal)=>{
      if(!alive||signal.aborted)throw Error('PROCESS_STOPPED');
      const response=await fetch(endpoint+path,{headers:{Authorization:`Bearer ${token}`},signal:AbortSignal.any([signal,s,AbortSignal.timeout(40000)]),redirect:'error',credentials:'omit'});
      if(!response.ok)throw Error(response.status===429?'RATE_LIMITED':response.status===403?'RESTRICTED':'PLATFORM_UNAVAILABLE');
      let size=0,parts:Uint8Array[]=[];for await(const chunk of response.body! as unknown as AsyncIterable<Uint8Array>){size+=chunk.length;if(size>1500000)throw Error('INVALID_RESPONSE');parts.push(chunk);}
      const body=JSON.parse(Buffer.concat(parts).toString('utf8'));if(body.success!==true)throw Error('PLATFORM_UNAVAILABLE');return body.data;
    };
    try{
      let ready=false;for(let i=0;i<40&&alive&&!signal.aborted;i++){try{ready=(await fetch(endpoint+'/health',{signal:AbortSignal.timeout(200),redirect:'error'})).ok;}catch{}if(ready)break;await new Promise(ok=>setTimeout(ok,100));}
      if(!ready||!alive||signal.aborted)throw Error('PROCESS_START_FAILED');
      return {qr:async s=>parseQr(await request('/api/v1/login/qrcode',s)),status:async s=>parseStatus(await request('/api/v1/login/status',s)),readTransport:()=>new XhsHttpTransport(new URL(endpoint+'/mcp'),'XHS_MCP',{token,callMs:40000}),
      ...(replySha256?{replyEndpoint:():OwnedReplyEndpoint=>({url:new URL(endpoint+'/mcp'),token,accountId,binarySha256:tools.hash,readJournal:async id=>readReplyJournal(directory,id),stop:async()=>{
        await stop();if(!child.pid||process.platform!=='darwin')return false;
        // Probe only this freshly spawned owned process group, never a stored PID.
        for(let i=0;i<10;i++){try{process.kill(-child.pid,0);}catch(error){return (error as NodeJS.ErrnoException).code==='ESRCH';}await new Promise(ok=>setTimeout(ok,50));}return false;
      }})}:{}),stop};
    }catch(e){await stop();throw e;}
  }
}
