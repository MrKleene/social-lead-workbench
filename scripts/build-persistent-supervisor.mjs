import {spawnSync} from 'node:child_process';
import {mkdirSync,readFileSync,writeFileSync,lstatSync,chmodSync,renameSync,unlinkSync} from 'node:fs';
import {createHash,randomUUID} from 'node:crypto';
import {join} from 'node:path';
export function buildSupervisor(root){
 const dir=join(root,'apps/api/dist/native'),source=join(root,'native/macos/persistent-supervisor.c'),binary=join(dir,'persistent-supervisor'),stamp=binary+'.json';
 mkdirSync(dir,{recursive:true,mode:0o700});const hash=p=>createHash('sha256').update(readFileSync(p)).digest('hex');let valid=false;
 try{const s=lstatSync(binary),saved=JSON.parse(readFileSync(stamp));valid=s.isFile()&&!s.isSymbolicLink()&&!(s.mode&0o022)&&saved.source===hash(source)&&saved.binary===hash(binary);}catch{}
 if(!valid){const temporary=binary+'.'+randomUUID();try{const r=spawnSync('/usr/bin/clang',['-Wall','-Wextra','-Werror','-O2',source,'-o',temporary],{stdio:'inherit'});if(r.status!==0)throw Error('SUPERVISOR_BUILD_FAILED');chmodSync(temporary,0o700);renameSync(temporary,binary);writeFileSync(stamp,JSON.stringify({source:hash(source),binary:hash(binary)}),{mode:0o600});}finally{try{unlinkSync(temporary);}catch(e){if(e.code!=='ENOENT')throw e;}}}
 return binary;
}
