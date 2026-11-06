'use strict';
const {DatabaseSync,backup}=require('node:sqlite');
const fs=require('node:fs');
const path=require('node:path');
const {createHash,randomUUID}=require('node:crypto');
const SCHEMA_VERSION=1;
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
 constructor(file,{clock=Date.now,checkPrivateFile=()=>{}}={}){
  if(!path.isAbsolute(file))throw new LocalError('ABSOLUTE_DATABASE_PATH_REQUIRED');
  const parent=path.dirname(file),ps=fs.lstatSync(parent);if(fs.realpathSync(parent)!==parent||!ps.isDirectory()||process.platform!=='win32'&&(ps.uid!==process.getuid()||(ps.mode&0o077)))throw new LocalError('UNSAFE_DATABASE_DIRECTORY');
  if(entryExists(file)){plainFile(file);checkPrivateFile(file);}else requireNewDestination(file);
  for(const suffix of ['-wal','-shm','-journal'])if(entryExists(file+suffix)){plainFile(file+suffix);checkPrivateFile(file+suffix);}
  this.file=file;this.clock=clock;this.closed=false;this.inTransaction=false;this.maintenance=false;
  this.db=new DatabaseSync(file,{timeout:5000,enableForeignKeyConstraints:true,enableDoubleQuotedStringLiterals:false,allowExtension:false});
  try{fs.chmodSync(file,0o600);checkPrivateFile(file);this.db.exec('PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA foreign_keys=ON; PRAGMA trusted_schema=OFF;');this.migrate();}
  catch(e){this.db.close();throw e;}
 }
 migrate(){
  const version=Number(this.db.prepare('PRAGMA user_version').get().user_version);
  if(version>SCHEMA_VERSION)throw new LocalError('DATABASE_FROM_NEWER_APP');
  const sql=fs.readFileSync(path.join(__dirname,'schema.sql'),'utf8'),checksum=createHash('sha256').update(sql).digest('hex');
  if(version===SCHEMA_VERSION){const row=this.db.prepare('SELECT checksum FROM schema_migrations WHERE version=?').get(version);if(row?.checksum!==checksum)throw new LocalError('MIGRATION_CHECKSUM_MISMATCH');return;}
  // A nonempty unversioned database is never adopted as a new installation.
  if(this.db.prepare("SELECT 1 FROM sqlite_schema WHERE type='table' AND name NOT LIKE 'sqlite_%' LIMIT 1").get())throw new LocalError('UNRECOGNIZED_DATABASE');
  this.transaction(()=>{this.db.exec(sql);this.db.prepare('INSERT INTO schema_migrations VALUES(?,?,?)').run(SCHEMA_VERSION,checksum,this.clock());this.db.prepare('INSERT INTO installation VALUES(?,?)').run(randomUUID(),this.clock());this.db.exec('PRAGMA user_version=1');});
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
 active(){return this.db.prepare("SELECT (SELECT count(*) FROM jobs WHERE state IN('QUEUED','RUNNING'))+(SELECT count(*) FROM send_attempts WHERE state IN('RESERVED','DISPATCHED'))+(SELECT count(*) FROM account_leases WHERE expires_at>?) AS n").get(this.clock()).n>0;}
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
