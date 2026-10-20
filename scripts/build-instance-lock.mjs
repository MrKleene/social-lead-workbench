import {spawnSync} from 'node:child_process';
import {mkdirSync,readFileSync,writeFileSync,lstatSync,chmodSync,renameSync,unlinkSync} from 'node:fs';
import {createHash,randomUUID} from 'node:crypto';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
export function buildInstanceLock(root=fileURLToPath(new URL('../',import.meta.url))){
 if(process.platform!=='darwin')throw Error('MAC_LOCK_RECOVERY_ONLY');
 const dir=join(root,'apps/api/dist/native'),source=join(root,'native/macos/instance-lock.swift'),binary=join(dir,'instance-lock'),stamp=join(dir,'instance-lock-build.json');
 mkdirSync(dir,{recursive:true,mode:0o700});
 const hash=p=>createHash('sha256').update(readFileSync(p)).digest('hex');let valid=false;
 try{const s=lstatSync(binary),saved=JSON.parse(readFileSync(stamp,'utf8'));valid=s.isFile()&&!s.isSymbolicLink()&&!(s.mode&0o022)&&saved.source===hash(source)&&saved.binary===hash(binary);}catch{}
 if(!valid){const temporary=binary+'.'+randomUUID();try{const r=spawnSync('/usr/bin/swiftc',['-O','-module-cache-path',join(dir,'module-cache'),source,'-o',temporary],{stdio:'inherit'});if(r.status!==0)throw Error('MAC_LOCK_HELPER_BUILD_FAILED');chmodSync(temporary,0o700);renameSync(temporary,binary);writeFileSync(stamp,JSON.stringify({source:hash(source),binary:hash(binary)}),{mode:0o600});}finally{try{unlinkSync(temporary);}catch(e){if(e.code!=='ENOENT')throw e;}}}
 return binary;
}
