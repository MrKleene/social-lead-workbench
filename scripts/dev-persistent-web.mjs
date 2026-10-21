// Frontend-only entry, isolated from backend/DB lifetime. Managed by the same native supervisor.
import {readFile} from 'node:fs/promises';
import {spawn} from 'node:child_process';
import {join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import platform from '../runtime/platform.cjs';
import {cleanEnvironment} from './real-mcp/core.mjs';
import {installStopHandlers} from './persistent-lifecycle.mjs';
import {supervise,inheritedLease,watchSupervisor} from './persistent-supervision.mjs';
import {serveControl} from './workbench-control.mjs';
const root=resolve(fileURLToPath(new URL('../',import.meta.url))),args=process.argv.slice(2);
let offline=false,name='main';for(let i=0;i<args.length;i++){if(args[i]==='--offline')offline=true;else if(args[i]==='--instance')name=args[++i];else throw Error('INVALID_ARGUMENTS');}
if(!/^[a-z][a-z0-9-]{0,50}$/.test(name))throw Error('INVALID_INSTANCE');
const directory=join(root,'.local',offline?'persistent-offline':'persistent',name),path=join(directory,'instance.json');await platform.privateFile(path);const m=JSON.parse(await readFile(path));
if(m.kind!=='crm-persistent-v1'||m.root!==root||m.name!==name||m.mode!==(offline?'offline':'real')||![m.webPort,m.apiPort].every(p=>Number.isInteger(p)&&p>=1024&&p<=65535))throw Error('INSTANCE_MISMATCH');
const managed=!!process.env.CRM_SUPERVISED_BOOT;
if(process.platform==='darwin'&&!managed)process.exit(await supervise({root,directory,args,env:cleanEnvironment(process.env),entry:'scripts/dev-persistent-web.mjs',guardName:'.web.guard'}));
if(managed)inheritedLease(directory,'.web.guard');
let child,control,life,stopping=false;
const stop=()=>{stopping=true;child?.kill('SIGTERM');};installStopHandlers(stop);
try{
 if(managed)life=watchSupervisor(()=>{stop();setTimeout(()=>process.kill(-process.pid,'SIGKILL'),3000).unref();});
 const envSource={...process.env};delete envSource.CRM_SUPERVISED_BOOT;delete envSource.CRM_SUPERVISOR_PID;delete envSource.CRM_SUPERVISED_LAUNCHER;
 const env={...cleanEnvironment(envSource),API_PROXY_TARGET:`http://127.0.0.1:${m.apiPort}`};
 if(!stopping)child=spawn(process.execPath,[join(root,'node_modules/vite/bin/vite.js'),'--host','127.0.0.1','--port',String(m.webPort),'--strictPort'],{cwd:join(root,'apps/web'),env,stdio:managed?['ignore','inherit','inherit','ignore',4]:'inherit'});
 if(child){const done=new Promise(ok=>{child.once('exit',code=>ok(code??1));child.once('error',()=>ok(1));});if(managed)control=await serveControl({root,directory,instanceId:m.id,role:'web',phase:()=>stopping?'stopping':'running',onStop:()=>process.emit('SIGINT')});const code=await done;process.exitCode=stopping?0:code;}
}finally{stop();await control?.close();life?.destroy();}
