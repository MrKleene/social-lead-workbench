// Verify the single existing acceptance attempt; no sender, quota or retry invocation.
import {readFile,realpath,writeFile} from 'node:fs/promises';import {resolve,join} from 'node:path';import {fileURLToPath} from 'node:url';import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),root=await realpath(fileURLToPath(new URL('../',import.meta.url)));
const [flag,out]=process.argv.slice(2);if(flag!=='--verify-existing-dm-only'||!out||process.argv.length!==4)throw Error('VERIFY_SCOPE_REQUIRED');
const {privateFile,privateDirectory}=require('../runtime/platform.cjs');const output=resolve(out);await privateDirectory(output);await writeFile(join(output,'started.json'),JSON.stringify({attemptId:'85f47118-9c4e-4a70-b047-5479838c9abb',inputs:0,submissions:0,at:new Date().toISOString()}),{flag:'wx',mode:0o600});
const directory=join(root,'.local/persistent/main'),manifest=JSON.parse(await readFile(join(directory,'instance.json'),'utf8'));
if(manifest.kind!=='crm-persistent-v1'||manifest.root!==root||manifest.name!=='main'||manifest.mode!=='real'||manifest.database!=='crm'||!Number.isInteger(manifest.postgres?.port))throw Error('INSTANCE_MISMATCH');
await privateFile(join(directory,'secret.json'));const secret=JSON.parse(await readFile(join(directory,'secret.json'),'utf8'));if(!/^[a-f0-9]{64}$/.test(secret.databasePassword))throw Error('DATABASE_CONFIG');
process.env.DATABASE_URL=`postgresql://crm:${secret.databasePassword}@127.0.0.1:${manifest.postgres.port}/crm?schema=public`;
Object.assign(process.env,{DOTENV_CONFIG_PATH:'/dev/null',XHS_ACCOUNT_LOGIN_MODE:'real',CRM_PROJECT_ROOT:root,CRM_DEVICE_ID:manifest.deviceId,CRM_PERSISTENT:'1',CRM_DEVICE_MANAGEMENT:'1',CRM_INSTANCE_DIRECTORY:directory});if(process.env.CRM_SUPERVISED_BOOT)throw Error('DIRECT_CONTEXT_REQUIRED');

require('reflect-metadata');const {Db}=require('../apps/api/dist/common/db.js'),db=new Db();let devices,summary;
try{
 const a=await db.contactAttempt.findUniqueOrThrow({where:{id:'85f47118-9c4e-4a70-b047-5479838c9abb'}});if(a.outcome!=='UNKNOWN'||a.channel!=='DM'||a.accountIdSnapshot!=='cmvqxdtlk0002i4jc59vwaw7n'||a.content!=='选题可以去找专业的'||a.requestKey!=='dm:24da8dc8-1df0-44f4-bbae-c55fecfa0f0b')throw Error('EXACT_ATTEMPT_REQUIRED');
 const actor=await db.user.findUniqueOrThrow({where:{id:a.actorId},select:{id:true,name:true,email:true,role:true,active:true}});if(!actor.active||actor.role!=='ADMIN')throw Error('ADMIN_REQUIRED');
 const device=await db.executionDevice.findUniqueOrThrow({where:{id:manifest.deviceId}});if(!device.enabled||!device.runtimeId||!device.lastSeenAt||Date.now()-device.lastSeenAt.getTime()>30000)throw Error('RUNTIME_REQUIRED');process.env.CRM_RUNTIME_ID=device.runtimeId;
 if(await db.autoContactJob.count({where:{status:{in:['MANUAL_READY','QUEUED','WAITING_ACCOUNT','WAITING_QUOTA','RESERVED','ATTEMPTED']}}})||await db.deviceExecutionLease.count({where:{expiresAt:{gt:new Date()}}}))throw Error('ACTIVE_TASKS');
 const {DeviceService}=require('../apps/api/dist/devices/device.service.js'),{LocalDeviceRuntime}=require('../apps/api/dist/devices/device-runtime.js'),{LoginRuntime}=require('../apps/api/dist/accounts/login-runtime.js'),{LocalDmExecutor}=require('../apps/api/dist/direct-messages/dm-executor.js'),{DmSendService}=require('../apps/api/dist/direct-messages/dm-send.service.js');
 devices=new DeviceService(db,new LocalDeviceRuntime());const service=new DmSendService(db,new LocalDmExecutor(db,devices,new LoginRuntime()));
 summary={kind:'PASSIVE_VERIFICATION',result:await service.verify(actor,'24da8dc8-1df0-44f4-bbae-c55fecfa0f0b'),inputs:0,submissions:0,at:new Date().toISOString()};
}catch(e){summary={kind:'STOPPED',reason:e instanceof Error&&(/^[A-Z_]+$/.test(e.message)||/^[\u4e00-\u9fff，。；、：0-9 ]{1,100}$/.test(e.message))?e.message:'VERIFY_FAILED',inputs:0,submissions:0};process.exitCode=1}
finally{await devices?.onModuleDestroy();await db.$disconnect();await writeFile(join(output,'result.json'),JSON.stringify(summary,null,2),{flag:'wx',mode:0o600});console.log(JSON.stringify(summary))}
