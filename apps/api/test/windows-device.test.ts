import {mkdtemp,mkdir,lstat,readFile,readdir,rm,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {randomBytes,randomUUID,verify} from 'node:crypto';
import {describe,it,expect,vi,afterEach} from 'vitest';
import {LocalDeviceRuntime} from '../src/devices/device-runtime';
import {windowsCall} from '../../../runtime/platform.cjs';
vi.mock('../../../runtime/platform.cjs',async(importOriginal)=>{
 const actual=await importOriginal<typeof import('../../../runtime/platform.cjs')>();
 return {...actual,platformCapability:()=>({os:'Windows',supported:true,adapter:'windows-local-v1',remote:false}),
  privateDirectory:async(p:string,create:boolean)=>{if(create)await mkdir(p,{recursive:true,mode:0o700});await lstat(p);},privateFile:lstat,windowsCall:vi.fn()};
});
const descriptor=Object.getOwnPropertyDescriptor(process,'platform')!;
let directory:string|undefined;
afterEach(async()=>{Object.defineProperty(process,'platform',descriptor);vi.restoreAllMocks();vi.unstubAllEnvs();if(directory)await rm(directory,{recursive:true});directory=undefined;});
async function fixture(){directory=await mkdtemp(join(tmpdir(),'crm-windows-branch-'));const instance=join(directory,'.local/persistent/test');await mkdir(instance,{recursive:true,mode:0o700});vi.stubEnv('CRM_PROJECT_ROOT',directory);vi.stubEnv('CRM_INSTANCE_DIRECTORY',instance);vi.stubEnv('CRM_DEVICE_ID',randomUUID());vi.stubEnv('CRM_DEVICE_MANAGEMENT','1');vi.stubEnv('XHS_ACCOUNT_LOGIN_MODE','real');Object.defineProperty(process,'platform',{value:'win32'});return {runtime:new LocalDeviceRuntime(),instance};}
describe('Windows storage branch simulated on host; NOT a DPAPI native test',()=>{
 it('stores only a ciphertext envelope; after restart proof uses the same protected identity',async()=>{
  const {runtime,instance}=await fixture();let secret='';
  vi.mocked(windowsCall).mockImplementation(r=>{if(r.operation==='protect'){secret=String(r.value);return 'FICTIONAL_ENCRYPTED_BLOB';}if(r.operation==='unprotect'&&r.value==='FICTIONAL_ENCRYPTED_BLOB')return secret;throw Error('unavailable');});
  const identity=await runtime.createIdentity(),file=join(instance,'device-keys',identity.keyId+'.json'),text=await readFile(file,'utf8');
  expect(text).not.toContain('PRIVATE KEY');expect(text).not.toContain(secret);expect(JSON.parse(text)).toMatchObject({protection:'windows-dpapi-current-user',encryptedKey:'FICTIONAL_ENCRYPTED_BLOB'});
  const challenge=randomBytes(32);expect(verify(null,challenge,identity.publicKey,await new LocalDeviceRuntime().prove(identity,challenge))).toBe(true);
  vi.mocked(windowsCall).mockImplementation(()=>{throw Error('different OS user / tampered fixture');});
  await expect(runtime.prove(identity,challenge)).rejects.toThrow();expect(await readFile(file,'utf8')).toBe(text);
 });
 it('encryption failure creates no plaintext file; Windows refuses legacy real private-key files',async()=>{
  const {runtime,instance}=await fixture();vi.mocked(windowsCall).mockImplementation(()=>{throw Error('DPAPI unavailable');});
  await expect(runtime.createIdentity()).rejects.toThrow();expect(await readdir(join(instance,'device-keys'))).toEqual([]);
  const identity={id:runtime.id(),keyId:randomUUID(),publicKey:'fictional-public',provider:'real'};
  await writeFile(join(instance,'device-keys',identity.keyId+'.json'),JSON.stringify({kind:'crm-device-key-v1',...identity,privateKey:'fictional-plaintext'}));
  await expect(runtime.prove(identity,randomBytes(32))).rejects.toThrow('PLAINTEXT_IDENTITY_REJECTED');
 });
});
