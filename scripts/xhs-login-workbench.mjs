// Legacy QR regression fixture only. Daily login/read uses dev:persistent.
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { cleanEnvironment } from './real-mcp/core.mjs';
const root=fileURLToPath(new URL('../',import.meta.url)).replace(/\/$/,'');
const offline=process.argv.includes('--offline');
if(!offline || process.argv.slice(2).some(a=>a!=='--offline'))throw Error('Regression fixture requires --offline; use npm run dev:persistent for daily login');
const env=cleanEnvironment(process.env);
process.umask(0o077);
console.log('OFFLINE QR REGRESSION: no platform or credential storage.');
const child=spawn(process.execPath,['scripts/dev-mock-isolated.mjs','--account-login-workbench'],{cwd:root,env,stdio:['ignore','inherit','inherit','ipc']});
child.send({kind:'ACCOUNT_LOGIN_WORKBENCH',mode:'offline'});
for(const s of ['SIGINT','SIGTERM'])process.once(s,()=>child.kill('SIGTERM'));
child.once('exit',code=>{process.exitCode=code||0;});
child.once('error',()=>{console.error('Could not start owned workbench');process.exitCode=1;});
