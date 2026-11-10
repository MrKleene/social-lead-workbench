import {spawnSync} from 'node:child_process';
import path from 'node:path';
const root=path.resolve(import.meta.dirname,'../..');
const scripts=process.platform==='darwin'&&process.arch==='arm64'
 ? ['scripts/build-device-vault.mjs','scripts/desktop/build-supervisor.mjs']
 : process.platform==='win32'&&process.arch==='x64'
 ? ['scripts/build-windows-host.mjs'] : null;
if(!scripts)throw Error('UNREVIEWED_NATIVE_BUILD_HOST');
for(const script of scripts){
 const result=spawnSync(process.execPath,[path.join(root,script)],{cwd:root,stdio:'inherit'});
 if(result.status!==0)process.exit(result.status||1);
}
