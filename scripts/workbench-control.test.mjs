import test from 'node:test';
import {createServer} from 'node:net';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,writeFile,rm,chmod,lstat,mkdir,readdir} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {randomUUID} from 'node:crypto';
import {serveControl,askControl} from './workbench-control.mjs';
test('private socket validates instance/generation; stale stored PID is never used to signal',async()=>{
 const directory=await mkdtemp(join(tmpdir(),'crm-control-test-')),ctx={root:directory,directory,instanceId:randomUUID(),role:'backend'};let stopped=0;
 const server=await serveControl({...ctx,phase:()=> 'running',onStop:()=>stopped++});const file=join(directory,'backend-control.json'),original=await readFile(file,'utf8');
 try{const record=JSON.parse(original);assert.equal((await lstat(record.socket)).mode&0o777,0o600);assert.equal((await askControl(ctx)).phase,'running');
  await assert.rejects(askControl({...ctx,instanceId:randomUUID()},'stop'),/CONTROL_IDENTITY/);assert.equal(stopped,0);
  await writeFile(file,JSON.stringify({...record,generation:randomUUID()}));await assert.rejects(askControl(ctx,'stop'),/CONTROL_METADATA/);assert.equal(stopped,0);
  await writeFile(file,JSON.stringify({...record,pid:1}));assert.equal((await askControl(ctx)).pid,process.pid);assert.equal(stopped,0);
  await chmod(record.socket,0o666);await assert.rejects(askControl(ctx,'stop'),/CONTROL_UNSAFE/);assert.equal(stopped,0);await chmod(record.socket,0o600);
  await askControl(ctx,'stop');await new Promise(ok=>setImmediate(ok));assert.equal(stopped,1);await askControl(ctx,'stop');assert.equal(stopped,1);
 }finally{await writeFile(file,original);await server.close();assert.equal(await askControl(ctx),null);await rm(directory,{recursive:true,force:true});}
});

test('failed metadata installation closes listener and removes its temporary record',async()=>{
 const directory=await mkdtemp(join(tmpdir(),'crm-control-failure-')),ctx={root:directory,directory,instanceId:randomUUID(),role:'backend'};
 try{await mkdir(join(directory,'backend-control.json'));await assert.rejects(serveControl({...ctx,phase:()=> 'running',onStop:()=>assert.fail('must not stop')}));assert.deepEqual(await readdir(directory),['backend-control.json']);}
 finally{await rm(directory,{recursive:true,force:true});}
});

test('closed control channel is unavailable; nonempty invalid replies still fail closed',async()=>{
 const directory=await mkdtemp(join(tmpdir(),'crm-control-close-')),generation=randomUUID(),socket=`/tmp/crmctl-${generation}.sock`,ctx={root:directory,directory,instanceId:randomUUID(),role:'backend'};
 let response='';const server=createServer(peer=>{peer.on('error',()=>{});peer.on('data',()=>peer.end(response));});
 try{await new Promise((ok,no)=>{server.once('error',no);server.listen(socket,ok);});await chmod(socket,0o600);await writeFile(join(directory,'backend-control.json'),JSON.stringify({...ctx,kind:'crm-control-v1',generation,socket,pid:1}),{mode:0o600});assert.equal(await askControl(ctx),null);response='invalid';await assert.rejects(askControl(ctx),/CONTROL_PROTOCOL/);}
 finally{await new Promise(ok=>server.close(ok));await rm(directory,{recursive:true,force:true});}
});
