import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtemp,writeFile,readFile,rm,lstat} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {fileURLToPath} from 'node:url';
import {buildSupervisor} from './build-persistent-supervisor.mjs';
import {randomUUID} from 'node:crypto';
const root=resolve(fileURLToPath(new URL('../',import.meta.url))),binary=buildSupervisor(root);
const platformModule=new URL('../runtime/platform.cjs',import.meta.url).href;
const lockModule=new URL('./persistent-lock.mjs',import.meta.url).href,supervisionModule=new URL('./persistent-supervision.mjs',import.meta.url).href;
const wait=ms=>new Promise(ok=>setTimeout(ok,ms));
async function until(fn){for(let i=0;i<200;i++){if(await fn())return;await wait(50);}throw Error('fixture timeout');}
const alive=pid=>{try{process.kill(pid,0);return true;}catch{return false;}};
async function fixture(fn){const directory=await mkdtemp(join(tmpdir(),'crm-supervisor-')),name='acceptance-'+randomUUID(),children=[];
 const options={root,directory,name,mode:'offline'};
 await writeFile(join(directory,'instance.json'),JSON.stringify({kind:'crm-persistent-v1',root,name,mode:'offline',apiPort:61431,webPort:61432}),{mode:0o600});
 const script=join(directory,'managed.mjs');
 const nestedCode=`const fs=require('node:fs'),{spawn}=require('node:child_process');const browser=spawn(process.execPath,['-e','setInterval(()=>{},1000)'],{stdio:'ignore'});fs.writeFileSync(${JSON.stringify(join(directory,'nested'))},JSON.stringify({tool:process.pid,browser:browser.pid}));setInterval(()=>{},1000);`;
 await writeFile(script,`import {spawn} from 'node:child_process';import {writeFileSync,readFileSync} from 'node:fs';import platform from ${JSON.stringify(platformModule)};import {acquireInstanceLock} from ${JSON.stringify(lockModule)};import {watchSupervisor} from ${JSON.stringify(supervisionModule)};const lock=await acquireInstanceLock(${JSON.stringify(options)});process.env.CRM_INSTANCE_DIRECTORY=${JSON.stringify(directory)};const nested=platform.spawnOwned(process.execPath,['-e',${JSON.stringify(nestedCode)}],{env:{PATH:process.env.PATH}});let nestedIds;while(!nestedIds){try{nestedIds=JSON.parse(readFileSync(${JSON.stringify(join(directory,'nested'))}));}catch{await new Promise(ok=>setTimeout(ok,20));}}const leaf=spawn(process.execPath,['-e','setInterval(()=>{},1000)'],{stdio:['ignore','ignore','ignore','ignore',4]});watchSupervisor(()=>{process.kill(-process.pid,'SIGTERM');setTimeout(()=>process.kill(-process.pid,'SIGKILL'),150).unref();});process.on('SIGTERM',()=>{});process.on('SIGUSR1',()=>{platform.stopOwned(nested,'SIGTERM');setTimeout(()=>platform.stopOwned(nested,'SIGKILL'),1500);});writeFileSync(${JSON.stringify(join(directory,'ready'))},JSON.stringify({pid:process.pid,leaf:leaf.pid,nested:nested.pid,...nestedIds}));setInterval(()=>{},1000);`);
 function boot(file=script,pipeOutput=false){const c=spawn(binary,[join(directory,'.operation.guard'),process.execPath,file],{env:{PATH:process.env.PATH,HOME:process.env.HOME},detached:true,stdio:['ignore',pipeOutput?'pipe':'ignore','pipe','pipe']});c.stdio[3].on('error',()=>{});let error='';c.stderr.on('data',b=>error+=b);c.done=new Promise(ok=>c.once('exit',(code,signal)=>ok({code,signal,error})));children.push(c);return c;}
 try{await fn({directory,options,boot});}finally{for(const c of children)c.stdio[3].end();await Promise.all(children.map(c=>c.done));await rm(directory,{recursive:true,force:true});}
}
for(const mode of ['controller-eof','manager-kill','supervisor-kill'])test('managed same-boot recovery after '+mode,()=>fixture(async({directory,boot})=>{
 const first=boot();let ids;await until(async()=>{try{ids=JSON.parse(await readFile(join(directory,'ready')));return true;}catch{return false;}});
 assert.equal(JSON.parse(await readFile(join(directory,'operation.lock'))).kind,'crm-persistent-lock-v3');
 const duplicate=boot();assert.equal((await duplicate.done).code,73);
 if(mode==='controller-eof')first.stdio[3].end();else process.kill(mode==='manager-kill'?ids.pid:first.pid,'SIGKILL');
 await first.done;await until(()=>Object.values(ids).every(pid=>!alive(pid)));
 // A residual state file is expected; exclusive OS lease is the recovery proof.
 await lstat(join(directory,'operation.lock'));await rm(join(directory,'ready'));await rm(join(directory,'nested'));
 const second=boot();let next;await until(async()=>{try{next=JSON.parse(await readFile(join(directory,'ready')));return next.pid!==ids.pid;}catch{return false;}});
 assert(alive(next.leaf));second.stdio[3].end();assert.equal((await second.done).code,0);await until(()=>Object.values(next).every(pid=>!alive(pid)));
}));
test('startup interruption before metadata recovers without reboot',()=>fixture(async({directory,boot})=>{
 const file=join(directory,'starting.mjs');await writeFile(file,'setInterval(()=>console.log("fictional"),20);');
 const first=boot(file);await wait(100);first.stdio[3].end();assert.equal((await first.done).code,0);
 const second=boot();await until(async()=>{try{await lstat(join(directory,'ready'));return true;}catch{return false;}});second.stdio[3].end();assert.equal((await second.done).code,0);
}));
test('legacy same-boot lock is not relabelled or silently recovered',()=>fixture(async({directory,boot})=>{
 const old=JSON.stringify({pid:99999,token:randomUUID()});await writeFile(join(directory,'operation.lock'),old,{mode:0o600});
 const c=boot();assert.equal((await c.done).code,1);assert.equal(await readFile(join(directory,'operation.lock'),'utf8'),old);
}));

test('closed output pipe terminates managed group and permits a new owner',()=>fixture(async({directory,boot})=>{
 const file=join(directory,'output.mjs');await writeFile(file,'setInterval(()=>console.log("fictional output"),20);');
 const first=boot(file,true);await new Promise(ok=>first.stdout.once('data',ok));first.stdout.destroy();assert.equal((await first.done).code,1);
 const next=boot();await until(async()=>{try{await lstat(join(directory,'ready'));return true;}catch{return false;}});next.stdio[3].end();assert.equal((await next.done).code,0);
}));

test('stopping one supervised tool cleans its browser group and keeps backend lease',()=>fixture(async({directory,boot})=>{
 const owner=boot();let ids;await until(async()=>{try{ids=JSON.parse(await readFile(join(directory,'ready')));return true;}catch{return false;}});
 process.kill(ids.pid,'SIGUSR1');await until(()=>![ids.nested,ids.tool,ids.browser].some(alive));assert(alive(ids.pid)&&alive(ids.leaf));
 const duplicate=boot();assert.equal((await duplicate.done).code,73);owner.stdio[3].end();assert.equal((await owner.done).code,0);
}));
