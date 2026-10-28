// Local ledger reconciliation only: never opens an MCP session or submits.
// Explicit operator invocation only. No scheduler, API route or automatic retry.
import {readFile,lstat,realpath} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),root=await realpath(fileURLToPath(new URL('../',import.meta.url)));
const [flag,file]=process.argv.slice(2);
if(flag!=='--reconcile-readback-once'||!file||process.argv.length!==4)throw Error('Use --reconcile-readback-once with the private exact-scope authorization file');
const path=resolve(file),st=await lstat(path);if(st.isSymbolicLink()||!st.isFile()||st.size>16384||st.mode&0o077||st.uid!==process.getuid?.())throw Error('PRIVATE_SCOPE_FILE_REQUIRED');
const input=JSON.parse(await readFile(path,'utf8'));
const directory=join(root,'.local/persistent/main'),manifest=JSON.parse(await readFile(join(directory,'instance.json'),'utf8'));
if(manifest.kind!=='crm-persistent-v1'||manifest.root!==root||manifest.name!=='main'||manifest.mode!=='real'||manifest.database!=='crm'||!Number.isInteger(manifest.postgres?.port)||manifest.postgres.port<1024||manifest.postgres.port>65535)throw Error('INSTANCE_MISMATCH');
const {privateFile}=require('../runtime/platform.cjs');await privateFile(join(directory,'secret.json'));
const secret=JSON.parse(await readFile(join(directory,'secret.json'),'utf8'));if(!/^[a-f0-9]{64}$/.test(secret.databasePassword))throw Error('DATABASE_CONFIGURATION_INVALID');
process.env.DATABASE_URL=`postgresql://crm:${secret.databasePassword}@127.0.0.1:${manifest.postgres.port}/crm?schema=public`;
Object.assign(process.env,{DOTENV_CONFIG_PATH:'/dev/null',XHS_ACCOUNT_LOGIN_MODE:'real',CRM_PROJECT_ROOT:root,CRM_DEVICE_ID:manifest.deviceId,CRM_PERSISTENT:'1',CRM_DEVICE_MANAGEMENT:'1',CRM_INSTANCE_DIRECTORY:directory});
if(process.env.CRM_SUPERVISED_BOOT)throw Error('USE_DIRECT_OPERATOR_CONTEXT');
require('reflect-metadata');const {Db}=require('../apps/api/dist/common/db.js');const db=new Db();
const abort=new AbortController();for(const name of ['SIGINT','SIGTERM'])process.once(name,()=>abort.abort());
try{
 const device=await db.executionDevice.findUnique({where:{id:manifest.deviceId}});
 if(!device?.enabled||!device.runtimeId||!device.lastSeenAt||Date.now()-device.lastSeenAt.getTime()>30000)throw Error('CURRENT_DEVICE_RUNTIME_REQUIRED');
 process.env.CRM_RUNTIME_ID=device.runtimeId;
 const actor=await db.user.findUnique({where:{id:input.actorId},select:{id:true,name:true,email:true,role:true,active:true}});if(!actor?.active||actor.role!=='ADMIN')throw Error('ACTIVE_ADMIN_REQUIRED');
 const {CapturedReplyReconciliation}=require('../apps/api/dist/auto-contact/captured-reply-reconciliation.js');
 const result=await new CapturedReplyReconciliation(db).confirm(actor,input.proof);
 console.log(JSON.stringify(result));
}catch(error){console.error(JSON.stringify({status:'STOPPED',reason:error instanceof Error&&/^[A-Z_]+$/.test(error.message)?error.message:'RECONCILIATION_STOPPED_NO_RETRY'}));process.exitCode=1;}
finally{await db.$disconnect();}
