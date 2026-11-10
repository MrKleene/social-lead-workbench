'use strict';
const fs=require('node:fs'),path=require('node:path'),{randomUUID,createHash}=require('node:crypto');
const {LocalDatabase,LocalError,canonical}=require('./database.cjs');
const {prepareLegacySnapshot,importLegacySnapshot}=require('./legacy-import.cjs');
const {restoreToNewFile}=require('./backup.cjs');
const digest=file=>createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const uuid=/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/;
function readRegular(file,limit){const s=fs.lstatSync(file);if(!s.isFile()||s.isSymbolicLink()||s.nlink!==1||s.size>limit)throw new LocalError('INVALID_IMPORT_FILE');return fs.readFileSync(file);}
// All destinations are created by this main-process owner. Renderer inputs are
// IDs plus hashes from a reviewed preview, never paths or SQL.
class LocalDataManager {
 constructor(directory,{checkPrivateFile=()=>{}}={}){this.directory=directory;this.checkPrivateFile=checkPrivateFile;this.pointer=path.join(directory,'active-database.json');for(const name of ['imports','restores','backups']){const dir=path.join(directory,name);if(!fs.existsSync(dir))fs.mkdirSync(dir,{mode:0o700});const s=fs.lstatSync(dir);if(!s.isDirectory()||s.isSymbolicLink()||fs.realpathSync(dir)!==dir||process.platform!=='win32'&&(s.uid!==process.getuid()||(s.mode&0o077)))throw new LocalError('UNSAFE_DATABASE_DIRECTORY');}}
 activeFile(){if(!fs.existsSync(this.pointer))return path.join(this.directory,'workbench.sqlite');this.checkPrivateFile(this.pointer);const value=JSON.parse(readRegular(this.pointer,4096));if(value.format!=='social-lead-active-database-v1'||typeof value.target!=='string'||! /^(?:imports|restores)\/[a-f0-9-]{36}\.sqlite$/.test(value.target)||!uuid.test(path.basename(value.target,'.sqlite')))throw new LocalError('INVALID_ACTIVE_DATABASE');const file=path.join(this.directory,...value.target.split('/'));if(!fs.existsSync(file))throw new LocalError('ACTIVE_DATABASE_MISSING');return file;}
 list(){const rows=[];for(const kind of ['imports','restores'])for(const name of fs.readdirSync(path.join(this.directory,kind))){if(!name.endsWith('.preview.json')||!uuid.test(name.slice(0,-13)))continue;const value=this.preview({id:kind+'/'+name.slice(0,-13)});rows.push({...value,active:this.activeFile()===this.file(value.id)});}return rows.sort((a,b)=>b.createdAt-a.createdAt);}
 file(id){if(typeof id!=='string'||! /^(?:imports|restores)\//.test(id)||!uuid.test(id.split('/')[1])||id.split('/').length!==2)throw new LocalError('INVALID_DATA_COPY');return path.join(this.directory,...id.split('/'))+'.sqlite';}
 preview({id}){const file=this.file(id),meta=JSON.parse(readRegular(file.replace(/\.sqlite$/,'.preview.json'),65536));if(meta.id!==id||! /^[a-f0-9]{64}$/.test(meta.sha256)||!['LEGACY_IMPORT','BACKUP_RESTORE'].includes(meta.kind))throw new LocalError('INVALID_DATA_COPY');return meta;}
 seal(id,kind,report){const file=this.file(id),meta={id,kind,sha256:digest(file),createdAt:Date.now(),report,credentialsImported:false,sendPaused:true,automaticTasksResumed:false};fs.writeFileSync(file.replace(/\.sqlite$/,'.preview.json'),canonical(meta),{flag:'wx',mode:0o600});this.checkPrivateFile(file);return meta;}
 importFile(source){const bytes=readRegular(source,536870912);let snapshot;try{const raw=JSON.parse(bytes);snapshot=raw.format?raw:prepareLegacySnapshot(raw.tables||raw);}finally{bytes.fill(0);}const id='imports/'+randomUUID(),file=this.file(id);let store;
  try{store=new LocalDatabase(file,{checkPrivateFile:this.checkPrivateFile});const report=importLegacySnapshot(store,snapshot);store.db.prepare("INSERT INTO settings VALUES('initialized','true',1) ON CONFLICT DO NOTHING").run();store.close();store=null;return this.seal(id,'LEGACY_IMPORT',{...report,redaction:snapshot.redaction??null});}
  catch(error){store?.close();for(const suffix of ['','-wal','-shm'])fs.rmSync(file+suffix,{force:true});throw error;}
 }
 restoreFile(source){const meta=JSON.parse(readRegular(source+'.json',65536)),id='restores/'+randomUUID(),file=this.file(id);restoreToNewFile(source,file,meta.sha256);return this.seal(id,'BACKUP_RESTORE',{sourceSha256:meta.sha256});}
 async activate(current,{id,sha256,consent}){
  if(consent!=='activate-reviewed-local-copy-v1')throw new LocalError('DATA_ACTIVATION_CONSENT_REQUIRED');
  if(current.active())throw new LocalError('BACKUP_REQUIRES_IDLE');const file=this.file(id),meta=this.preview({id});if(file===current.file)throw new LocalError('DATA_COPY_ALREADY_ACTIVE');
  if(meta.sha256!==sha256||digest(file)!==sha256)throw new LocalError('DATA_COPY_CHANGED');
  const next=new LocalDatabase(file,{checkPrivateFile:this.checkPrivateFile});let committed=false;
  try{
   if(next.active())throw new LocalError('DATA_COPY_HAS_ACTIVE_TASKS');
   const backup=path.join(this.directory,'backups',randomUUID()+'.sqlite'),saved=await current.snapshot(backup);fs.writeFileSync(backup+'.json',canonical(saved),{flag:'wx',mode:0o600});
   // Keep the old database and a consistent backup. Never rename an open SQLite
   // database; WAL files remain associated with their original database.
   const value={format:'social-lead-active-database-v1',target:id+'.sqlite'},temp=this.pointer+'.'+randomUUID()+'.tmp';let fd;
   try{fd=fs.openSync(temp,'wx',0o600);fs.writeFileSync(fd,canonical(value));fs.fsyncSync(fd);fs.closeSync(fd);fd=null;this.checkPrivateFile(temp);fs.renameSync(temp,this.pointer);committed=true;}finally{if(fd!=null)fs.closeSync(fd);fs.rmSync(temp,{force:true});}
   if(process.platform!=='win32'){const dir=fs.openSync(this.directory,'r');try{fs.fsyncSync(dir);}finally{fs.closeSync(dir);}}
   return {store:next,result:{activated:true,id,previousBackup:path.basename(backup),credentialsImported:false}};
  }catch(error){if(!committed)next.close();else return {store:next,result:{activated:true,id,credentialsImported:false}};throw error;}
 }
}
module.exports={LocalDataManager,readRegular};
