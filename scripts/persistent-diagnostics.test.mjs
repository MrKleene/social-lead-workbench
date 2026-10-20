import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,rm,lstat,chmod} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve,delimiter} from 'node:path';
import {randomUUID} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {spawn} from 'node:child_process';
import {createDocker,StartupError,diagnostic,diagnosticText,saveDiagnostic} from './persistent-diagnostics.mjs';
const root=resolve(fileURLToPath(new URL('../',import.meta.url)));
const secret='FICTIONAL_DO_NOT_LOG_PASSWORD_COOKIE_TOKEN';
const result=(stderr,status=1,error)=>({stderr,stdout:'',status,error});
const client=r=>createDocker({},()=>r);
const fails=(fn,code)=>assert.throws(fn,e=>e.code===code);
test('missing CLI, denied access and timeout have separate safe reasons',()=>{
 fails(()=>client(result(secret,null,{code:'ENOENT'})).ready(),'DOCKER_CLI_MISSING');
 fails(()=>client(result('permission denied '+secret)).ready(),'DOCKER_PERMISSION_DENIED');
 fails(()=>client(result(secret,null,{code:'ETIMEDOUT'})).ready(),'DOCKER_TIMEOUT');
});
test('unreachable daemon is diagnosed before images; raw endpoint/secret never exposed',()=>{
 const calls=[];const docker=createDocker({},(_cmd,args)=>{calls.push(args);return result('Cannot connect to Docker daemon '+secret);});let error;try{docker.ready();docker.image('postgres:17');}catch(e){error=e;}
 assert.equal(error.code,'DOCKER_DAEMON_UNAVAILABLE');assert.deepEqual(calls,[['info','--format','{{.ServerVersion}}']]);assert(!diagnosticText(diagnostic(error,'docker')).includes(secret));
});
test('missing local images are distinct from unreachable daemon, with no pull',()=>{
 fails(()=>client(result('Error: No such image: postgres:17')).image('postgres:17'),'POSTGRES_IMAGE_MISSING');
 fails(()=>client(result('Error: No such image: redis:7-alpine')).image('redis:7-alpine'),'REDIS_IMAGE_MISSING');
 fails(()=>client(result('Cannot connect to daemon; No such image '+secret)).image('postgres:17'),'DOCKER_DAEMON_UNAVAILABLE');
});
test('resource absence is accepted only for explicit matching missing-resource responses',()=>{
 assert.equal(client(result('Error: No such volume: fixture')).exists('volume','fixture'),false);
 assert.equal(client(result('Error: No such container: fixture')).exists('container','fixture'),false);
 assert.equal(client(result('Error: No such object: fixture')).exists('container','fixture'),false);
 assert.equal(client({status:0,stdout:'[]'}).exists('container','fixture'),true);
 fails(()=>client(result('unknown '+secret)).exists('volume','fixture'),'DOCKER_INSPECT_FAILED');
 fails(()=>client(result('Cannot connect to daemon '+secret)).exists('volume','fixture'),'DOCKER_DAEMON_UNAVAILABLE');
 fails(()=>client(result('permission denied; No such volume')).exists('volume','fixture'),'DOCKER_PERMISSION_DENIED');
});
test('docker context and command failures retain only fixed codes and numeric exits',()=>{
 fails(()=>client(result('context private-name not found '+secret)).ready(),'DOCKER_CONTEXT_UNAVAILABLE');
 try{client(result(secret,17)).execute(['start','fictional'],{POSTGRES_PASSWORD:secret});assert.fail();}catch(e){assert.equal(e.code,'DOCKER_OPERATION_FAILED');assert.equal(e.exitCode,17);assert(!e.message.includes(secret));}
});
test('unknown messages, prototypes, database URLs and extra properties cannot leak',()=>{
 for(const message of [secret,'postgresql://user:'+secret+'@host/db','__proto__','toString']){const e=Error(message);e.code=message;const report=diagnostic(e,secret);assert.equal(report.code,'STARTUP_FAILED');assert.equal(report.stage,'local');assert(!JSON.stringify(report).includes(secret));}
 const e=Error(secret);e.code='P1000';assert.equal(diagnostic(e,'admin').code,'DATABASE_AUTH_FAILED');assert.equal(diagnostic(Error('Resource ownership mismatch'),'volumes').code,'RESOURCE_OWNERSHIP_MISMATCH');
 assert.equal(diagnostic(new StartupError('SERVICE_EXITED',0),'services').exitCode,0);
});
test('persisted failure record whitelists fields, stays private, and replaces only its own file',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'crm-diagnostic-test-'));try{await saveDiagnostic(dir,{code:'DOCKER_DAEMON_UNAVAILABLE',stage:'docker',exitCode:1,message:secret,stderr:secret,env:{password:secret}});const file=join(dir,'last-failure.json'),text=await readFile(file,'utf8');assert(!text.includes(secret));assert.equal(JSON.parse(text).code,'DOCKER_DAEMON_UNAVAILABLE');assert.equal((await lstat(file)).mode&0o077,0);await saveDiagnostic(dir,{code:secret,stage:secret});assert.equal(JSON.parse(await readFile(file)).code,'STARTUP_FAILED');}finally{await rm(dir,{recursive:true});}
});
for(const scenario of ['daemon','image'])test('launcher '+scenario+' failure is concrete, secret-free, unlocks and preserves original fixture',{skip:process.platform!=='darwin'},async()=>{
 const name='acceptance-'+randomUUID(),directory=join(root,'.local/persistent-offline',name),bin=await mkdtemp(join(tmpdir(),'crm-fake-docker-'));await mkdir(directory,{recursive:true,mode:0o700});
 const actionFile=join(bin,'calls.jsonl'),docker=join(bin,'docker');
 const script=`#!${process.execPath}\nconst fs=require('node:fs');fs.appendFileSync(${JSON.stringify(actionFile)},JSON.stringify(process.argv.slice(2))+'\\n');if(${JSON.stringify(scenario)}==='image'&&process.argv[2]==='info'){console.log('fictional-version');process.exit(0);}console.error((${JSON.stringify(scenario)}==='daemon'?'Cannot connect to Docker daemon ':'No such image: postgres:17 ')+${JSON.stringify(secret)});process.exit(1);`;
 await writeFile(docker,script,{mode:0o700});await chmod(docker,0o700);
 const manifest=JSON.stringify({kind:'crm-persistent-v1',root,name,mode:'offline',fixture:true,id:randomUUID(),deviceId:randomUUID(),apiPort:61431,webPort:61432});await writeFile(join(directory,'instance.json'),manifest,{mode:0o600});
 try{
  const child=spawn(process.execPath,['scripts/dev-persistent.mjs','--offline','--test-fixture','--instance',name],{cwd:root,env:{...process.env,PATH:bin+delimiter+process.env.PATH},stdio:['ignore','pipe','pipe']});let output='';child.stdout.on('data',b=>output+=b);child.stderr.on('data',b=>output+=b);const code=await new Promise((ok,no)=>{child.once('exit',ok);child.once('error',no);});assert.equal(code,1,output);const expected=scenario==='daemon'?'DOCKER_DAEMON_UNAVAILABLE':'POSTGRES_IMAGE_MISSING';assert(output.includes(expected),output);assert(!output.includes(secret));assert(!output.includes('本地步骤：'));assert(output.includes('本次没有启动或停止业务进程/容器'));assert.equal(await readFile(join(directory,'instance.json'),'utf8'),manifest);
  const record=await readFile(join(directory,'last-failure.json'),'utf8');assert(!record.includes(secret));assert.equal(JSON.parse(record).code,expected);await assert.rejects(lstat(join(directory,'operation.lock')),{code:'ENOENT'});await assert.rejects(lstat(join(directory,'secret.json')),{code:'ENOENT'});
  const calls=(await readFile(actionFile,'utf8')).trim().split('\n').map(x=>JSON.parse(x));assert.deepEqual(calls,scenario==='daemon'?[['info','--format','{{.ServerVersion}}']]:[['info','--format','{{.ServerVersion}}'],['image','inspect','--format','{{.Id}}','postgres:17']]);
 }finally{await rm(directory,{recursive:true});await rm(bin,{recursive:true});}
});
