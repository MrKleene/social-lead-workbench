const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {LocalService}=require('../dist/service.cjs');
const {LocalDatabase}=require('../dist/database.cjs');
test('local setup and 100 keyword save persist without a login identity',t=>{const dir=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'local-service-test-'))),db=new LocalDatabase(path.join(dir,'db.sqlite'));t.after(()=>{db.close();fs.rmSync(dir,{recursive:true,force:true});});const service=new LocalService(db);assert.equal(service.status().initialized,false);service.initialize();assert.equal(service.status().initialized,true);const body={keywords:Array.from({length:100},(_,i)=>'keyword-'+i)};const {id}=service.saveConfiguration({kind:'KEYWORDS',name:'test',body});assert.equal(service.configurations()[0].body.keywords.length,100);assert.throws(()=>service.saveConfiguration({kind:'KEYWORDS',name:'too many',body:{keywords:[...body.keywords,'101']}}),/INVALID_KEYWORDS/);assert.throws(()=>service.saveConfiguration({id,revision:0,kind:'KEYWORDS',name:'changed',body}),/CHANGED/);service.saveConfiguration({id,revision:1,kind:'KEYWORDS',name:'changed',body});assert.equal(service.configurations()[0].revision,2);assert.equal(service.status().platform.ready,false);});
test('local review decision is versioned and creates no send or authorization',t=>{const {fixture,collect,evaluate}=require('./flow-fixture.cjs'),f=fixture(t),run=collect(f);evaluate(f,run.runId,f.collection.posts(run.runId)[0].id);const service=new LocalService(f.store),row=service.reviews().items[0],before=f.store.db.prepare('SELECT count(*) n FROM authorizations').get().n;assert.equal(service.runs().items[0].comments,1);service.decideReview({id:row.id,version:row.version,status:'REJECTED'});assert.throws(()=>service.decideReview({id:row.id,version:row.version,status:'APPROVED'}),/REVIEW_CHANGED/);assert.equal(service.reviews().items[0].review_status,'REJECTED');assert.equal(f.store.db.prepare("SELECT count(*) n FROM jobs WHERE kind='SEND'").get().n,0);assert.equal(f.store.db.prepare('SELECT count(*) n FROM authorizations').get().n,before);assert.throws(()=>service.reviews({page:-1}),/INVALID_PAGE/);});test('unused configuration is deleted for real together with its preferences and policy',t=>{
 const dir=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'local-service-delete-'))),db=new LocalDatabase(path.join(dir,'db.sqlite'));t.after(()=>{db.close();fs.rmSync(dir,{recursive:true,force:true});});
 const service=new LocalService(db),body={keywords:['合成关键词'],excludeWords:[]};
 const {id}=service.saveConfiguration({kind:'KEYWORDS',name:'待删配置',body});
 service.selectWorkspaceConfiguration({configId:id,version:0});
 service.saveCollectionPreferences({configId:id,version:0,accountId:null,batchLimit:2,policyIds:[]});
 assert.equal(service.workspaceSelection().configId,id);
 assert.deepEqual(service.deleteConfiguration({id,revision:1}),{deleted:true});
 assert.equal(service.configurations().length,0);
 assert.equal(service.workspaceSelection().configId,null);
 assert.equal(db.db.prepare('SELECT count(*) n FROM settings WHERE key=?').get('collection-preference:'+id).n,0);
 assert.throws(()=>service.deleteConfiguration({id,revision:1}),/CONFIGURATION_CHANGED/);
 const matching=service.saveConfiguration({kind:'MATCHING',name:'待删目标',body:{text:'寻找明确提出学习需求'}});
 assert.equal(db.db.prepare('SELECT count(*) n FROM review_policies').get().n,1);
 service.deleteConfiguration({id:matching.id,revision:1});
 assert.equal(db.db.prepare('SELECT count(*) n FROM review_policies').get().n,0);
 assert.equal(service.configurations().length,0);
});
test('configuration that already produced collection history cannot be deleted',t=>{
 const {fixture,collect}=require('./flow-fixture.cjs'),f=fixture(t),service=new LocalService(f.store),revision=f.store.db.prepare("SELECT revision FROM configurations WHERE id='config'").get().revision;
 collect(f);
 assert.throws(()=>service.deleteConfiguration({id:'config',revision}),/CONFIGURATION_HAS_HISTORY/);
 assert.equal(f.store.db.prepare("SELECT count(*) n FROM configurations WHERE id='config'").get().n,1);
});
