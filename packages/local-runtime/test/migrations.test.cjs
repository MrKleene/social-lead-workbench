const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {DatabaseSync}=require('node:sqlite');
const {LocalDatabase,SCHEMA_VERSION}=require('../dist/database.cjs');
const {migrations}=require('../dist/migrations.cjs');
function workspace(t){const dir=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'local-migration-test-')));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));return {dir,file:path.join(dir,'workbench.sqlite')};}
function baseline(file,count=1){const raw=new DatabaseSync(file);fs.chmodSync(file,0o600);for(const migration of migrations.slice(0,count)){raw.exec(migration.sql);raw.prepare('INSERT INTO schema_migrations VALUES(?,?,0)').run(migration.version,migration.checksum);if(migration.version===1)raw.prepare('INSERT INTO installation VALUES(?,0)').run('fixture');}raw.exec('PRAGMA user_version='+count);return raw;}
test('fresh database installs the squashed baseline, queue rules, review indexes and evidence auto tasks',t=>{
 const f=workspace(t),db=new LocalDatabase(f.file);
 try{
  assert.equal(SCHEMA_VERSION,4);
  assert.equal(db.db.prepare('PRAGMA user_version').get().user_version,4);
  assert.deepEqual(db.db.prepare('SELECT version,checksum FROM schema_migrations').all().map(row=>({version:row.version,checksum:row.checksum})),migrations.map(m=>({version:m.version,checksum:m.checksum})));
  assert.equal(db.db.prepare('SELECT count(*) n FROM installation').get().n,1);
  const tables=db.db.prepare("SELECT name FROM sqlite_schema WHERE type='table' AND name NOT LIKE 'sqlite_%'").all().map(row=>row.name);
  for(const name of ['posts','comments','send_queue','queue_rules','review_results','configurations','evidence_auto_tasks'])assert.ok(tables.includes(name),name);
  for(const name of ['captured_posts','captured_comments','inbox_messages'])assert.ok(!tables.includes(name),name);
  assert.ok(db.db.prepare('PRAGMA table_xinfo(configurations)').all().some(column=>column.name==='builtin'));
  assert.ok(db.db.prepare('PRAGMA table_xinfo(model_profile)').all().some(column=>column.name==='daily_limit'&&column.notnull===0));
  assert.equal(db.migrationBackup,undefined);
 }finally{db.close();}
});
test('a version 1 database upgrades to queue rules, indexes and evidence auto tasks with a backup and keeps existing rows',t=>{
 const f=workspace(t);const raw=baseline(f.file,1);
 raw.prepare("INSERT INTO configurations(id,kind,name,body,updated_at) VALUES('kept','KEYWORDS','保留','{}',0)").run();raw.close();
 const db=new LocalDatabase(f.file);
 try{
  assert.equal(db.db.prepare('PRAGMA user_version').get().user_version,4);
  assert.equal(db.db.prepare("SELECT count(*) n FROM queue_rules").get().n,0);
  assert.equal(db.db.prepare("SELECT count(*) n FROM schema_migrations WHERE version=2").get().n,1);
  assert.equal(db.db.prepare("SELECT count(*) n FROM schema_migrations WHERE version=3").get().n,1);
  assert.equal(db.db.prepare("SELECT count(*) n FROM schema_migrations WHERE version=4").get().n,1);
  assert.ok(db.db.prepare("SELECT 1 FROM sqlite_schema WHERE type='table' AND name='evidence_auto_tasks'").get());
  assert.ok(db.db.prepare("SELECT 1 FROM sqlite_schema WHERE type='index' AND name='review_results_queue_scan'").get());
  assert.equal(db.db.prepare("SELECT count(*) n FROM configurations WHERE id='kept'").get().n,1);
  assert.ok(db.migrationBackup&&fs.existsSync(db.migrationBackup));assert.match(db.migrationBackup,/pre-migration-v1-/);
 }finally{db.close();}
});
test('upgrade schedules existing unknown sends for automatic readback',t=>{
 const f=workspace(t),raw=baseline(f.file,3);
 raw.prepare("INSERT INTO accounts(id,platform,name,state,daily_limit) VALUES('account','XHS','测试','VERIFIED',10)").run();
 raw.prepare("INSERT INTO authorizations(id,purpose,scope,scope_hash,state,created_at,expires_at) VALUES('authorization','SEND','{}','hash','CONSUMED',0,9999999999999)").run();
 raw.prepare("INSERT INTO contact_ledger(platform,channel,recipient_id) VALUES('XHS','DM','recipient')").run();
 raw.prepare("INSERT INTO send_attempts(id,request_key,platform,channel,recipient_id,account_id,account_revision,authorization_id,scope_hash,content,target,quota_day,state,created_at,updated_at) VALUES('unknown','request','XHS','DM','recipient','account',1,'authorization','hash','text','{}','2026-11-23','UNKNOWN',1,1)").run();
 raw.close();
 const db=new LocalDatabase(f.file);
 try{
  const task=db.db.prepare("SELECT state,attempts FROM evidence_auto_tasks WHERE attempt_id='unknown'").get();
  assert.equal(task.state,'WAITING');assert.equal(task.attempts,0);
 }finally{db.close();}
});
test('tampered baseline checksum is refused without touching the file',t=>{
 const f=workspace(t);new LocalDatabase(f.file).close();
 const raw=new DatabaseSync(f.file);fs.chmodSync(f.file,0o600);raw.exec("UPDATE schema_migrations SET checksum='wrong' WHERE version=1");raw.close();
 assert.throws(()=>new LocalDatabase(f.file),error=>error.code==='MIGRATION_CHECKSUM_MISMATCH');
 assert.equal(fs.readdirSync(f.dir).some(name=>name.includes('pre-migration')),false);
 const unchanged=new DatabaseSync(f.file);assert.equal(unchanged.prepare('PRAGMA user_version').get().user_version,4);unchanged.close();
});
test('a database from a newer app is refused before any write',t=>{
 const f=workspace(t),raw=baseline(f.file,4);raw.exec('PRAGMA user_version=5');raw.close();
 assert.throws(()=>new LocalDatabase(f.file),error=>error.code==='DATABASE_FROM_NEWER_APP');
 assert.equal(fs.readdirSync(f.dir).some(name=>name.includes('pre-migration')),false);
 const unchanged=new DatabaseSync(f.file);assert.equal(unchanged.prepare('PRAGMA user_version').get().user_version,5);unchanged.close();
});
