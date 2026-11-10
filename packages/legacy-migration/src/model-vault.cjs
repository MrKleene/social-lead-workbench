// Local single-user deployment: authenticated encryption, master outside database/repository.
'use strict';
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto');
class VaultError extends Error{constructor(code){super(code);this.code=code;}}
function vaultPath(instanceId,home=os.homedir()){
 if(!/^[a-f0-9-]{36}$/.test(instanceId))throw new VaultError('MASTER_UNAVAILABLE');
 return path.join(home,'Library','Application Support','SocialLeadWorkbench','model-vault',instanceId,'master.key');
}
function checkParents(file){
 if(!file||!path.isAbsolute(file)||path.basename(file)!=='master.key')throw new VaultError('MASTER_MISSING');
 let p=path.dirname(file),level=0;
 while(p!==path.dirname(p)){
  const s=fs.lstatSync(p);if(s.isSymbolicLink()||!s.isDirectory())throw new VaultError('MASTER_UNSAFE');
  if(level<3&&(s.uid!==process.getuid?.()||(s.mode&0o077)!==0))throw new VaultError('MASTER_UNSAFE');
  p=path.dirname(p);level++;
 }
}
function master(file){
 let fd,key;
 try{checkParents(file);fd=fs.openSync(file,fs.constants.O_RDONLY|fs.constants.O_NOFOLLOW);const s=fs.fstatSync(fd);
  if(!s.isFile()||s.uid!==process.getuid?.()||(s.mode&0o077)!==0||s.nlink!==1||s.size!==32)throw new VaultError('MASTER_UNSAFE');
  key=fs.readFileSync(fd);if(key.length!==32)throw new VaultError('MASTER_UNSAFE');return key;
 }catch(e){key?.fill(0);throw e instanceof VaultError?e:new VaultError(e.code==='ENOENT'?'MASTER_MISSING':'MASTER_UNAVAILABLE');}finally{if(fd!==undefined)fs.closeSync(fd);}
}
function initialize(file){
 // Explicit CLI only. Never called by API/startup. Never repairs permissions or overwrites a key.
 if(!file||!path.isAbsolute(file)||path.basename(file)!=='master.key')throw new VaultError('MASTER_UNSAFE');
 const dirs=[path.dirname(path.dirname(path.dirname(file))),path.dirname(path.dirname(file)),path.dirname(file)];
 for(const d of dirs){try{fs.mkdirSync(d,{mode:0o700});}catch(e){if(e.code!=='EEXIST')throw new VaultError('MASTER_UNAVAILABLE');}const s=fs.lstatSync(d);if(s.isSymbolicLink()||!s.isDirectory()||s.uid!==process.getuid?.()||(s.mode&0o077)!==0)throw new VaultError('MASTER_UNSAFE');}
 checkParents(file);let fd;const key=crypto.randomBytes(32);
 try{fd=fs.openSync(file,fs.constants.O_CREAT|fs.constants.O_EXCL|fs.constants.O_WRONLY|fs.constants.O_NOFOLLOW,0o600);fs.writeFileSync(fd,key);fs.fsyncSync(fd);}catch(e){throw new VaultError(e.code==='EEXIST'?'MASTER_EXISTS':'MASTER_UNAVAILABLE');}finally{key.fill(0);if(fd!==undefined)fs.closeSync(fd);}
}
const keyId=k=>crypto.createHash('sha256').update(k).digest('hex');
const aad=(id,kid)=>Buffer.from('crm-model-key:v1:'+id+':'+kid);
function encrypt(file,id,text){const key=master(file);try{const kid=keyId(key),iv=crypto.randomBytes(12),c=crypto.createCipheriv('aes-256-gcm',key,iv,{authTagLength:16});c.setAAD(aad(id,kid));return {v:1,kid,iv:iv.toString('base64'),ct:Buffer.concat([c.update(text,'utf8'),c.final()]).toString('base64'),tag:c.getAuthTag().toString('base64')};}finally{key.fill(0);}}
function decrypt(file,id,box){const key=master(file);let plain;try{
 if(!box||box.v!==1||box.kid!==keyId(key)||typeof box.iv!=='string'||typeof box.tag!=='string'||typeof box.ct!=='string'||box.ct.length>2048)throw new VaultError('MASTER_MISMATCH');
 const iv=Buffer.from(box.iv,'base64'),tag=Buffer.from(box.tag,'base64');if(iv.length!==12||tag.length!==16)throw new VaultError('MASTER_MISMATCH');
 const d=crypto.createDecipheriv('aes-256-gcm',key,iv,{authTagLength:16});d.setAAD(aad(id,box.kid));d.setAuthTag(tag);plain=Buffer.concat([d.update(Buffer.from(box.ct,'base64')),d.final()]);return plain.toString('utf8');
 }catch{throw new VaultError('MASTER_MISMATCH');}finally{key.fill(0);plain?.fill(0);}}
function probe(file){try{const k=master(file);k.fill(0);return 'READY';}catch(e){return e instanceof VaultError?e.code:'MASTER_UNAVAILABLE';}}
module.exports={vaultPath,initialize,encrypt,decrypt,probe,VaultError};
