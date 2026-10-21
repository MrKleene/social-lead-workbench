// Frontend only: reads non-secret instance ports; never acquires backend lock or starts DB.
import {readFile} from 'node:fs/promises';
import {spawn} from 'node:child_process';
import {join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import platform from '../runtime/platform.cjs';
import {cleanEnvironment} from './real-mcp/core.mjs';
import {installStopHandlers} from './persistent-lifecycle.mjs';
const root=resolve(fileURLToPath(new URL('../',import.meta.url))),args=process.argv.slice(2);
let offline=false,name='main';for(let i=0;i<args.length;i++){if(args[i]==='--offline')offline=true;else if(args[i]==='--instance')name=args[++i];else throw Error('INVALID_ARGUMENTS');}
if(!/^[a-z][a-z0-9-]{0,50}$/.test(name))throw Error('INVALID_INSTANCE');
const path=join(root,'.local',offline?'persistent-offline':'persistent',name,'instance.json');await platform.privateFile(path);const m=JSON.parse(await readFile(path));
if(m.kind!=='crm-persistent-v1'||m.root!==root||m.name!==name||m.mode!==(offline?'offline':'real')||![m.webPort,m.apiPort].every(p=>Number.isInteger(p)&&p>=1024&&p<=65535))throw Error('INSTANCE_MISMATCH');
const child=spawn(process.execPath,[join(root,'node_modules/vite/bin/vite.js'),'--host','127.0.0.1','--port',String(m.webPort),'--strictPort'],{cwd:join(root,'apps/web'),env:{...cleanEnvironment(process.env),API_PROXY_TARGET:`http://127.0.0.1:${m.apiPort}`},stdio:'inherit'});
let stopping=false;installStopHandlers(()=>{stopping=true;child.kill('SIGTERM');});child.once('exit',code=>{process.exitCode=stopping?0:code??1;});
