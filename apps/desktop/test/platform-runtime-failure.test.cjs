const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),vm=require('node:vm'),{createRequire}=require('node:module');
const file=path.resolve(__dirname,'../src/platform-runtime.cjs'),realRequire=createRequire(file);
function runtime(t,{platform='win32',checkPrivateDirectory,collide=false,failedWrite=false}={}){
 const dir=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'desktop-open-failure-')));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));const operation='owned-test-operation';let spawns=0;
 const shim={...fs,writeFileSync:(...args)=>{if(failedWrite)throw Object.assign(Error('synthetic failure'),{code:'EACCES'});return fs.writeFileSync(...args);}};
 const context={module:{exports:{}},require:name=>name==='node:fs'?shim:name==='node:crypto'?{...require('node:crypto'),randomUUID:()=>operation}:name==='./owned-process.cjs'?{spawnOwned:()=>{spawns++;throw Error('no native process allowed');}}:realRequire(name),process:{platform},AbortSignal,AbortController,URL,Buffer,setTimeout,clearTimeout};
 vm.runInNewContext(fs.readFileSync(file,'utf8'),context,{filename:file});
 const r=new context.module.exports.DesktopPlatformRuntime(dir,{status:()=>({ready:true}),inspect:()=>({})},null,{checkPrivateDirectory});
 if(collide){fs.mkdirSync(path.join(dir,operation));fs.writeFileSync(path.join(dir,operation,'not-owned'),'keep');}
 return {r,dir,operation,spawns:()=>spawns};
}
test('Windows ACL failure cleans only the newly owned directory and releases busy state before any session write or process',async t=>{let checked=0;const f=runtime(t,{checkPrivateDirectory:()=>{checked++;throw Object.assign(Error('synthetic ACL failure'),{code:'ACL_TEST_REJECTED'});}});for(let i=0;i<2;i++){await assert.rejects(()=>f.r.open('LOGIN','synthetic-cookie',new AbortController().signal),/ACL_TEST_REJECTED/);assert.equal(f.r.status().busy,false);assert.deepEqual(fs.readdirSync(f.dir),[]);}assert.equal(checked,2);assert.equal(f.spawns(),0);});
test('missing Windows ACL callback fails closed without permanent busy state',async t=>{const f=runtime(t);await assert.rejects(()=>f.r.open('LOGIN',null,new AbortController().signal),/WINDOWS_ACL_CHECK_REQUIRED/);assert.equal(f.r.status().busy,false);assert.deepEqual(fs.readdirSync(f.dir),[]);assert.equal(f.spawns(),0);});
test('exclusive directory creation failure preserves an existing unrelated path',async t=>{const f=runtime(t,{collide:true,checkPrivateDirectory:()=>{throw Error('must not reach ACL');}});await assert.rejects(()=>f.r.open('LOGIN',null,new AbortController().signal),/EEXIST/);assert.equal(f.r.status().busy,false);assert.equal(fs.readFileSync(path.join(f.dir,f.operation,'not-owned'),'utf8'),'keep');assert.equal(f.spawns(),0);});
test('Mac credential-file write failure releases local state and removes only its own temporary directory',async t=>{const f=runtime(t,{platform:'darwin',failedWrite:true});await assert.rejects(()=>f.r.open('LOGIN','synthetic-cookie',new AbortController().signal),/EACCES/);assert.equal(f.r.status().busy,false);assert.deepEqual(fs.readdirSync(f.dir),[]);assert.equal(f.spawns(),0);});
// 会话目录里记着我们拉起的进程号；对账只看这份事实，不问用户。
function reconciler(t,running){
 const dir=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'desktop-reconcile-')));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
 const context={module:{exports:{}},require:name=>name==='./owned-process.cjs'?{spawnOwned:()=>{throw Error('no native process allowed');}}:realRequire(name),process:{platform:'darwin',kill:pid=>{if(!running.includes(pid))throw Object.assign(Error('gone'),{code:'ESRCH'});}},AbortSignal,AbortController,URL,Buffer,setTimeout,clearTimeout};
 vm.runInNewContext(fs.readFileSync(file,'utf8'),context,{filename:file});
 return {r:new context.module.exports.DesktopPlatformRuntime(dir,{status:()=>({ready:true}),inspect:()=>({})},{},{}),dir};
}
test('leftover sessions are judged by recorded pids, not by asking the user',t=>{
 const dead=reconciler(t,[]),gone=path.join(dead.dir,'gone');
 fs.mkdirSync(gone);fs.writeFileSync(path.join(gone,'.owner.json'),JSON.stringify({helper:4101,child:4102}));
 assert.deepEqual({...dead.r.reconcileProcessState()},{sessions:1,live:0,settled:true});
 assert.equal(fs.existsSync(gone),false);
 const live=reconciler(t,[4102]),alive=path.join(live.dir,'running');
 fs.mkdirSync(alive);fs.writeFileSync(path.join(alive,'.owner.json'),JSON.stringify({helper:4101,child:4102}));
 assert.deepEqual({...live.r.reconcileProcessState()},{sessions:1,live:1,settled:false});
 assert.equal(fs.existsSync(alive),true);
});
