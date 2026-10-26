import 'reflect-metadata';
import {beforeAll,afterAll,beforeEach,afterEach,it,expect,vi,type Mock} from 'vitest';
import {randomUUID} from 'node:crypto';
import {Db} from '../src/common/db';
import {LoginRuntime,type SessionDriver} from '../src/accounts/login-runtime';
import {AccountLoginService} from '../src/accounts/account-login.service';
import {sessionFresh,sessionHealth,sessionTtlMs} from '../src/accounts/session-health';
import type {Actor} from '../src/auth/security';
const url=process.env.TEST_DATABASE_URL;if(!url||new URL(url).pathname!=='/crm_test')throw Error('isolated crm_test required');
const db=new Db({datasources:{db:{url}}});let admin:Actor,accountId:string,runtime:LoginRuntime,service:AccountLoginService;
let status:Mock<SessionDriver['status']>,stop:Mock<SessionDriver['stop']>;
const device=randomUUID(),runtimeId=randomUUID(),ids:string[]=[],configs:string[]=[];
beforeAll(async()=>{admin=await db.user.create({data:{email:`session-check-${randomUUID()}@test.invalid`,name:'合成检查管理员',role:'ADMIN',passwordHash:'synthetic-only'}});});
beforeEach(async()=>{
 vi.stubEnv('CRM_PERSISTENT','1');vi.stubEnv('XHS_ACCOUNT_LOGIN_MODE','offline');vi.stubEnv('CRM_RUNTIME_ID',runtimeId);vi.stubEnv('CRM_DEVICE_ID',device);
 runtime=new LoginRuntime();service=new AccountLoginService(db,runtime);const key=randomUUID();
 const a=await db.platformAccount.create({data:{platform:'XHS',label:'合成账号',loginProvider:'offline',loginSessionKey:key,loginPlatformUserId:'fixture-identity',status:'PAUSED',pauseReason:'登录已验证；只读采集须逐次确认，发送禁用',sessionReference:{create:{deviceId:device,sessionKey:key,provider:'offline'}}}});accountId=a.id;ids.push(a.id);
 status=vi.fn().mockResolvedValue({loggedIn:true,userId:'fixture-identity'});stop=vi.fn().mockResolvedValue(undefined);
 vi.spyOn(runtime,'inspect').mockResolvedValue('UNVERIFIED');vi.spyOn(runtime,'openSaved').mockResolvedValue({qr:vi.fn(()=>{throw Error('QR forbidden');}),status,stop});
});
afterEach(async()=>{await service.onModuleDestroy();await db.platformAccount.updateMany({where:{id:accountId},data:{loginPlatformUserId:null}});vi.restoreAllMocks();vi.unstubAllEnvs();});
afterAll(async()=>{await db.collectionRun.deleteMany({where:{configId:{in:configs}}});await db.collectionConfig.deleteMany({where:{id:{in:configs}}});await db.auditLog.deleteMany({where:{actorId:admin.id}});await db.platformAccount.deleteMany({where:{id:{in:ids}}});await db.user.delete({where:{id:admin.id}});await db.$disconnect();});
const check=()=>service.checkSavedForCollection(admin,accountId);
it('merges double clicks, reuses fresh results after UI refresh and persists verification',async()=>{
 let release!:(value:{loggedIn:boolean;userId?:string})=>void;status.mockImplementationOnce(()=>new Promise(ok=>{release=ok;}));
 const first=check(),second=check();while(!release)await new Promise(ok=>setTimeout(ok,1));release({loggedIn:true,userId:'fixture-identity'});
 expect((await Promise.all([first,second])).map(x=>x.state)).toEqual(['VERIFIED','VERIFIED']);expect(status).toHaveBeenCalledOnce();
 expect(await check()).toMatchObject({state:'VERIFIED',cached:true});expect(status).toHaveBeenCalledOnce();expect(stop).toHaveBeenCalledOnce();
 expect(sessionFresh(await db.accountSessionReference.findUnique({where:{accountId}}),runtimeId)).toBe(true);
});
it.each([{response:{loggedIn:false},state:'EXPIRED'},{response:{loggedIn:true},state:'NEEDS_REVIEW'},{response:{loggedIn:true,userId:'someone-else'},state:'NEEDS_REVIEW'}])('classifies $state without changing credentials',async({response,state})=>{
 const before=await db.platformAccount.findUniqueOrThrow({where:{id:accountId}});status.mockResolvedValue(response);expect((await check()).state).toBe(state);await check();expect(status).toHaveBeenCalledOnce();const after=await db.platformAccount.findUniqueOrThrow({where:{id:accountId}});expect(after.loginSessionKey).toBe(before.loginSessionKey);expect(after.version).toBe(before.version);
});
it.each(['PLATFORM_UNAVAILABLE','INVALID_STATUS','TIMEOUT'])('network/unknown %s remains unconfirmed, preserves last verification and backs off',async code=>{
 const past=new Date(Date.now()-sessionTtlMs-1000);await db.accountSessionReference.update({where:{accountId},data:{state:'VERIFIED',verifiedAt:past,checkedRuntimeId:runtimeId}});status.mockRejectedValue(Error(code));expect((await check()).state).toBe('CONNECTION_ERROR');await check();expect(status).toHaveBeenCalledOnce();const ref=await db.accountSessionReference.findUniqueOrThrow({where:{accountId}});expect(ref.verifiedAt).toEqual(past);expect(sessionFresh(ref,runtimeId)).toBe(false);expect(sessionHealth(ref,runtimeId).checkable).toBe(false);expect(ref.checkingUntil!.getTime()-Date.now()).toBeLessThanOrEqual(30_000);
});
it.each(['RATE_LIMITED','RESTRICTED'])('platform %s stops without changing accounts or retrying',async code=>{status.mockRejectedValue(Error(code));expect((await check()).state).toBe(code);await check();expect(status).toHaveBeenCalledOnce();expect((await db.accountSessionReference.findUniqueOrThrow({where:{accountId}})).checkingUntil!.getTime()-Date.now()).toBeGreaterThan(290_000);expect((await db.accountSessionReference.findUniqueOrThrow({where:{accountId}})).checkingUntil!.getTime()-Date.now()).toBeLessThanOrEqual(300_000);});
it('restart preserves historical proof but requires one new bounded probe',async()=>{
 await check();await db.accountSessionReference.update({where:{accountId},data:{checkingUntil:null}});await service.onModuleInit();const ref=await db.accountSessionReference.findUniqueOrThrow({where:{accountId}});expect(ref.state).toBe('VERIFIED');expect(ref.verifiedAt).not.toBeNull();expect(sessionFresh(ref,runtimeId)).toBe(false);expect(status).toHaveBeenCalledOnce();expect((await check()).state).toBe('VERIFIED');expect(status).toHaveBeenCalledTimes(2);
});
it('reuses a 29-minute proof and rechecks at the 30-minute boundary',async()=>{
 const verifiedAt=new Date('2026-01-01T00:00:00.000Z'),ref={state:'VERIFIED',checkedRuntimeId:runtimeId,verifiedAt};
 expect(sessionFresh(ref,runtimeId,verifiedAt.getTime()+29*60_000)).toBe(true);
 expect(sessionFresh(ref,runtimeId,verifiedAt.getTime()+30*60_000-1)).toBe(true);
 expect(sessionFresh(ref,runtimeId,verifiedAt.getTime()+30*60_000)).toBe(false);
 expect(sessionHealth(ref,runtimeId,verifiedAt.getTime()+29*60_000).freshUntil?.toISOString()).toBe('2026-01-01T00:30:00.000Z');
 await db.accountSessionReference.update({where:{accountId},data:{state:'VERIFIED',checkedRuntimeId:runtimeId,verifiedAt:new Date(Date.now()-29*60_000),checkingUntil:null}});
 expect(await check()).toMatchObject({state:'VERIFIED',cached:true});expect(status).not.toHaveBeenCalled();
 await db.accountSessionReference.update({where:{accountId},data:{verifiedAt:new Date(Date.now()-30*60_000)}});
 expect((await check()).state).toBe('VERIFIED');expect(status).toHaveBeenCalledOnce();
 const saved=await db.accountSessionReference.findUniqueOrThrow({where:{accountId}});expect(saved.checkingUntil!.getTime()-Date.now()).toBeLessThanOrEqual(10_000);
});
it.each(['EXPIRED','NEEDS_REVIEW','RESTRICTED'])('known %s immediately invalidates a recent proof instead of waiting 30 minutes',async state=>{
 await db.accountSessionReference.update({where:{accountId},data:{state,checkedRuntimeId:runtimeId,verifiedAt:new Date(),checkingUntil:null}});
 expect(sessionFresh(await db.accountSessionReference.findUnique({where:{accountId}}),runtimeId)).toBe(false);
 expect((await check()).state).toBe(state);expect(status).not.toHaveBeenCalled();
});
it('queued collection prevents probing and leaves session metadata unchanged',async()=>{
 const c=await db.collectionConfig.create({data:{name:'合成配置',platform:'XHS',mode:'XHS_FIXTURE',keywords:['test'],excludeWords:[],batchLimit:1}});configs.push(c.id);await db.collectionRun.create({data:{configId:c.id,revision:1,snapshot:{},scenario:'READ_WINDOW',requestKey:randomUUID(),execution:{accountId},status:'QUEUED'}});
 const before=await db.accountSessionReference.findUnique({where:{accountId}});expect((await check()).state).toBe('BUSY');expect(status).not.toHaveBeenCalled();expect(await db.accountSessionReference.findUnique({where:{accountId}})).toEqual(before);
});
it.each(['session','device','archive','identity','version'])('late response cannot authorize changed %s',async kind=>{
 let release!:(v:{loggedIn:boolean;userId?:string})=>void;status.mockImplementationOnce(()=>new Promise(ok=>{release=ok;}));const pending=check();while(!release)await new Promise(ok=>setTimeout(ok,1));
 if(kind==='session')await db.accountSessionReference.update({where:{accountId},data:{sessionKey:randomUUID(),state:'UNVERIFIED',checkedRuntimeId:null}});
 else if(kind==='device')await db.accountSessionReference.update({where:{accountId},data:{deviceKeyId:randomUUID()}});
 else await db.platformAccount.update({where:{id:accountId},data:kind==='archive'?{archivedAt:new Date()}:kind==='identity'?{loginPlatformUserId:'changed'}:{version:{increment:1}}});
 release({loggedIn:true,userId:'fixture-identity'});if(['session','device'].includes(kind))await expect(pending).rejects.toThrow('结果已丢弃');else expect((await pending).state).toBe('UNVERIFIED');expect(sessionFresh(await db.accountSessionReference.findUnique({where:{accountId}}),runtimeId)).toBe(false);
});
it('cross-runtime concurrent reservation cannot overwrite the active generation',async()=>{
 let release!:(v:{loggedIn:boolean;userId?:string})=>void;status.mockImplementationOnce(()=>new Promise(ok=>{release=ok;}));const pending=check();while(!release)await new Promise(ok=>setTimeout(ok,1));const other=new AccountLoginService(db,runtime);expect((await other.checkSavedForCollection(admin,accountId)).state).toBe('CHECKING');expect(status).toHaveBeenCalledOnce();release({loggedIn:true,userId:'fixture-identity'});expect((await pending).state).toBe('VERIFIED');await other.onModuleDestroy();
});
it('no raw driver error or platform identity is written to audit',async()=>{status.mockRejectedValue(Error('SECRET_SYNTHETIC_VALUE'));await check();const logs=JSON.stringify(await db.auditLog.findMany({where:{entityId:accountId}}));expect(logs).not.toContain('SECRET_SYNTHETIC_VALUE');expect(logs).not.toContain('fixture-identity');});
