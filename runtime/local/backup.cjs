'use strict';
const fs=require('node:fs');
const path=require('node:path');
const {createHash,randomUUID}=require('node:crypto');
const {DatabaseSync}=require('node:sqlite');
const {LocalDatabase,LocalError,SCHEMA_VERSION,requireNewDestination}=require('./database.cjs');
const shape=db=>JSON.stringify(db.prepare("SELECT type,name,tbl_name,sql FROM sqlite_schema WHERE name NOT LIKE 'sqlite_%' ORDER BY type,name").all());
function restoreToNewFile(source,destination,sha256){
 if(!path.isAbsolute(source)||!path.isAbsolute(destination)||source===destination||fs.existsSync(destination)||! /^[a-f0-9]{64}$/.test(sha256))throw new LocalError('RESTORE_REQUIRES_NEW_DESTINATION');
 requireNewDestination(destination);
 const s=fs.lstatSync(source);if(!s.isFile()||s.isSymbolicLink()||s.size>2147483648)throw new LocalError('INVALID_BACKUP');
 const data=fs.readFileSync(source);if(createHash('sha256').update(data).digest('hex')!==sha256)throw new LocalError('BACKUP_HASH_MISMATCH');
 const reference=new DatabaseSync(':memory:'),validationFile=destination+'.validate-'+randomUUID();let sourceDb,validationOwned=false;
 try{
  reference.exec(fs.readFileSync(path.join(__dirname,'schema.sql'),'utf8'));
  // Validate the exact hashed bytes we will restore, not a source path that may change.
  fs.writeFileSync(validationFile,data,{flag:'wx',mode:0o600});validationOwned=true;
  sourceDb=new DatabaseSync(validationFile,{readOnly:true,allowExtension:false,enableDoubleQuotedStringLiterals:false});sourceDb.exec('PRAGMA trusted_schema=OFF');
  if(sourceDb.prepare('PRAGMA integrity_check').get().integrity_check!=='ok'||sourceDb.prepare('PRAGMA foreign_key_check').all().length||Number(sourceDb.prepare('PRAGMA user_version').get().user_version)!==SCHEMA_VERSION||shape(sourceDb)!==shape(reference))throw new LocalError('BACKUP_SCHEMA_OR_INTEGRITY_INVALID');
 }finally{sourceDb?.close();reference.close();if(validationOwned)for(const suffix of ['','-wal','-shm','-journal'])fs.rmSync(validationFile+suffix,{force:true});}
 let store,owned=false;
 try{
  fs.writeFileSync(destination,data,{flag:'wx',mode:0o600});owned=true;store=new LocalDatabase(destination);
  store.transaction(()=>{
   const now=store.clock();
   store.db.prepare("UPDATE authorizations SET state='REVOKED' WHERE state='ACTIVE'").run();
   store.db.prepare("UPDATE jobs SET state=CASE WHEN dispatch_started=1 AND kind IN('SEND','REVIEW') THEN 'UNKNOWN' ELSE 'CANCELLED' END,lease_owner=NULL,lease_until=NULL,fence=fence+1,updated_at=? WHERE state IN('QUEUED','RUNNING','INTERRUPTED')").run(now);
   // Restores preserve quota/duplicate-contact evidence; never automatically refund it.
   store.db.prepare("UPDATE send_attempts SET state='UNKNOWN',updated_at=? WHERE state IN('RESERVED','DISPATCHED')").run(now);
   store.db.prepare("UPDATE accounts SET state=CASE WHEN state IN('RESTRICTED','ARCHIVED') THEN state ELSE 'UNVERIFIED' END,session_ref=NULL,revision=revision+1").run();
   store.db.exec('DELETE FROM account_leases');
   const eventId=store.audit('IMPORT','BACKUP_RESTORED','installation',{sourceSha256:sha256,credentialsImported:false});
   store.db.prepare("INSERT INTO safety_state VALUES('sending',1,?,'RESTORE_REQUIRES_REVIEW',?) ON CONFLICT(id) DO UPDATE SET version=version+1,event_id=excluded.event_id,reason=excluded.reason,created_at=excluded.created_at").run(eventId,now);
   store.db.prepare('UPDATE installation SET id=?').run(randomUUID());
  });store.close();store=null;return {file:destination,credentialsImported:false,sendPaused:true};
 }catch(e){store?.close();if(owned)for(const suffix of ['','-wal','-shm'])fs.rmSync(destination+suffix,{force:true});throw e;}
 finally{data.fill(0);}
}
module.exports={restoreToNewFile};
