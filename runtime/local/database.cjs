'use strict';
const {DatabaseSync,backup}=require('node:sqlite');
const fs=require('node:fs');
const path=require('node:path');
const {createHash,randomUUID}=require('node:crypto');
const {migrations,SCHEMA_VERSION}=require('./migrations.cjs');
class LocalError extends Error {constructor(code){super(code);this.code=code;}}
function canonical(value){
 if(value===null||typeof value==='boolean'||typeof value==='string')return JSON.stringify(value);
 if(typeof value==='number'&&Number.isFinite(value))return JSON.stringify(value);
 if(Array.isArray(value))return '['+value.map(canonical).join(',')+']';
 if(value&&Object.getPrototypeOf(value)===Object.prototype)return '{'+Object.keys(value).sort().map(k=>JSON.stringify(k)+':'+canonical(value[k])).join(',')+'}';
 throw new LocalError('INVALID_JSON');
}
const hash=value=>createHash('sha256').update(canonical(value)).digest('hex');
function entryExists(file){try{fs.lstatSync(file);return true;}catch(error){if(error.code==='ENOENT')return false;throw error;}}
const sidecars=['-wal','-shm','-journal'];
function requireNewDestination(file){
 if(!path.isAbsolute(file))throw new LocalError('ABSOLUTE_DATABASE_PATH_REQUIRED');
 const parent=path.dirname(file),s=fs.lstatSync(parent);
 if(fs.realpathSync(parent)!==parent||!s.isDirectory()||process.platform!=='win32'&&(s.uid!==process.getuid()||(s.mode&0o077)))throw new LocalError('UNSAFE_DATABASE_DIRECTORY');
 if(['',...sidecars].some(suffix=>entryExists(file+suffix)))throw new LocalError('DATABASE_DESTINATION_OCCUPIED');
}
function plainFile(file){const s=fs.lstatSync(file);if(!s.isFile()||s.isSymbolicLink()||s.nlink!==1||process.platform!=='win32'&&(s.uid!==process.getuid()||(s.mode&0o077)))throw new LocalError('UNSAFE_DATABASE_FILE');}
class LocalDatabase {
 constructor(file,{clock=Date.now,checkPrivateFile=()=>{},migrationBackup=true}={}){
  if(!path.isAbsolute(file))throw new LocalError('ABSOLUTE_DATABASE_PATH_REQUIRED');
  const parent=path.dirname(file),ps=fs.lstatSync(parent);if(fs.realpathSync(parent)!==parent||!ps.isDirectory()||process.platform!=='win32'&&(ps.uid!==process.getuid()||(ps.mode&0o077)))throw new LocalError('UNSAFE_DATABASE_DIRECTORY');
  if(entryExists(file)){plainFile(file);checkPrivateFile(file);}else requireNewDestination(file);
  for(const suffix of ['-wal','-shm','-journal'])if(entryExists(file+suffix)){plainFile(file+suffix);checkPrivateFile(file+suffix);}
  this.file=file;this.clock=clock;this.closed=false;this.inTransaction=false;this.maintenance=false;
  this.db=new DatabaseSync(file,{timeout:5000,enableForeignKeyConstraints:true,enableDoubleQuotedStringLiterals:false,allowExtension:false});
  try{fs.chmodSync(file,0o600);checkPrivateFile(file);this.db.exec('PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA foreign_keys=ON; PRAGMA trusted_schema=OFF;');this.migrate(migrationBackup);}
  catch(e){this.db.close();throw e;}
 }
 migrate(makeBackup){
  const version=Number(this.db.prepare('PRAGMA user_version').get().user_version);
  if(version>SCHEMA_VERSION)throw new LocalError('DATABASE_FROM_NEWER_APP');
  if(!Number.isInteger(version)||version<0)throw new LocalError('UNRECOGNIZED_DATABASE');
  if(!version&&this.db.prepare("SELECT 1 FROM sqlite_schema WHERE type='table' AND name NOT LIKE 'sqlite_%' LIMIT 1").get())throw new LocalError('UNRECOGNIZED_DATABASE');
  for(const m of migrations.filter(m=>m.version<=version)){
   if(this.db.prepare('SELECT checksum FROM schema_migrations WHERE version=?').get(m.version)?.checksum!==m.checksum)throw new LocalError('MIGRATION_CHECKSUM_MISMATCH');
  }
  if(version===SCHEMA_VERSION)return;
  if(version&&makeBackup){
   const destination=this.file+'.pre-migration-v'+version+'-'+randomUUID()+'.sqlite';requireNewDestination(destination);
   this.db.prepare('VACUUM INTO ?').run(destination);fs.chmodSync(destination,0o600);this.migrationBackup=destination;
  }
  // All pending migrations and their version records commit together.
  this.transaction(()=>{
   // A different local connection may finish an upgrade while this connection
   // waits for the write lock. Never replay CREATE/ALTER against its new schema.
   const current=Number(this.db.prepare('PRAGMA user_version').get().user_version);
   if(current!==version){
    if(current!==SCHEMA_VERSION)throw new LocalError('CONCURRENT_MIGRATION_CHANGED');
    for(const m of migrations)if(this.db.prepare('SELECT checksum FROM schema_migrations WHERE version=?').get(m.version)?.checksum!==m.checksum)throw new LocalError('MIGRATION_CHECKSUM_MISMATCH');
    return;
   }
   for(const m of migrations.filter(m=>m.version>version)){
    this.db.exec(m.sql);this.db.prepare('INSERT INTO schema_migrations VALUES(?,?,?)').run(m.version,m.checksum,this.clock());
    if(m.version===1)this.db.prepare('INSERT INTO installation VALUES(?,?)').run(randomUUID(),this.clock());
    this.db.exec('PRAGMA user_version='+m.version);
   }
  });
 }
 transaction(work){
  if(this.closed||this.maintenance)throw new LocalError('DATABASE_UNAVAILABLE');
  if(work.constructor.name==='AsyncFunction')throw new LocalError('ASYNC_TRANSACTION_FORBIDDEN');
  if(this.inTransaction)throw new LocalError('NESTED_TRANSACTION');
  this.db.exec('BEGIN IMMEDIATE');this.inTransaction=true;
  try{const result=work();if(result&&typeof result.then==='function')throw new LocalError('ASYNC_TRANSACTION_FORBIDDEN');this.db.exec('COMMIT');return result;}
  catch(e){try{this.db.exec('ROLLBACK');}catch{}throw e;}finally{this.inTransaction=false;}
 }
 audit(source,action,entityId,details={}){const eventId=randomUUID();this.db.prepare('INSERT INTO audit_events(event_id,source,action,entity_id,details,created_at) VALUES(?,?,?,?,?,?)').run(eventId,source,action,entityId,canonical(details),this.clock());return eventId;}
 active(){return this.db.prepare("SELECT (SELECT count(*) FROM jobs WHERE state IN('QUEUED','RUNNING'))+(SELECT count(*) FROM send_attempts WHERE state IN('RESERVED','DISPATCHED'))+(SELECT count(*) FROM review_batches WHERE state IN('RESERVED','DISPATCHED'))+(SELECT count(*) FROM account_leases WHERE expires_at>?)+(SELECT count(*) FROM evidence_checks WHERE state='RUNNING') AS n").get(this.clock()).n>0;}
 async snapshot(destination){
  if(this.active()||this.inTransaction||this.maintenance)throw new LocalError('BACKUP_REQUIRES_IDLE');
  if(!path.isAbsolute(destination)||path.resolve(destination)===this.file||fs.existsSync(destination))throw new LocalError('BACKUP_DESTINATION_EXISTS_OR_INVALID');
  requireNewDestination(destination);
  this.maintenance=true;
  // Reserve the destination exclusively; never overwrite an existing backup.
  let owned=false;try{fs.closeSync(fs.openSync(destination,'wx',0o600));owned=true;await backup(this.db,destination);plainFile(destination);return {version:SCHEMA_VERSION,sha256:createHash('sha256').update(fs.readFileSync(destination)).digest('hex')};}
  catch(e){if(owned)for(const suffix of ['',...sidecars])fs.rmSync(destination+suffix,{force:true});throw e;}finally{this.maintenance=false;}
 }
 close(){if(!this.closed){if(this.inTransaction||this.maintenance)throw new LocalError('DATABASE_BUSY');this.db.close();this.closed=true;}}
}
module.exports={LocalDatabase,LocalError,canonical,hash,SCHEMA_VERSION,entryExists,requireNewDestination};
