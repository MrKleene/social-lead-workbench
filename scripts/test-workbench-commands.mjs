// Real isolated offline instance. Never addresses main, real accounts, production vault or external LLM.
import {spawn,spawnSync} from 'node:child_process';
import {mkdtemp,readFile,writeFile,mkdir,rm,lstat} from 'node:fs/promises';
import {realpathSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {fileURLToPath} from 'node:url';
import {randomUUID,createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import {PrismaClient} from '@prisma/client';
import vault from '../runtime/model-vault.cjs';
import {askControl} from './workbench-control.mjs';
const root=resolve(fileURLToPath(new URL('../',import.meta.url))),name='acceptance-'+randomUUID(),directory=join(root,'.local/persistent-offline',name),out=await mkdtemp(join(tmpdir(),'crm-command-tests-'));
const options=['--offline','--test-fixture','--instance',name];let m,db,bootstrap,front;const checks=[];
const mark=s=>{checks.push(s);console.log('PASS '+s);};
const pause=ms=>new Promise(ok=>setTimeout(ok,ms));
async function until(fn,timeout=90000){const end=Date.now()+timeout;while(Date.now()<end){if(await fn())return;await pause(100);}throw Error('Fixture timeout');}
function spawnNode(args){const child=spawn(process.execPath,args,{cwd:root,env:process.env,detached:true,stdio:['ignore','pipe','pipe']});let log='';child.stdout.on('data',b=>log+=b);child.stderr.on('data',b=>log+=b);child.done=new Promise(ok=>child.once('exit',code=>ok(code)));return {child,get log(){return log;}};}
async function cli(command,expected=0){const p=spawnNode(['scripts/workbench.mjs',command,...options]);let timer;try{const code=await Promise.race([p.child.done,new Promise((_,no)=>timer=setTimeout(()=>no(Error('CLI timeout')),120000))]);await writeFile(join(out,command+'-'+randomUUID()+'.log'),p.log,{mode:0o600});assert.equal(code,expected,p.log);return p.log;}finally{clearTimeout(timer);}}
function docker(args,input){const r=spawnSync('docker',args,{input,encoding:'utf8',timeout:30000});assert.equal(r.status,0,'fixture Docker '+args[0]);return r.stdout.trim();}
const api=()=>fetch(`http://127.0.0.1:${m.apiPort}/api/health/ready`,{signal:AbortSignal.timeout(1000)}).then(r=>r.ok).catch(()=>false);
const ctl=role=>askControl({root,directory,instanceId:m.id,role});
try{
 bootstrap=spawnNode(['scripts/dev-persistent.mjs',...options,'--backend']);await until(()=>bootstrap.log.includes('PERSISTENT OFFLINE workbench:'));
 m=JSON.parse(await readFile(join(directory,'instance.json'),'utf8'));assert.equal(m.fixture,true);assert.equal(m.database,'crm_persistent_test');assert.equal(m.name,name);await until(api);
 const secret=JSON.parse(await readFile(join(directory,'secret.json'),'utf8'));db=new PrismaClient({datasources:{db:{url:`postgresql://crm:${secret.databasePassword}@127.0.0.1:${m.postgres.port}/crm_persistent_test`}}});
 const home=join(directory,'test-vault-home');await mkdir(join(home,'Library','Application Support'),{recursive:true});const keyFile=vault.vaultPath(m.id,realpathSync(home));vault.initialize(keyFile);const box=vault.encrypt(keyFile,'qwen-comment-matching','FAKE-ISOLATED-ONLY-KEY-123456');
 await db.modelSettings.create({data:{id:'qwen-comment-matching',model:'qwen3.8-flash',dailyLimit:1,priceVersion:'beijing-2026-10-21',consent:false,note:'虚构配置跨启停保留',encryptedKey:box}});
 const config=await db.collectionConfig.create({data:{name:'虚构命令保留测试',platform:'XHS',mode:'MOCK',keywords:['fictional'],excludeWords:[],enabled:false}});
 const keyHash=createHash('sha256').update(await readFile(keyFile)).digest('hex'),secretHash=createHash('sha256').update(await readFile(join(directory,'secret.json'))).digest('hex');
 const started={};for(const k of ['postgres','redis'])started[k]=docker(['inspect','--format','{{.State.StartedAt}}',m[k].container]);
 await cli('stop');assert.equal(await bootstrap.child.done,0);bootstrap=null;mark('stop existing supervised backend through private control channel');
 await cli('start');const one=await ctl('backend'),webOne=await ctl('web');assert.equal(one.phase,'running');assert.equal(webOne.phase,'running');assert(await api());
 const again=await cli('start');assert.match(again,/已运行/);assert.equal((await ctl('backend')).generation,one.generation);assert.equal((await ctl('web')).generation,webOne.generation);mark('start + duplicate start preserve one backend and one frontend');
 const concurrent=await Promise.allSettled([cli('start'),cli('start')]);assert(concurrent.some(r=>r.status==='fulfilled'));assert.equal((await ctl('backend')).generation,one.generation);mark('concurrent command serialization does not duplicate workers');
 await cli('stop');assert.equal(await ctl('backend'),null);assert.equal(await ctl('web'),null);await cli('start');assert.notEqual((await ctl('backend')).generation,one.generation);mark('start-stop-start immediately recovers both services');
 const before=await ctl('backend');await cli('restart');assert.notEqual((await ctl('backend')).generation,before.generation);assert(await api());mark('restart waits for supervised group lease release then starts');
 // Stop only the fixture web through its owned channel, then exercise the real npm dev Ctrl+C path.
 const previousWeb=(await ctl('web')).generation;
 front=spawn('npm',['run','dev','--',...options],{cwd:root,env:process.env,detached:true,stdio:'ignore'});front.done=new Promise(ok=>front.once('exit',ok));await until(async()=>{try{return (await ctl('web'))?.generation!==previousWeb&&!!await ctl('web')&&(await fetch(`http://127.0.0.1:${m.webPort}`)).ok;}catch{return false;}});
 const unchanged=(await ctl('backend')).generation;process.kill(-front.pid,'SIGINT');await front.done;front=null;await until(async()=>!await ctl('web'));assert(await api());assert.equal((await ctl('backend')).generation,unchanged);mark('npm run dev replaces only managed frontend; Ctrl+C leaves backend and DB running');
 await cli('start');assert.equal((await ctl('backend')).generation,unchanged);assert.equal((await db.collectionConfig.findUniqueOrThrow({where:{id:config.id}})).name,config.name);assert.equal((await db.modelSettings.findUniqueOrThrow({where:{id:'qwen-comment-matching'}})).note,'虚构配置跨启停保留');assert.equal(createHash('sha256').update(await readFile(keyFile)).digest('hex'),keyHash);assert.equal(vault.decrypt(keyFile,'qwen-comment-matching',box),'FAKE-ISOLATED-ONLY-KEY-123456');assert.equal(createHash('sha256').update(await readFile(join(directory,'secret.json'))).digest('hex'),secretHash);
 for(const k of ['postgres','redis']){assert.equal(docker(['inspect','--format','{{.State.StartedAt}}',m[k].container]),started[k]);assert.equal(docker(['volume','inspect','--format','{{index .Labels "crm.persistent.instance"}}',m[k].volume]),m.id);}mark('DB containers/volumes, fictional config, DB credential and isolated vault bytes retained');
 assert.equal(await db.collectionRun.count(),0);assert.equal(await db.semanticModelCall.count(),0);assert.equal(await db.contactAttempt.count(),0);mark('zero collection/model/contact records; no platform login or real credentials used');
 const status=await cli('status');assert.match(status,/"healthy": true/);assert(!status.includes('FAKE-ISOLATED'));await cli('stop');await cli('stop');mark('status shows safe health only; repeated stop is idempotent');
 console.log('PASS '+checks.length+' command lifecycle checks');
}finally{
 if(front){process.kill(-front.pid,'SIGINT');await front.done;}
 if(m){await cli('stop').catch(()=>{});await db?.$disconnect();const active=await Promise.all(['backend','web'].map(ctl));assert(active.every(x=>x===null),'Refuse cleanup with owned services active');for(const k of ['redis','postgres']){assert.equal(docker(['inspect','--format','{{index .Config.Labels "crm.persistent.instance"}}',m[k].container]),m.id);docker(['rm','--force',m[k].container]);docker(['volume','rm',m[k].volume]);}await rm(directory,{recursive:true,force:true});}
 else if(bootstrap){bootstrap.child.kill('SIGINT');await bootstrap.child.done;}
 await writeFile(join(out,'checks.json'),JSON.stringify({checks,isolated:true,productionUnchanged:true},null,2));console.log('Evidence: '+out);
}
