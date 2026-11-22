'use strict';
const fs=require('node:fs');
const path=require('node:path');
const {randomUUID}=require('node:crypto');
const {LocalError,entryExists}=require('./database.cjs');
const kinds=new Set(['MODEL_KEY','PLATFORM_SESSION','POST_REFERENCE']);
// Protector is supplied by the desktop main process (Electron safeStorage).
// This module never creates a plaintext master key or falls back to plaintext.
class CredentialStore {
 constructor(root,protector,{checkPrivateFile=()=>{}}={}){
  if(!path.isAbsolute(root)||fs.realpathSync(root)!==root||!fs.lstatSync(root).isDirectory())throw new LocalError('UNSAFE_CREDENTIAL_DIRECTORY');
  if(process.platform!=='win32'){const s=fs.statSync(root);if(s.uid!==process.getuid()||(s.mode&0o077))throw new LocalError('UNSAFE_CREDENTIAL_DIRECTORY');}
  this.root=root;this.protector=protector;this.checkPrivateFile=checkPrivateFile;
 }
 file(kind,id){if(!kinds.has(kind)||!/^[-a-zA-Z0-9_]{1,100}$/.test(id))throw new LocalError('INVALID_CREDENTIAL_REFERENCE');return path.join(this.root,kind+'-'+id+'.sealed');}
 ready(){if(!this.protector?.available())throw new LocalError('OS_CREDENTIAL_PROTECTION_UNAVAILABLE');}
 put(kind,id,value){
  this.ready();if(typeof value!=='string'||!value.length||Buffer.byteLength(value)>1048576)throw new LocalError('INVALID_CREDENTIAL');
  const file=this.file(kind,id);if(entryExists(file))this.check(file);
  const encrypted=this.protector.encrypt(JSON.stringify({version:1,kind,id,value}));
  if(!Buffer.isBuffer(encrypted)||!encrypted.length)throw new LocalError('CREDENTIAL_ENCRYPTION_FAILED');
  const temp=file+'.'+randomUUID()+'.tmp';let owned=false;
  try{const fd=fs.openSync(temp,'wx',0o600);owned=true;try{fs.writeFileSync(fd,encrypted);fs.fsyncSync(fd);}finally{fs.closeSync(fd);}fs.renameSync(temp,file);owned=false;}
  finally{encrypted.fill(0);if(owned)fs.rmSync(temp,{force:true});}
 }
 check(file){const s=fs.lstatSync(file);if(!s.isFile()||s.isSymbolicLink()||s.nlink!==1||s.size>2097152||process.platform!=='win32'&&(s.uid!==process.getuid()||(s.mode&0o077)))throw new LocalError('UNSAFE_CREDENTIAL_FILE');this.checkPrivateFile(file);}
 get(kind,id){this.ready();const file=this.file(kind,id);this.check(file);const encrypted=fs.readFileSync(file);try{const parsed=JSON.parse(this.protector.decrypt(encrypted));if(parsed.version!==1||parsed.kind!==kind||parsed.id!==id||typeof parsed.value!=='string')throw Error();return parsed.value;}catch{throw new LocalError('CREDENTIAL_DECRYPTION_FAILED');}finally{encrypted.fill(0);}}
 has(kind,id){const file=this.file(kind,id);if(!entryExists(file))return false;this.check(file);return true;}
 remove(kind,id){const file=this.file(kind,id);if(entryExists(file)){this.check(file);fs.unlinkSync(file);}}
 /** 按 kind 清空全部凭据（出厂恢复用）。只删 <kind>-<id>.sealed，别的文件不碰。 */
 purge(list){
  if(!Array.isArray(list)||!list.length||list.some(kind=>!kinds.has(kind)))throw new LocalError('INVALID_CREDENTIAL_REFERENCE');
  let removed=0;
  for(const name of fs.readdirSync(this.root)){
   const kind=list.find(value=>name.startsWith(value+'-')&&name.endsWith('.sealed'));
   if(!kind)continue;
   const id=name.slice(kind.length+1,-'.sealed'.length);
   if(!/^[-a-zA-Z0-9_]{1,100}$/.test(id))continue;
   this.remove(kind,id);removed++;
  }
  return removed;
 }
}
module.exports={CredentialStore};
