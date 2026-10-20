import 'reflect-metadata';
import {beforeAll,beforeEach,afterEach,afterAll,describe,it,expect,vi} from 'vitest';
import {randomUUID} from 'node:crypto';
import {mkdtemp,realpath,mkdir,rm,readdir,unlink} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {Db} from '../src/common/db';
import {LocalDeviceRuntime} from '../src/devices/device-runtime';
import {DeviceService} from '../src/devices/device.service';
import {LoginRuntime} from '../src/accounts/login-runtime';
import {AccountLoginService} from '../src/accounts/account-login.service';
import type {Actor} from '../src/auth/security';
const url=process.env.TEST_DATABASE_URL;if(!url||new URL(url).pathname!=='/crm_test')throw Error('isolated crm_test required');
const db=new Db({datasources:{db:{url}}});let root:string,instance:string,id:string,local:LocalDeviceRuntime,service:DeviceService,login:AccountLoginService,loginRuntime:LoginRuntime,admin:Actor,sales:Actor;const accounts:string[]=[];
const request=()=>({candidateId:id,name:'离线专用 Mac',credentialRoot:local.defaultRoot(),consent:'approve-local-device-v1'});
async function account(){const a=await db.platformAccount.create({data:{platform:'XHS',label:'fictional-device-account'}});accounts.push(a.id);return a;}
const approve=()=>service.approve(admin,request());
beforeAll(async()=>{admin=await db.user.create({data:{email:`device-admin-${randomUUID()}@test.invalid`,name:'离线设备管理员',role:'ADMIN',passwordHash:'fictional'}});sales=await db.user.create({data:{email:`device-sales-${randomUUID()}@test.invalid`,name:'离线销售',role:'SALES',passwordHash:'fictional'}});});
beforeEach(async()=>{id=randomUUID();root=await realpath(await mkdtemp(join(tmpdir(),'crm-device-db-')));instance=join(root,'.local/persistent-offline/test');await mkdir(instance,{recursive:true,mode:0o700});for(const [k,v]of Object.entries({CRM_PROJECT_ROOT:root,CRM_INSTANCE_DIRECTORY:instance,CRM_DEVICE_ID:id,CRM_DEVICE_MANAGEMENT:'1',CRM_PERSISTENT:'1',CRM_RUNTIME_ID:randomUUID(),XHS_ACCOUNT_LOGIN_MODE:'offline',XHS_SESSION_ROOT:join(instance,'legacy')}))vi.stubEnv(k,v);local=new LocalDeviceRuntime();service=new DeviceService(db,local);loginRuntime=new LoginRuntime();login=new AccountLoginService(db,loginRuntime,service);});
afterEach(async()=>{await login.onModuleDestroy();await service.onModuleDestroy();vi.restoreAllMocks();await db.platformAccount.deleteMany({where:{id:{in:accounts.splice(0)}}});await db.executionDevice.deleteMany({where:{id}});await rm(root,{recursive:true});vi.unstubAllEnvs();});
afterAll(async()=>{await db.auditLog.deleteMany({where:{actorId:{in:[admin.id,sales.id]}}});await db.user.deleteMany({where:{id:{in:[admin.id,sales.id]}}});await db.$disconnect();});
describe('execution-device authorization / isolated Mac fake identity',()=>{
 it('admin consent required; sales and forged candidate rejected before key creation',async()=>{await expect(service.approve(sales,request())).rejects.toThrow();await expect(service.approve(admin,{...request(),consent:''})).rejects.toThrow();await expect(service.approve(admin,{...request(),candidateId:randomUUID()})).rejects.toThrow();await expect(service.status(sales)).rejects.toThrow();expect(await readdir(instance)).toEqual([]);});
 it('concurrent approval registers one key and one enabled device',async()=>{const results=await Promise.allSettled([approve(),approve()]);expect(results.filter(x=>x.status==='fulfilled')).toHaveLength(1);expect(await readdir(join(instance,'device-keys'))).toHaveLength(1);expect((await service.status(admin)).device?.online).toBe(true);const d=await db.executionDevice.findUniqueOrThrow({where:{id}});expect(d.publicKey).toContain('PUBLIC KEY');expect(JSON.stringify(d)).not.toContain('PRIVATE KEY');await expect(db.executionDevice.create({data:{...d,id:randomUUID(),keyId:randomUUID()}})).rejects.toThrow();});
 it('forged signature or missing key makes device offline and never dispatches login',async()=>{await approve();const spy=vi.spyOn(loginRuntime,'open');vi.spyOn(local,'prove').mockResolvedValue(Buffer.alloc(64));await service.heartbeat();expect((await service.status(admin)).device?.online).toBe(false);const a=await account();await expect(service.acquire(admin,a.id)).rejects.toThrow();expect((await login.start(admin,a.id,randomUUID(),'local-session-v1')).state).toBe('FAILED');expect(spy).not.toHaveBeenCalled();});
 it('authenticated heartbeat survives restart without generating a new key; missing file cannot be replaced silently',async()=>{await approve();const before=(await service.status(admin)).device!;vi.stubEnv('CRM_RUNTIME_ID',randomUUID());await service.heartbeat();expect((await service.status(admin)).device).toMatchObject({online:true,keyFingerprint:before.keyFingerprint});const d=await db.executionDevice.findUniqueOrThrow({where:{id}});await unlink(join(instance,'device-keys',d.keyId+'.json'));await service.heartbeat();expect((await service.status(admin)).device?.online).toBe(false);expect(await readdir(join(instance,'device-keys'))).toHaveLength(0);});
 it('account execution lease is exclusive and blocks directory changes',async()=>{const state=await approve(),a=await account();const permit=await service.acquire(admin,a.id);await expect(service.acquire(admin,a.id)).rejects.toThrow();await expect(service.changeDirectory(admin,id,state.device!.version,join(local.allowedBase(),'next'))).rejects.toThrow();await permit.release();const next=await service.changeDirectory(admin,id,state.device!.version,join(local.allowedBase(),'next'));expect(next.device?.credentialRoot).toContain('/next');});
 it('directory updates are serialized by version and reject cross-device or sales writes',async()=>{const state=await approve(),v=state.device!.version;await expect(service.changeDirectory(sales,id,v,local.defaultRoot())).rejects.toThrow();await expect(service.changeDirectory(admin,randomUUID(),v,local.defaultRoot())).rejects.toThrow();const result=await Promise.allSettled([service.changeDirectory(admin,id,v,join(local.allowedBase(),'first')),service.changeDirectory(admin,id,v,join(local.allowedBase(),'second'))]);expect(result.filter(x=>x.status==='fulfilled')).toHaveLength(1);});
 it('existing sessions prevent silent root changes or re-enrollment after revocation',async()=>{await approve();const a=await account(),r=await login.start(admin,a.id,randomUUID(),'local-session-v1');expect((await login.simulate(admin,a.id,r.requestKey,'SUCCESS')).state).toBe('VERIFIED');const d=(await service.status(admin)).device!;expect(d.accountCount).toBe(1);await expect(service.changeDirectory(admin,id,d.version,join(local.allowedBase(),'different'))).rejects.toThrow();await service.revoke(admin,id,d.version);await expect(approve()).rejects.toThrow();});
 it('legacy UUID-only and other-device session references are rejected before reading any session',async()=>{await approve();const a=await account();await db.accountSessionReference.create({data:{accountId:a.id,deviceId:id,sessionKey:randomUUID(),provider:'offline'}});const inspect=vi.spyOn(loginRuntime,'inspect');await expect(login.verifySaved(admin,a.id,'read-local-session-v1')).rejects.toThrow();expect(inspect).not.toHaveBeenCalled();await db.accountSessionReference.update({where:{accountId:a.id},data:{deviceId:randomUUID()}});await expect(service.acquire(admin,a.id)).rejects.toThrow();});
 it('revocation aborts an in-flight QR job and prevents any later verified binding',async()=>{await approve();const a=await account(),r=await login.start(admin,a.id,randomUUID(),'local-session-v1');expect(r.state).toBe('WAITING');const d=(await service.status(admin)).device!;await service.revoke(admin,id,d.version);for(let n=0;n<30;n++){if((await db.accountLogin.findUniqueOrThrow({where:{id:r.id}})).state==='CANCELLED')break;await new Promise(ok=>setTimeout(ok,10));}expect((await db.accountLogin.findUniqueOrThrow({where:{id:r.id}})).state).toBe('CANCELLED');expect(await db.accountSessionReference.findUnique({where:{accountId:a.id}})).toBeNull();expect((await service.status(admin)).device?.online).toBe(false);await expect(service.acquire(admin,a.id)).rejects.toThrow();});
 it('revocation cancels a dispatch while its database reservation is still pending',async()=>{await approve();const a=await account(),d=(await service.status(admin)).device!;let release!:()=>void,locked!:()=>void;const holding=new Promise<void>(ok=>{locked=ok;});const blocker=db.$transaction(async tx=>{await tx.$queryRaw`SELECT 1 FROM pg_advisory_xact_lock(31174029)`;locked();await new Promise<void>(ok=>{release=ok;});});await holding;const pending=service.acquire(admin,a.id);const revoke=service.revoke(admin,id,d.version);release();await blocker;const results=await Promise.allSettled([pending,revoke]);if(results[0].status==='fulfilled'){expect(results[0].value.signal.aborted).toBe(true);await results[0].value.release();}expect((await service.status(admin)).device?.enabled).toBe(false);});
 it('revoked or expired execution permit cannot commit; audit never contains private key material',async()=>{await approve();const a=await account(),permit=await service.acquire(admin,a.id);await db.deviceExecutionLease.update({where:{accountId:a.id},data:{expiresAt:new Date(0)}});await expect(db.$transaction(tx=>service.assertPermit(tx,permit))).rejects.toThrow();await permit.release();const audit=JSON.stringify(await db.auditLog.findMany({where:{actorId:admin.id}}));expect(audit).not.toContain('PRIVATE KEY');expect(audit).not.toContain('cookies.json');});
});

describe('one-click binding / isolated fixtures',()=>{
 const bind=()=>service.bind(admin,{candidateId:id,consent:'bind-local-device-v1'});
 it('admin and explicit button consent are mandatory before any key exists',async()=>{
  await expect(service.bind(sales,{candidateId:id,consent:'bind-local-device-v1'})).rejects.toMatchObject({status:403});
  await expect(service.bind(admin,{candidateId:id,consent:''})).rejects.toThrow();
  await expect(service.bind(admin,{candidateId:randomUUID(),consent:'bind-local-device-v1'})).rejects.toThrow();
  expect(await readdir(instance)).toEqual([]);
 });
 it('concurrent/repeated binds reuse exactly one identity and approval audit',async()=>{
  const results=await Promise.all([bind(),bind()]);expect(results[0].device?.keyFingerprint).toBe(results[1].device?.keyFingerprint);
  expect(await readdir(join(instance,'device-keys'))).toHaveLength(1);
  expect(await db.auditLog.count({where:{actorId:admin.id,entityId:id,action:'DEVICE_APPROVED'}})).toBe(1);
  expect((await db.auditLog.findFirstOrThrow({where:{actorId:admin.id,entityId:id,action:'DEVICE_APPROVED'}})).metadata).toMatchObject({consentVersion:'bind-local-device-v1'});
  expect(results[0].device?.credentialRoot).toBe(local.defaultRoot());
  expect(results[0].binding).toMatchObject({version:1,keyProtection:'offline-fixture'});
 });
 it('restart reauthenticates the original key; unavailable identity cannot be overwritten by retry',async()=>{
  const before=(await bind()).device!;vi.stubEnv('CRM_RUNTIME_ID',randomUUID());
  const after=(await bind()).device!;expect(after).toMatchObject({online:true,keyFingerprint:before.keyFingerprint,version:before.version});
  vi.spyOn(local,'prove').mockRejectedValue(Error('locked'));
  await expect(bind()).rejects.toThrow('无法认证');expect(await readdir(join(instance,'device-keys'))).toHaveLength(1);
  vi.restoreAllMocks();expect((await bind()).device?.keyFingerprint).toBe(before.keyFingerprint);
 });
 it('failed creation rolls back binding and a later explicit retry can recover',async()=>{
  const create=vi.spyOn(local,'createIdentity').mockRejectedValueOnce(Error('unavailable'));
  await expect(bind()).rejects.toThrow();expect(await db.executionDevice.findUnique({where:{id}})).toBeNull();
  expect((await bind()).device?.online).toBe(true);expect(create).toHaveBeenCalledTimes(2);
 });
 it('revoked references still prevent silent re-binding through the simplified endpoint',async()=>{
  await bind();const a=await account(),attempt=await login.start(admin,a.id,randomUUID(),'local-session-v1');await login.simulate(admin,a.id,attempt.requestKey,'SUCCESS');
  await service.revoke(admin,id,(await service.status(admin)).device!.version);
  await expect(bind()).rejects.toThrow('已有会话引用');
 });
});
