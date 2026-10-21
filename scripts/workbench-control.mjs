// Same-user private Unix socket. No PID-based signalling, HTTP endpoint or secret access.
import {createServer,createConnection} from 'node:net';
import {randomUUID} from 'node:crypto';
import {writeFile,readFile,rename,unlink,lstat,chmod} from 'node:fs/promises';
import {join} from 'node:path';
import platform from '../runtime/platform.cjs';
const roles=['backend','web'];
const metadata=(directory,role)=>{if(!roles.includes(role))throw Error('CONTROL_ROLE');return join(directory,role+'-control.json');};
const uuid=s=>typeof s==='string'&&/^[a-f0-9-]{36}$/.test(s);
export async function controlRecord(directory,role){
 const file=metadata(directory,role);try{await platform.privateFile(file);const r=JSON.parse(await readFile(file,'utf8'));
 if(r.kind!=='crm-control-v1'||r.role!==role||!uuid(r.generation)||!uuid(r.instanceId)||r.socket!==`/tmp/crmctl-${r.generation}.sock`||typeof r.root!=='string')throw Error('CONTROL_METADATA');return r;
 }catch(e){if(e.code==='ENOENT')return null;throw e;}
}
export async function serveControl({root,directory,instanceId,role,phase,onStop}){
 const generation=randomUUID(),socket=`/tmp/crmctl-${generation}.sock`,file=metadata(directory,role);
 const record={kind:'crm-control-v1',root,instanceId,role,generation,socket,pid:process.pid};let stopping=false;
 const peers=new Set();
 const server=createServer(peer=>{peers.add(peer);peer.setTimeout(1500,()=>peer.destroy());peer.on('error',()=>{});peer.on('close',()=>peers.delete(peer));let text='';
  peer.on('data',b=>{text+=b;if(text.length>1024){peer.destroy();return;}if(!text.includes('\n'))return;
   let req;try{req=JSON.parse(text);if(req.root!==root||req.instanceId!==instanceId||req.role!==role||req.generation!==generation||!['status','stop'].includes(req.command))throw Error();}catch{peer.destroy();return;}
   const stop=req.command==='stop',dispatch=stop&&!stopping;const response=JSON.stringify({...record,phase:stopping?'stopping':phase(),accepted:stop})+'\n';
   if(dispatch)stopping=true;peer.end(response,()=>{if(dispatch)setImmediate(onStop);});
  });
 });
 const oldMask=process.umask(0o077);try{await new Promise((ok,no)=>{server.once('error',no);server.listen(socket,ok);});}finally{process.umask(oldMask);}
 let identity;const tmp=file+'.'+generation+'.tmp';
 try{identity=await lstat(socket);await chmod(socket,0o600);await writeFile(tmp,JSON.stringify(record),{flag:'wx',mode:0o600});await rename(tmp,file);}
 catch(e){for(const p of peers)p.destroy();await new Promise(ok=>server.close(ok));await unlink(tmp).catch(error=>{if(error.code!=='ENOENT')throw error;});throw e;}
 return {async close(){for(const p of peers)p.destroy();await new Promise(ok=>server.close(ok));try{const current=await controlRecord(directory,role);if(current?.generation===generation)await unlink(file);}catch(e){if(e.code!=='ENOENT')throw e;}try{const s=await lstat(socket);if(s.ino===identity.ino&&s.dev===identity.dev)await unlink(socket);}catch(e){if(e.code!=='ENOENT')throw e;}}};
}
export async function askControl({root,directory,instanceId,role},command='status'){
 const record=await controlRecord(directory,role);if(!record)return null;
 if(record.root!==root||record.instanceId!==instanceId)throw Error('CONTROL_IDENTITY');
 let s;try{s=await lstat(record.socket);}catch(e){if(e.code==='ENOENT')return null;throw e;}
 if(!s.isSocket()||s.isSymbolicLink()||s.uid!==process.getuid()||(s.mode&0o077))throw Error('CONTROL_UNSAFE');
 return new Promise((ok,no)=>{
  const peer=createConnection(record.socket);let text='';peer.setTimeout(2000,()=>peer.destroy(Error('CONTROL_TIMEOUT')));
  peer.on('connect',()=>peer.write(JSON.stringify({...record,command})+'\n'));
  peer.on('data',b=>{text+=b;if(text.length>4096)peer.destroy(Error('CONTROL_PROTOCOL'));});
  peer.on('error',e=>{if(e.code==='ECONNREFUSED'||e.code==='ENOENT'||e.code==='ECONNRESET')ok(null);else no(e);});
  peer.on('end',()=>{if(!text){ok(null);return;}try{const response=JSON.parse(text);if(response.root!==root||response.instanceId!==instanceId||response.generation!==record.generation||response.role!==role)throw Error();ok(response);}catch{no(Error('CONTROL_PROTOCOL'));}});
 });
}
