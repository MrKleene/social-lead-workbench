import {spawnSync} from 'node:child_process';
import path from 'node:path';
// Native process ownership tests run where the matching compiler is available.
if(process.platform==='darwin'&&process.arch==='arm64'){
 const result=spawnSync(process.execPath,[path.join(import.meta.dirname,'build-supervisor.mjs')],{stdio:'inherit'});
 if(result.status!==0)process.exit(result.status||1);
}
