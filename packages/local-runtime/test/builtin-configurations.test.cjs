'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),test=require('node:test');
const {LocalDatabase}=require('../dist/database.cjs'),{LocalService}=require('../dist/service.cjs');
const {definitions}=require('../dist/builtin-configurations.cjs');
function fixture(t){
 const dir=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'builtin-configuration-test-'))),db=new LocalDatabase(path.join(dir,'db.sqlite'));
 t.after(()=>{db.close();fs.rmSync(dir,{recursive:true,force:true});});
 return {db,service:new LocalService(db)};
}
test('builtin configurations are seeded read-only and cannot be edited or deleted',t=>{
 const {db,service}=fixture(t);
 assert.deepEqual(service.ensureBuiltinConfigurations(),{created:definitions.length,updated:0});
 const rows=service.configurations();
 assert.equal(rows.length,definitions.length);
 assert.ok(rows.every(row=>row.builtin===1));
 const matching=rows.find(row=>row.kind==='MATCHING');
 assert.equal(db.db.prepare('SELECT target FROM review_policies WHERE id=?').get(matching.id).target,matching.body.text);
 assert.deepEqual(service.ensureBuiltinConfigurations(),{created:0,updated:0});
 assert.deepEqual(service.configurations().map(row=>row.revision),rows.map(row=>row.revision));
 assert.throws(()=>service.saveConfiguration({id:matching.id,revision:matching.revision,kind:'MATCHING',name:'我改过的匹配',body:{text:'只匹配明确提出开题求助的评论内容。'}}),/BUILTIN_CONFIGURATION_READ_ONLY/);
 assert.throws(()=>service.deleteConfiguration({id:matching.id,revision:matching.revision}),/BUILTIN_CONFIGURATION_READ_ONLY/);
 assert.throws(()=>service.deleteConfiguration({id:matching.id,revision:999}),/BUILTIN_CONFIGURATION_READ_ONLY/);
 assert.equal(service.configurations().length,definitions.length);
});
test('a changed definition overwrites the builtin and revokes its review authorization',t=>{
 const {db,service}=fixture(t);
 service.ensureBuiltinConfigurations();
 const shipped=definitions.find(definition=>definition.kind==='MATCHING'),stale='旧版本的匹配规则内容，长度足够通过校验。';
 const original=service.configurations().find(row=>row.id===shipped.id).revision;
 db.db.prepare('UPDATE configurations SET name=?,body=?,revision=revision+1 WHERE id=?').run('旧版匹配',JSON.stringify({text:stale}),shipped.id);
 db.db.prepare('UPDATE review_policies SET enabled=1 WHERE id=?').run(shipped.id);
 const before=db.db.prepare('SELECT version,enabled FROM review_policies WHERE id=?').get(shipped.id);
 assert.deepEqual(service.ensureBuiltinConfigurations(),{created:0,updated:1});
 const synced=service.configurations().find(row=>row.id===shipped.id);
 assert.equal(synced.name,shipped.name);
 assert.deepEqual(synced.body,shipped.body);
 assert.equal(synced.builtin,1);
 assert.equal(synced.revision,original+2);
 const after=db.db.prepare('SELECT version,enabled,target FROM review_policies WHERE id=?').get(shipped.id);
 assert.equal(after.enabled,0);
 assert.equal(after.version,before.version+1);
 assert.equal(after.target,shipped.body.text);
});
test('unchanged definitions never rewrite the row or bump its revision',t=>{
 const {db,service}=fixture(t);
 service.ensureBuiltinConfigurations();
 const before=service.configurations().map(row=>({id:row.id,revision:row.revision,updated_at:row.updated_at}));
 assert.deepEqual(service.ensureBuiltinConfigurations(),{created:0,updated:0});
 assert.deepEqual(service.configurations().map(row=>({id:row.id,revision:row.revision,updated_at:row.updated_at})),before);
 assert.equal(db.db.prepare("SELECT count(*) n FROM audit_events WHERE action='BUILTIN_CONFIGURATIONS_SYNCED'").get().n,1);
});
