import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,writeFile,rm,symlink,lstat} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {randomUUID} from 'node:crypto';
import {createServer} from 'node:net';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {acquireInstanceLock,recoveryProven} from './persistent-lock.mjs';
import {buildInstanceLock} from './build-instance-lock.mjs';
const root=resolve(fileURLToPath(new URL('../',import.meta.url))),mac=process.platform==='darwin';
if(mac)buildInstanceLock(root);
async function fixture(fn){const directory=await mkdtemp(join(tmpdir(),'crm-lock-test-'));const opts={root,directory,name:'fictional-lock',mode:'offline'};const manifest={kind:'crm-persistent-v1',root,name:opts.name,mode:'offline',apiPort:61431,webPort:61432};await writeFile(join(directory,'instance.json'),JSON.stringify(manifest),{mode:0o600});try{await fn(opts,manifest);}finally{await rm(directory,{recursive:true});}}
const path=o=>join(o.directory,'operation.lock');
const read=o=>readFile(path(o),'utf8');
const put=(o,value)=>writeFile(path(o),JSON.stringify(value),{mode:0o600});
const rejected=(promise,code)=>assert.rejects(promise,e=>e.code===code);
async function legacy(o){await put(o,{pid:999999999,startedAt:'2000-01-01T00:00:00Z'});}
async function priorBoot(o){const held=await acquireInstanceLock(o);const record=JSON.parse(await read(o));await held.release();record.bootId=randomUUID();await put(o,record);return record;}
async function ports(){const server=createServer();await new Promise(ok=>server.listen(0,'127.0.0.1',ok));return server;}
test('recovery requires different OS boot, exact lock and manifest witness; PID/time never suffice',()=>{
 const boot=randomUUID(),bytes=Buffer.from('lock'),manifest=Buffer.from('manifest');assert.equal(recoveryProven({pid:9999999,startedAt:'2000'},null,boot,bytes,manifest),false);assert.equal(recoveryProven({kind:'crm-persistent-lock-v2',bootId:boot},null,boot,bytes,manifest),false);assert.equal(recoveryProven({kind:'crm-persistent-lock-v2',bootId:'invalid'},null,boot,bytes,manifest),false);
});
test('native active lock refuses duplicate and recovery preparation, preserving owner bytes',{skip:!mac},()=>fixture(async o=>{const lock=await acquireInstanceLock(o);try{const original=await read(o);await rejected(acquireInstanceLock(o),'LOCK_ACTIVE');await rejected(acquireInstanceLock({...o,prepareRecovery:true}),'LOCK_ACTIVE');assert.equal(await read(o),original);}finally{await lock.release();}await assert.rejects(lstat(path(o)),{code:'ENOENT'});}));
test('old timestamps, nonexistent-looking PIDs and no listening services cannot reclaim legacy lock',{skip:!mac},()=>fixture(async o=>{await legacy(o);const before=await read(o);await rejected(acquireInstanceLock(o),'LOCK_REBOOT_PROOF_REQUIRED');assert.equal(await read(o),before);}));
test('explicit preparation leaves old lock and manifest unchanged and same-boot retry fails',{skip:!mac},()=>fixture(async o=>{await legacy(o);const before=await read(o),manifest=await readFile(join(o.directory,'instance.json'),'utf8');assert.equal((await acquireInstanceLock({...o,prepareRecovery:true})).prepared,true);assert.equal(await read(o),before);assert.equal(await readFile(join(o.directory,'instance.json'),'utf8'),manifest);await rejected(acquireInstanceLock(o),'LOCK_REBOOT_PROOF_REQUIRED');}));
test('simulated reboot witness recovers exact legacy lock and retains original instance ports',{skip:!mac},()=>fixture(async(o,manifest)=>{await legacy(o);await acquireInstanceLock({...o,prepareRecovery:true});const file=join(o.directory,'lock-recovery.json'),w=JSON.parse(await readFile(file));w.bootId=randomUUID();await writeFile(file,JSON.stringify(w),{mode:0o600});const lock=await acquireInstanceLock(o);try{assert.equal(lock.recovered,true);assert.deepEqual(JSON.parse(await readFile(join(o.directory,'instance.json'))),manifest);}finally{await lock.release();}}));
test('changed lock or instance bytes invalidate reboot witness',{skip:!mac},()=>fixture(async o=>{await legacy(o);await acquireInstanceLock({...o,prepareRecovery:true});const file=join(o.directory,'lock-recovery.json'),w=JSON.parse(await readFile(file));w.bootId=randomUUID();await writeFile(file,JSON.stringify(w),{mode:0o600});await put(o,{pid:12});await rejected(acquireInstanceLock(o),'LOCK_REBOOT_PROOF_REQUIRED');await legacy(o);await writeFile(join(o.directory,'instance.json'),(await readFile(join(o.directory,'instance.json'),'utf8'))+' ');await rejected(acquireInstanceLock(o),'LOCK_REBOOT_PROOF_REQUIRED');}));
test('previous-boot v2 lock recovers under native guard; concurrent contender cannot win',{skip:!mac},()=>fixture(async o=>{await priorBoot(o);const results=await Promise.allSettled([acquireInstanceLock(o),acquireInstanceLock(o)]);const winners=results.filter(r=>r.status==='fulfilled');try{assert.equal(winners.length,1);assert.equal(results.filter(r=>r.status==='rejected')[0].reason.code,'LOCK_ACTIVE');assert.equal(winners[0].value.recovered,true);}finally{await Promise.all(winners.map(r=>r.value.release()));}}));
test('occupied saved port blocks recovery even with previous-boot proof',{skip:!mac},()=>fixture(async(o,m)=>{const server=await ports();try{m.apiPort=server.address().port;await writeFile(join(o.directory,'instance.json'),JSON.stringify(m));await priorBoot(o);const before=await read(o);await rejected(acquireInstanceLock(o),'LOCK_SERVICE_OCCUPIED');assert.equal(await read(o),before);}finally{await new Promise(ok=>server.close(ok));}}));
test('symlinked operation lock is refused without modifying target',{skip:!mac},()=>fixture(async o=>{const target=join(o.directory,'target');await writeFile(target,'keep',{mode:0o600});await symlink(target,path(o));await assert.rejects(acquireInstanceLock(o));assert.equal(await readFile(target,'utf8'),'keep');}));
test('release never deletes a replaced owner record',{skip:!mac},()=>fixture(async o=>{const lock=await acquireInstanceLock(o);await put(o,{token:'other'});await rejected(lock.release(),'LOCK_CHANGED');assert.equal(await read(o),JSON.stringify({token:'other'}));}));
test('abrupt owned fixture exit releases native guard but residual operation lock still needs reboot proof',{skip:!mac},()=>fixture(async o=>{
 const module=new URL('./persistent-lock.mjs',import.meta.url).href;
 const child=spawn(process.execPath,['--input-type=module','-e',`import {acquireInstanceLock} from ${JSON.stringify(module)};await acquireInstanceLock(${JSON.stringify(o)});console.log('ready');setInterval(()=>{},1000);`],{stdio:['ignore','pipe','ignore']});
 const ended=new Promise(ok=>child.once('exit',ok));try{await new Promise((ok,no)=>{const timer=setTimeout(()=>no(Error('fixture deadline')),15000);child.stdout.once('data',()=>{clearTimeout(timer);ok();});child.once('error',no);});child.kill('SIGKILL');await ended;await new Promise(ok=>setTimeout(ok,200));await rejected(acquireInstanceLock(o),'LOCK_REBOOT_PROOF_REQUIRED');assert.equal((await acquireInstanceLock({...o,prepareRecovery:true})).prepared,true);}finally{child.kill();await ended;}
}));
test('prepare CLI completes without credentials, database, platform preflight or service startup',{skip:!mac},async()=>{
 const name='acceptance-'+randomUUID(),directory=join(root,'.local/persistent-offline',name);await platformDirectory(directory);
 const opts={root,directory,name,mode:'offline'};const manifest={kind:'crm-persistent-v1',root,name,mode:'offline',apiPort:61431,webPort:61432};
 try{await writeFile(join(directory,'instance.json'),JSON.stringify(manifest),{mode:0o600});await legacy(opts);const before=await read(opts);
 const child=spawn(process.execPath,['scripts/dev-persistent.mjs','--offline','--test-fixture','--instance',name,'--prepare-lock-recovery'],{cwd:root,stdio:['ignore','pipe','pipe']});let output='';child.stdout.on('data',b=>output+=b);child.stderr.on('data',b=>output+=b);const code=await new Promise((ok,no)=>{child.once('exit',ok);child.once('error',no);});assert.equal(code,0,output);assert.match(output,/没有删除锁/);assert.match(output,/本次没有启动或停止业务进程/);assert(!output.includes('本地步骤：'));assert.equal(await read(opts),before);await assert.rejects(lstat(join(directory,'secret.json')),{code:'ENOENT'});await assert.rejects(lstat(join(directory,'stopped.json')),{code:'ENOENT'});
 }finally{await rm(directory,{recursive:true});}
});
async function platformDirectory(directory){const {mkdir}=await import('node:fs/promises');await mkdir(directory,{recursive:true,mode:0o700});}

for(const signals of [['SIGINT'],['SIGINT','SIGINT','SIGTERM'],['SIGHUP','SIGHUP']])test('terminal signal lifecycle '+signals.join('/')+' retains guard through cleanup and allows same-boot restart',{skip:!mac},()=>fixture(async o=>{
 const lockModule=new URL('./persistent-lock.mjs',import.meta.url).href,lifecycleModule=new URL('./persistent-lifecycle.mjs',import.meta.url).href;
 const source=`import {acquireInstanceLock} from ${JSON.stringify(lockModule)};import {installStopHandlers} from ${JSON.stringify(lifecycleModule)};let finish;const done=new Promise(ok=>finish=ok);let stops=0;installStopHandlers(()=>{stops++;finish();});const held=await acquireInstanceLock(${JSON.stringify(o)});console.log('ready');try{await done;}finally{console.log('cleaning');await new Promise(ok=>setTimeout(ok,700));await held.release();console.log('released:'+stops);}`;
 const child=spawn(process.execPath,['--input-type=module','-e',source],{detached:true,stdio:['ignore','pipe','pipe']});let output='';child.stdout.on('data',b=>output+=b);child.stderr.on('data',b=>output+=b);const ended=new Promise(ok=>child.once('exit',(code,signal)=>ok({code,signal})));
 const until=async word=>{const end=Date.now()+15000;while(!output.includes(word)){if(child.exitCode!==null||child.signalCode!==null||Date.now()>end)throw Error('Fixture lifecycle failed: '+output);await new Promise(ok=>setTimeout(ok,10));}};
 try{await until('ready');process.kill(-child.pid,signals[0]);await until('cleaning');for(const signal of signals.slice(1)){process.kill(-child.pid,signal);await new Promise(ok=>setTimeout(ok,30));}await rejected(acquireInstanceLock(o),'LOCK_ACTIVE');assert.deepEqual(await ended,{code:0,signal:null});assert.match(output,/released:1/);await assert.rejects(lstat(path(o)),{code:'ENOENT'});const next=await acquireInstanceLock(o);await next.release();}
 finally{try{process.kill(-child.pid,'SIGKILL');}catch{}await ended;}
}));

test('unconfirmed child exit keeps operation record instead of advertising clean release',{skip:!mac},()=>fixture(async o=>{
 const {ownedChildrenExited}=await import('./persistent-lifecycle.mjs');
 assert.equal(await ownedChildrenExited([{done:Promise.resolve(0)}],20),true);
 assert.equal(await ownedChildrenExited([{done:new Promise(()=>{})}],20),false);
 const lock=await acquireInstanceLock(o),before=await read(o);await lock.release({preserve:true});assert.equal(await read(o),before);await rejected(acquireInstanceLock(o),'LOCK_REBOOT_PROOF_REQUIRED');
}));
