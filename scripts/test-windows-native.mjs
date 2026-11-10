// Run on native Windows 11 x64 only, using a brand-new test directory and fake key.
import assert from 'node:assert/strict';
import {randomBytes,randomUUID} from 'node:crypto';
import {writeFile,readFile,rm,lstat,symlink} from 'node:fs/promises';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
import platform from './desktop/platform-support/platform.cjs';
if(process.platform!=='win32'){console.log('SKIP: Windows native DPAPI/ACL/Job tests require Windows 11 x64; no Windows success claimed.');process.exit(0);}
const parent=platform.windowsDataRoot(),directory=join(parent,`crm-windows-test-${randomUUID()}`),deviceId=randomUUID(),keyId=randomUUID();
const call=(operation,value)=>platform.windowsCall({operation,deviceId,keyId,value});
await platform.privateDirectory(directory,true);
let supervised;
try{
 const secret=randomBytes(64).toString('base64'),encrypted=call('protect',secret);assert.notEqual(encrypted,secret);
 const file=join(directory,'fake-key.json');await writeFile(file,JSON.stringify({encrypted}),{flag:'wx'});await platform.privateFile(file);
 assert(!(await readFile(file,'utf8')).includes(secret));assert.equal(call('unprotect',JSON.parse(await readFile(file,'utf8')).encrypted),secret);
 assert.throws(()=>platform.windowsCall({operation:'unprotect',deviceId,keyId:randomUUID(),value:encrypted}));
 assert.throws(()=>call('unprotect',Buffer.from('tampered fictional ciphertext').toString('base64')));
 const target=join(directory,'target');await platform.privateDirectory(target,true);
 const junction=join(directory,'junction');await symlink(target,junction,'junction');await assert.rejects(platform.privateDirectory(junction));await rm(junction);
 const unsafe=join(directory,'unsafe');await platform.privateDirectory(unsafe,true);
 const system=process.env.SystemRoot||process.env.SYSTEMROOT;
 const acl=spawnSync(join(system,'System32','icacls.exe'),[unsafe,'/grant','*S-1-1-0:(OI)(CI)R'],{stdio:'ignore'});assert.equal(acl.status,0,'only fixture directory ACL changed');
 await assert.rejects(platform.privateDirectory(unsafe),'unexpected user access must be rejected');
 // The fixture creates one child and one grandchild. Closing the supervisor must kill both.
 const script=join(directory,'fixture.cjs'),pidFile=join(directory,'pids.json');
 await writeFile(script,`const fs=require('node:fs'),cp=require('node:child_process');const child=cp.spawn(process.execPath,['-e','setInterval(()=>{},1000)'],{stdio:'ignore'});fs.writeFileSync(process.argv[2],JSON.stringify([process.pid,child.pid]));setInterval(()=>{},1000);`);
 const child=supervised=platform.spawnOwned(process.execPath,[script,pidFile],{cwd:directory,env:platform.minimalEnvironment()});child.on('error',()=>{});
 let pids;for(let n=0;n<100;n++){try{pids=JSON.parse(await readFile(pidFile,'utf8'));break;}catch{}await new Promise(ok=>setTimeout(ok,100));}
 assert(pids,'supervised fixture must launch');platform.stopOwned(child);
 for(let n=0;n<100&&pids.some(pid=>{try{process.kill(pid,0);return true;}catch{return false;}});n++)await new Promise(ok=>setTimeout(ok,50));
 for(const pid of pids)assert.throws(()=>process.kill(pid,0),'owned descendants terminated');
 console.log('PASS: fictional DPAPI persisted round-trip, entropy mismatch/tamper refusal, private ACL, unsafe ACL/junction refusal and owned child/grandchild termination. Cross-user refusal and real MCP still require the documented manual validation.');
}finally{if(supervised){platform.stopOwned(supervised);await new Promise(ok=>setTimeout(ok,500));}await rm(directory,{recursive:true});}
