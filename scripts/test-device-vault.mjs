// Real macOS Keychain APIs, exclusively in a new temporary keychain with fake data.
import { spawnSync } from 'node:child_process';
import { mkdtemp, realpath, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes, randomUUID } from 'node:crypto';
import assert from 'node:assert/strict';
if(process.platform!=='darwin'||process.arch!=='arm64'){console.log('SKIP: macOS ARM64 native keychain test; other executors not verified');process.exit(0);}
const root=fileURLToPath(new URL('../',import.meta.url)),directory=await realpath(await mkdtemp(join(tmpdir(),'crm-vault-test-')));
const testPath=join(directory,'fixture.keychain-db'),testPassword=randomBytes(32).toString('hex');
const deviceId=randomUUID(),keyId=randomUUID(),value=randomBytes(64).toString('base64');
const run=(operation,extra={})=>spawnSync(join(root,'apps/api/dist/native/device-vault'),['--isolated-test'],{input:JSON.stringify({operation,testPath,deviceId,keyId,...extra}),encoding:'utf8',timeout:15000});
let created=false;
try{
 const init=run('init-test',{testPassword});assert.equal(init.status,0,'isolated keychain creation: '+init.stderr);created=true;
 assert.equal(run('put',{value}).status,0,'store fictional key');
 assert.equal(spawnSync(process.execPath,['scripts/build-device-vault.mjs'],{cwd:root,stdio:'ignore',timeout:30000}).status,0,'normal restart reuses unchanged helper');
 assert.equal(JSON.parse(run('get').stdout).value,value,'read after a separate process restart');
 assert.notEqual(run('put',{value}).status,0,'duplicate item cannot replace prior key');
 assert.notEqual(run('get',{keyId:randomUUID()}).status,0,'wrong key cannot authenticate');
 assert.equal(run('lock-test').status,0);assert.notEqual(run('get').status,0,'locked keychain fails closed without prompts');
 assert.equal(run('unlock-test',{testPassword}).status,0);assert.equal(JSON.parse(run('get').stdout).value,value,'recover original key without rotation');
 console.log('PASS: native temporary Keychain store, restart, duplicate rejection, wrong identity, lock and recovery; no default keychain access.');
} finally {
 if(created)assert.equal(run('delete-test').status,0,'delete only the owned temporary keychain');
 await rm(directory,{recursive:true});
}
