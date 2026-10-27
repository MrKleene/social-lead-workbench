// Explicit approved diagnostic only. No sender, ledger/quota mutation or old authorization use.
import {readFile,realpath,writeFile,mkdir} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import {validateRestrictionScope} from './restriction-operator-scope.mjs';
const require=createRequire(import.meta.url),root=await realpath(fileURLToPath(new URL('../',import.meta.url)));
const [flag,file,evidence]=process.argv.slice(2);if(flag!=='--inspect-restriction-approved-once'||!file||!evidence||process.argv.length!==5)throw Error('EXPLICIT_READ_ONLY_SCOPE_REQUIRED');
const {privateFile,privateDirectory,toolPlan}=require('../runtime/platform.cjs');
const path=resolve(file),output=resolve(evidence);await privateDirectory(output);const st=await privateFile(path);if(st.size>4096)throw Error('SCOPE_TOO_LARGE');const scope=validateRestrictionScope(JSON.parse(await readFile(path,'utf8')));
if(toolPlan(process.env.HOME??'').hash!==scope.candidateSha256)throw Error('CANDIDATE_PIN_MISMATCH');
// Never reuse this directory after a crash or uncertain result. Inspect saved evidence first.
await writeFile(join(output,'started.json'),JSON.stringify({scope,startedAt:new Date().toISOString(),maximumInspectionCalls:1,maximumSubmissions:0})+'\n',{flag:'wx',mode:0o600});
const directory=join(root,'.local/persistent/main'),manifest=JSON.parse(await readFile(join(directory,'instance.json'),'utf8'));
if(manifest.kind!=='crm-persistent-v1'||manifest.root!==root||manifest.name!=='main'||manifest.mode!=='real'||manifest.database!=='crm'||!Number.isInteger(manifest.postgres?.port)||manifest.postgres.port<1024||manifest.postgres.port>65535)throw Error('INSTANCE_MISMATCH');
await privateFile(join(directory,'secret.json'));const secret=JSON.parse(await readFile(join(directory,'secret.json'),'utf8'));if(!/^[a-f0-9]{64}$/.test(secret.databasePassword))throw Error('DATABASE_CONFIGURATION_INVALID');
process.env.DATABASE_URL=`postgresql://crm:${secret.databasePassword}@127.0.0.1:${manifest.postgres.port}/crm?schema=public`;
Object.assign(process.env,{DOTENV_CONFIG_PATH:'/dev/null',XHS_ACCOUNT_LOGIN_MODE:'real',CRM_PROJECT_ROOT:root,CRM_DEVICE_ID:manifest.deviceId,CRM_PERSISTENT:'1',CRM_DEVICE_MANAGEMENT:'1',CRM_INSTANCE_DIRECTORY:directory});
if(process.env.CRM_SUPERVISED_BOOT)throw Error('USE_DIRECT_OPERATOR_CONTEXT');
require('reflect-metadata');const {Db}=require('../apps/api/dist/common/db.js');const db=new Db();
const abort=new AbortController();for(const name of ['SIGINT','SIGTERM'])process.once(name,()=>abort.abort());
let permit,driver,transport,devices,stopped=true,inspectionCalls=0,toolNames=[],outcome={kind:'NOT_STARTED'};
const originalFetch=globalThis.fetch;
globalThis.fetch=async(input,init)=>{
 const u=new URL(String(input));if(u.pathname==='/mcp'&&init?.method==='POST'){
  const rpc=JSON.parse(String(init.body));if(rpc.method==='tools/call'){
   if(rpc.params?.name!=='workbench_account_restriction_inspect'||inspectionCalls!==0)throw Error('READ_ONLY_BOUNDARY');
   inspectionCalls++;toolNames.push(rpc.params.name);
   await writeFile(join(output,'dispatch.json'),JSON.stringify({inspectionCalls,toolNames,submissions:0,at:new Date().toISOString()})+'\n',{flag:'wx',mode:0o600});
  }
 }
 return originalFetch(input,init);
};
try{
 const device=await db.executionDevice.findUnique({where:{id:manifest.deviceId}});
 if(!device?.enabled||!device.runtimeId||!device.lastSeenAt||Date.now()-device.lastSeenAt.getTime()>30000)throw Error('CURRENT_DEVICE_RUNTIME_REQUIRED');process.env.CRM_RUNTIME_ID=device.runtimeId;
 const actors=await db.user.findMany({where:{active:true,role:'ADMIN'},select:{id:true,name:true,email:true,role:true,active:true}});if(actors.length!==1)throw Error('EXACT_ACTIVE_ADMIN_REQUIRED');const actor=actors[0];
 const account=await db.platformAccount.findUnique({where:{id:scope.accountId},include:{sessionReference:true}}),ref=account?.sessionReference;
 if(!account||account.isDemo||account.archivedAt||account.platform!=='XHS'||account.status!=='PAUSED'||account.loginPlatformUserId!==scope.senderId||!account.loginSessionKey||ref?.sessionKey!==account.loginSessionKey||ref.provider!=='real'||ref.deviceId!==manifest.deviceId||ref.state!=='VERIFIED')throw Error('SAVED_ACCOUNT_MISMATCH');
 if(await db.autoContactRule.count({where:{enabled:true}})||await db.autoContactJob.count())throw Error('CONTACT_TASKS_PRESENT');
 const review=await db.semanticReview.findUnique({where:{id:scope.reviewId},include:{capture:{include:{post:true}}}});
 const {savedPostReference}=require('../apps/api/dist/collection/post-reference.js');
 if(!review||review.isDemo||review.platform!=='XHS'||review.capture?.post?.platformPostId!==scope.postId)throw Error('SAVED_TARGET_MISMATCH');
 const reference=savedPostReference(review.capture.post.snapshot?.sourceReference,scope.postId);if(!reference)throw Error('SAVED_REFERENCE_MISSING');
 // The permission is consumed before opening a platform session, even on failure.
 const consumed=join(directory,'restriction-inspection-consents');await mkdir(consumed,{recursive:true,mode:0o700});await privateDirectory(consumed);
 await writeFile(join(consumed,scope.approvalId+'.json'),JSON.stringify({scope,consumedAt:new Date().toISOString(),submissions:0})+'\n',{flag:'wx',mode:0o600});
 const {DeviceService}=require('../apps/api/dist/devices/device.service.js'),{LocalDeviceRuntime}=require('../apps/api/dist/devices/device-runtime.js'),{LoginRuntime}=require('../apps/api/dist/accounts/login-runtime.js'),{XhsRestrictionInspectionTransport,XHS_RESTRICTION_PROTOCOL}=require('../apps/api/dist/auto-contact/xhs-restriction-transport.js');
 devices=new DeviceService(db,new LocalDeviceRuntime());const runtime=new LoginRuntime();permit=await devices.acquire(actor,scope.accountId);
 const signal=AbortSignal.any([abort.signal,permit.signal,AbortSignal.timeout(60000)]);
 if(await runtime.inspect(scope.accountId,ref.sessionKey,runtime.deviceId(),'real',permit.root)!=='UNVERIFIED')throw Error('SESSION_METADATA_MISMATCH');
 await db.$transaction(tx=>devices.assertPermit(tx,permit));
 driver=await runtime.openSavedForRestrictionInspection(scope.accountId,ref.sessionKey,signal,permit.root,scope.candidateSha256);stopped=false;
 if(!driver.replyEndpoint)throw Error('ENDPOINT_MISSING');
 transport=new XhsRestrictionInspectionTransport(driver.replyEndpoint(),{enabled:true,reviewedSha256:scope.candidateSha256});
 outcome=await transport.inspect({protocol:XHS_RESTRICTION_PROTOCOL,accountId:scope.accountId,senderId:scope.senderId,postId:scope.postId,postReference:reference},signal);
}catch(e){outcome={kind:'STOPPED',reason:e instanceof Error&&/^[A-Z_]+$/.test(e.message)?e.message:'READ_ONLY_DIAGNOSTIC_STOPPED'};process.exitCode=1;}
finally{
 let leaseReleased=!permit,cleanupIssue=null;
 try{
  if(transport)stopped=await transport.close();else if(driver?.replyEndpoint)stopped=await driver.replyEndpoint().stop().catch(()=>false);else if(driver){await driver.stop().catch(()=>{});stopped=false;}
  if(permit&&stopped){try{await permit.release();leaseReleased=true;}catch{cleanupIssue='LEASE_RELEASE_UNCONFIRMED';process.exitCode=1;}}
  await devices?.onModuleDestroy();globalThis.fetch=originalFetch;
  if(outcome.kind==='READ_ONLY_RESULT'&&outcome.result.observation.screenshot){
   const {data,...metadata}=outcome.result.observation.screenshot;let saved;
   try{await writeFile(join(output,'restriction.png'),Buffer.from(data,'base64'),{flag:'wx',mode:0o600});saved={...metadata,file:'restriction.png'};}catch{cleanupIssue='SCREENSHOT_SAVE_FAILED';process.exitCode=1;}
   outcome={...outcome,result:{...outcome.result,observation:{...outcome.result.observation,screenshot:saved,screenshotState:saved?'CAPTURED':'UNAVAILABLE'}}};
  }
  const result={outcome,inspectionCalls,toolNames,submissions:0,stopped,leaseReleased,cleanupIssue,checkedAt:new Date().toISOString()};await writeFile(join(output,'result.json'),JSON.stringify(result,null,2)+'\n',{flag:'wx',mode:0o600});console.log(JSON.stringify(result));
 }finally{globalThis.fetch=originalFetch;await devices?.onModuleDestroy();await db.$disconnect();}
}
