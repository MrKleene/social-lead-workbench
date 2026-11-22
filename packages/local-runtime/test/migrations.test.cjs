const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {DatabaseSync}=require('node:sqlite');
const {LocalDatabase,SCHEMA_VERSION}=require('../dist/database.cjs');
const {migrations}=require('../dist/migrations.cjs');
function workspace(t){const dir=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'local-migration-test-')));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));return {dir,file:path.join(dir,'workbench.sqlite')};}
test('fresh database installs the single squashed baseline',t=>{
 const f=workspace(t),db=new LocalDatabase(f.file);
 try{
  assert.equal(SCHEMA_VERSION,1);
  assert.equal(db.db.prepare('PRAGMA user_version').get().user_version,1);
  assert.deepEqual(db.db.prepare('SELECT version,checksum FROM schema_migrations').all().map(row=>({version:row.version,checksum:row.checksum})),[{version:1,checksum:migrations[0].checksum}]);
  assert.equal(db.db.prepare('SELECT count(*) n FROM installation').get().n,1);
  const tables=db.db.prepare("SELECT name FROM sqlite_schema WHERE type='table' AND name NOT LIKE 'sqlite_%'").all().map(row=>row.name);
  for(const name of ['posts','comments','send_queue','review_results','configurations'])assert.ok(tables.includes(name),name);
  for(const name of ['captured_posts','captured_comments','inbox_messages'])assert.ok(!tables.includes(name),name);
  assert.ok(db.db.prepare('PRAGMA table_xinfo(configurations)').all().some(column=>column.name==='builtin'));
  assert.ok(db.db.prepare('PRAGMA table_xinfo(model_profile)').all().some(column=>column.name==='daily_limit'&&column.notnull===0));
  assert.equal(db.migrationBackup,undefined);
 }finally{db.close();}
});
test('tampered baseline checksum is refused without touching the file',t=>{
 const f=workspace(t);new LocalDatabase(f.file).close();
 const raw=new DatabaseSync(f.file);fs.chmodSync(f.file,0o600);raw.exec("UPDATE schema_migrations SET checksum='wrong'");raw.close();
 assert.throws(()=>new LocalDatabase(f.file),error=>error.code==='MIGRATION_CHECKSUM_MISMATCH');
 assert.equal(fs.readdirSync(f.dir).some(name=>name.includes('pre-migration')),false);
 const unchanged=new DatabaseSync(f.file);assert.equal(unchanged.prepare('PRAGMA user_version').get().user_version,1);unchanged.close();
});
test('a database from a newer app is refused before any write',t=>{
 const f=workspace(t),raw=new DatabaseSync(f.file);fs.chmodSync(f.file,0o600);raw.exec(migrations[0].sql);raw.prepare('INSERT INTO schema_migrations VALUES(1,?,0)').run(migrations[0].checksum);raw.exec('PRAGMA user_version=2');raw.close();
 assert.throws(()=>new LocalDatabase(f.file),error=>error.code==='DATABASE_FROM_NEWER_APP');
 assert.equal(fs.readdirSync(f.dir).some(name=>name.includes('pre-migration')),false);
 const unchanged=new DatabaseSync(f.file);assert.equal(unchanged.prepare('PRAGMA user_version').get().user_version,2);unchanged.close();
});
