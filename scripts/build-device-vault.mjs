import { spawnSync } from 'node:child_process';
import { mkdirSync, chmodSync, readFileSync, writeFileSync, lstatSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
const root=fileURLToPath(new URL('../',import.meta.url));
if(process.platform==='darwin'&&process.arch==='arm64'){
 const directory=join(root,'apps/desktop/dist/native');mkdirSync(directory,{recursive:true,mode:0o700});
 const source=join(root,'native/macos/device-vault.swift'),binary=join(directory,'device-vault'),stamp=join(directory,'build.json');
 const hash=path=>createHash('sha256').update(readFileSync(path)).digest('hex'),sourceHash=hash(source);
 let unchanged=false;
 try{const saved=JSON.parse(readFileSync(stamp,'utf8')),st=lstatSync(binary);unchanged=st.isFile()&&!st.isSymbolicLink()&&!(st.mode&0o022)&&saved.sourceHash===sourceHash&&saved.binaryHash===hash(binary);}catch{}
 // Preserve the executable's Keychain access identity across ordinary restarts.
 if(!unchanged){
  const result=spawnSync('/usr/bin/swiftc',['-O','-module-cache-path',join(directory,'module-cache'),source,'-o',binary],{stdio:'inherit'});
  if(result.status!==0)throw Error('macOS keychain helper build failed; no software was installed');
  chmodSync(binary,0o700);writeFileSync(stamp,JSON.stringify({sourceHash,binaryHash:hash(binary)}),{mode:0o600});
 }
}else console.log('macOS keychain helper skipped; Windows uses its separate native host helper.');
