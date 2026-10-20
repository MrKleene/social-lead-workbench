// Starts only a local CRM. Real platform processes are created by a later explicit UI consent.
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { cleanEnvironment, preflight } from './real-mcp/core.mjs';
const root=fileURLToPath(new URL('../',import.meta.url)).replace(/\/$/,'');
const offline=process.argv.includes('--offline');
if(process.argv.slice(2).some(a=>a!=='--offline'))throw Error('Only --offline is supported');
const env=cleanEnvironment(process.env);
if(!offline)await preflight({root,home:process.env.HOME,session:'qr-preflight',port:18162,env:process.env});
process.umask(0o077);
console.log(offline?'OFFLINE QR FLOW: no platform or credential storage.':'LOGIN WORKBENCH: startup makes no platform request. Confirm local session storage in Account Center before requesting a real QR code.');
const child=spawn(process.execPath,['scripts/dev-mock-isolated.mjs','--account-login-workbench'],{cwd:root,env,stdio:['ignore','inherit','inherit','ipc']});
child.send({kind:'ACCOUNT_LOGIN_WORKBENCH',mode:offline?'offline':'real'});
for(const s of ['SIGINT','SIGTERM'])process.once(s,()=>child.kill('SIGTERM'));
child.once('exit',code=>{process.exitCode=code||0;});
child.once('error',()=>{console.error('Could not start owned workbench');process.exitCode=1;});
