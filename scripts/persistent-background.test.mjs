import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,writeFile,rm,lstat,symlink} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {spawn} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {launchDetached} from './persistent-background.mjs';
import {lifecycleJournal} from './persistent-journal.mjs';
const mod=new URL('./persistent-background.mjs',import.meta.url).href;
const wait=ms=>new Promise(ok=>setTimeout(ok,ms));
async function until(fn,ms=10000){const end=Date.now()+ms;while(Date.now()<end){if(await fn())return;await wait(20);}throw Error('fixture deadline');}
async function exists(p){return lstat(p).then(()=>true,()=>false);}
function signal(pid,value){try{process.kill(pid,value);}catch(e){if(e.code!=='ESRCH')throw e;}}
async function fixture(fn){const dir=await mkdtemp(join(tmpdir(),'crm-detached-test-'));const owned=[];try{await fn(dir,owned);}finally{for(const pid of owned)signal(pid,'SIGTERM');await wait(100);for(const pid of owned)signal(pid,'SIGKILL');await rm(dir,{recursive:true,force:true});}}
for(const abrupt of [false,true])test('independent project process survives caller '+(abrupt?'group termination':'normal exit'),{skip:process.platform!=='darwin'},()=>fixture(async(dir,owned)=>{
 const stopped=join(dir,'stopped'),ready=join(dir,'ready'),log=join(dir,'launcher.log'),code=join(dir,'service.mjs');
 await writeFile(code,`import {writeFileSync} from 'node:fs';writeFileSync(${JSON.stringify(ready)},String(process.pid));const interval=setInterval(()=>console.log('fictional heartbeat'),30);process.on('SIGTERM',()=>{clearInterval(interval);writeFileSync(${JSON.stringify(stopped)},'normal cleanup');process.exit(0);});`);
 const source=`import {launchDetached} from ${JSON.stringify(mod)};const c=launchDetached(process.execPath,[${JSON.stringify(code)}],{cwd:${JSON.stringify(dir)},log:${JSON.stringify(log)},env:{}});console.log(c.pid);${abrupt?'setInterval(()=>{},1000);':''}`;
 const parent=spawn(process.execPath,['--input-type=module','-e',source],{detached:true,stdio:['ignore','pipe','ignore']});owned.push(parent.pid);const ended=new Promise(ok=>parent.once('exit',ok));
 let text='';parent.stdout.on('data',b=>text+=b);await until(()=>text.includes('\n'));const pid=Number(text.trim());assert(Number.isInteger(pid)&&pid>1);owned.push(pid);await until(()=>exists(ready));
 if(abrupt)process.kill(-parent.pid,'SIGKILL');await ended;
 await wait(120);process.kill(pid,0);assert((await readFile(log,'utf8')).includes('fictional heartbeat'));assert.equal((await lstat(log)).mode&0o077,0);assert.equal(await exists(stopped),false);
 signal(pid,'SIGTERM');await until(()=>exists(stopped));assert.equal(await readFile(stopped,'utf8'),'normal cleanup');
}));
test('detachment never overwrites existing or symlink log files',()=>fixture(async dir=>{
 const file=join(dir,'existing'),link=join(dir,'link');await writeFile(file,'keep');await symlink(file,link);
 for(const log of [file,link])assert.throws(()=>launchDetached(process.execPath,[],{cwd:dir,log,env:{}}));assert.equal(await readFile(file,'utf8'),'keep');
}));
test('lifecycle journal only records fixed fields, not env, arguments or secrets',()=>fixture(async dir=>{
 const j=lifecycleJournal(dir,randomUUID());j.record('START',{pid:123,ppid:12,password:'FICTIONAL_SECRET',argv:['secret']});j.record('STOP_REQUESTED',{signal:'SIGTERM'});j.record('UNKNOWN',{secret:'secret'});j.record('CHILD_EXIT',{pid:22,role:'api',code:0});j.close();const raw=await readFile(j.file,'utf8'),rows=raw.trim().split('\n').map(JSON.parse);assert.equal(rows.length,3);assert(!raw.includes('SECRET'));assert(!raw.includes('argv'));assert.equal(rows[1].signal,'SIGTERM');assert.equal((await lstat(j.file)).mode&0o077,0);
}));
test('old pipe topology can orphan a detached API and lose web on EPIPE after owner is killed',{skip:process.platform!=='darwin'},()=>fixture(async(dir,owned)=>{
 const api=join(dir,'api.mjs'),web=join(dir,'web.mjs'),ready=join(dir,'children'),webExit=join(dir,'web-exit');
 await writeFile(api,'setInterval(()=>{},1000);');
 await writeFile(web,`import {writeFileSync} from 'node:fs';process.stdout.on('error',e=>{writeFileSync(${JSON.stringify(webExit)},e.code);process.exit(1);});setInterval(()=>console.log('fictional web output'),50);`);
 const root=spawn(process.execPath,['--input-type=module','-e',`import {spawn} from 'node:child_process';import {writeFileSync} from 'node:fs';const api=spawn(process.execPath,[${JSON.stringify(api)}],{detached:true,stdio:'ignore'});const web=spawn(process.execPath,[${JSON.stringify(web)}],{detached:true,stdio:['ignore','pipe','ignore']});web.stdout.on('data',()=>{});writeFileSync(${JSON.stringify(ready)},JSON.stringify([api.pid,web.pid]));setInterval(()=>{},1000);`],{stdio:'ignore'});owned.push(root.pid);const ended=new Promise(ok=>root.once('exit',ok));await until(()=>exists(ready));const children=JSON.parse(await readFile(ready,'utf8'));owned.push(...children);signal(root.pid,'SIGKILL');await ended;await until(()=>exists(webExit));assert.equal(await readFile(webExit,'utf8'),'EPIPE');process.kill(children[0],0);
}));
