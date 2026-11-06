'use strict';
const fs=require('node:fs');
const path=require('node:path');
const {createHash,randomUUID}=require('node:crypto');
const {DatabaseSync}=require('node:sqlite');
const {LocalDatabase,LocalError,SCHEMA_VERSION,requireNewDestination}=require('./database.cjs');
const {migrations}=require('./migrations.cjs');
const shape=db=>JSON.stringify(db.prepare("SELECT type,name,tbl_name,sql FROM sqlite_schema WHERE name NOT LIKE 'sqlite_%' ORDER BY type,name").all());
function restoreToNewFile(source,destination,sha256){
 if(!path.isAbsolute(source)||!path.isAbsolute(destination)||source===destination||fs.existsSync(destination)||! /^[a-f0-9]{64}$/.test(sha256))throw new LocalError('RESTORE_REQUIRES_NEW_DESTINATION');
 requireNewDestination(destination);
 const s=fs.lstatSync(source);if(!s.isFile()||s.isSymbolicLink()||s.size>2147483648)throw new LocalError('INVALID_BACKUP');
 const data=fs.readFileSync(source);if(createHash('sha256').update(data).digest('hex')!==sha256)throw new LocalError('BACKUP_HASH_MISMATCH');
 const reference=new DatabaseSync(':memory:'),validationFile=destination+'.validate-'+randomUUID();let sourceDb,validationOwned=false;
 try{
  // Validate the exact hashed bytes we will restore, not a source path that may change.
  fs.writeFileSync(validationFile,data,{flag:'wx',mode:0o600});validationOwned=true;
  sourceDb=new DatabaseSync(validationFile,{readOnly:true,allowExtension:false,enableDoubleQuotedStringLiterals:false});sourceDb.exec('PRAGMA trusted_schema=OFF');
  const version=Number(sourceDb.prepare('PRAGMA user_version').get().user_version);
  if(version<1||version>SCHEMA_VERSION)throw new LocalError('BACKUP_SCHEMA_OR_INTEGRITY_INVALID');
  for(const m of migrations.filter(m=>m.version<=version))reference.exec(m.sql);
  if(sourceDb.prepare('PRAGMA integrity_check').get().integrity_check!=='ok'||sourceDb.prepare('PRAGMA foreign_key_check').all().length||shape(sourceDb)!==shape(reference))throw new LocalError('BACKUP_SCHEMA_OR_INTEGRITY_INVALID');
 }finally{sourceDb?.close();reference.close();if(validationOwned)for(const suffix of ['','-wal','-shm','-journal'])fs.rmSync(validationFile+suffix,{force:true});}
 let store,owned=false;
 try{
  fs.writeFileSync(destination,data,{flag:'wx',mode:0o600});owned=true;store=new LocalDatabase(destination,{migrationBackup:false});
  store.transaction(()=>{
   const now=store.clock();store.db.exec("UPDATE automatic_review_authorizations SET enabled=0; UPDATE post_diagnostics SET state='INTERRUPTED' WHERE state='RUNNING'");store.db.prepare("UPDATE evidence_checks SET state='INTERRUPTED',finished_at=? WHERE state='RUNNING'").run(now);
   store.db.prepare("UPDATE authorizations SET state='REVOKED' WHERE state='ACTIVE'").run();
   store.db.prepare("UPDATE jobs SET state=CASE WHEN dispatch_started=1 AND kind IN('SEND','REVIEW') THEN 'UNKNOWN' ELSE 'CANCELLED' END,lease_owner=NULL,lease_until=NULL,fence=fence+1,updated_at=? WHERE state IN('QUEUED','RUNNING','INTERRUPTED')").run(now);
   // Restores preserve quota/duplicate-contact evidence; never automatically refund it.
   store.db.prepare("UPDATE send_attempts SET state='UNKNOWN',updated_at=? WHERE state IN('RESERVED','DISPATCHED')").run(now);
   store.db.prepare("UPDATE accounts SET state=CASE WHEN state IN('RESTRICTED','ARCHIVED') THEN state ELSE 'UNVERIFIED' END,session_ref=NULL,revision=revision+1").run();
   store.db.exec('DELETE FROM account_leases');
   store.db.prepare("UPDATE inbox_receivers SET state='STOPPED',stop_requested=1,reason='RESTORE_REQUIRES_REVIEW',updated_at=?").run(now);
   store.db.prepare("UPDATE collection_runs SET status='INTERRUPTED',cancel_requested=1,reason='RESTORE_REQUIRES_REVIEW',finished_at=? WHERE status='RUNNING'").run(now);
   store.db.prepare("UPDATE review_batches SET state='UNKNOWN',error_code='RESTORE_REQUIRES_REVIEW',finished_at=? WHERE state IN('RESERVED','DISPATCHED')").run(now);
   store.db.exec('UPDATE review_policies SET enabled=0,version=version+1; UPDATE model_profile SET authorized=0,version=version+1');
   store.db.exec('UPDATE contact_rules SET enabled=0,version=version+1,authorization_hash=NULL,authorized_at=NULL; DELETE FROM account_capabilities');
   const eventId=store.audit('IMPORT','BACKUP_RESTORED','installation',{sourceSha256:sha256,credentialsImported:false});
   if(store.db.prepare("SELECT 1 FROM review_batches WHERE state='UNKNOWN'").get())store.db.prepare("INSERT INTO safety_state VALUES('model',1,?,'RESTORE_REQUIRES_REVIEW',?) ON CONFLICT(id) DO UPDATE SET version=version+1,event_id=excluded.event_id,reason=excluded.reason,created_at=excluded.created_at").run(eventId,now);
   store.db.prepare("INSERT INTO safety_state VALUES('sending',1,?,'RESTORE_REQUIRES_REVIEW',?) ON CONFLICT(id) DO UPDATE SET version=version+1,event_id=excluded.event_id,reason=excluded.reason,created_at=excluded.created_at").run(eventId,now);
   store.db.prepare('UPDATE installation SET id=?').run(randomUUID());
  });store.close();store=null;return {file:destination,credentialsImported:false,sendPaused:true};
 }catch(e){store?.close();if(owned)for(const suffix of ['','-wal','-shm'])fs.rmSync(destination+suffix,{force:true});throw e;}
 finally{data.fill(0);}
}
module.exports={restoreToNewFile};
