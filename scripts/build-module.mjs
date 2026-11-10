import {cpSync,mkdirSync,readdirSync,rmSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import path from 'node:path';
const root=path.resolve(import.meta.dirname,'..'),name=process.argv[2];
if(!['domain','local-runtime','legacy-migration'].includes(name))throw Error('Unknown build module');
const directory=path.join(root,'packages',name),source=path.join(directory,'src'),out=path.join(directory,'dist');
rmSync(out,{recursive:true,force:true});
const result=spawnSync(process.execPath,[path.join(root,'node_modules/typescript/bin/tsc'),'-p','tsconfig.json'],{cwd:directory,stdio:'inherit'});
if(result.status!==0)process.exit(result.status||1);
for(const file of readdirSync(source,{recursive:true})){
 if(!/\.(?:cjs|d\.cts|sql)$/.test(file))continue;
 mkdirSync(path.dirname(path.join(out,file)),{recursive:true});
 cpSync(path.join(source,file),path.join(out,file));
}
