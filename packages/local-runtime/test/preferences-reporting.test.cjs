const test=require('node:test'),assert=require('node:assert/strict');
const {fixture,collect,entry,evaluate,completeReport}=require('./flow-fixture.cjs');
const {LocalPreferences}=require('../dist/preferences.cjs');
const {LocalReporting,range}=require('../dist/reporting.cjs');
const {LocalWorkspace}=require('../dist/workspace.cjs');

test('per-configuration defaults persist with CAS, do not grant execution, and never replace unavailable accounts',t=>{
 const f=fixture(t),p=new LocalPreferences(f.store);assert.equal(p.selection().configId,null);p.select({configId:'config',version:0});assert.throws(()=>p.select({configId:'config',version:0}),/PREFERENCE_CHANGED/);
 const saved=p.save({configId:'config',version:0,accountId:'account',batchLimit:3,policyIds:['policy']});assert.equal(saved.version,1);assert.equal(new LocalPreferences(f.store).get({configId:'config'}).batchLimit,3);
 assert.equal(f.store.db.prepare('SELECT count(*) n FROM authorizations').get().n,0);assert.equal(f.store.db.prepare('SELECT count(*) n FROM jobs').get().n,0);
 assert.throws(()=>p.save({...saved,version:0,batchLimit:2}),/PREFERENCE_CHANGED/);assert.throws(()=>p.save({...saved,batchLimit:11}),/INVALID_LOCAL_PREFERENCE/);
 f.store.db.exec("UPDATE accounts SET state='UNVERIFIED',session_ref=NULL; UPDATE review_policies SET enabled=0");const unavailable=p.get({configId:'config'});assert.equal(unavailable.accountId,'account');assert.deepEqual(unavailable.issues,['PREFERRED_ACCOUNT_REQUIRES_LOGIN','PREFERRED_POLICY_REQUIRES_AUTHORIZATION']);
 f.store.db.exec("UPDATE configurations SET archived=1 WHERE id='config'");assert.equal(p.selection().configId,null);assert.throws(()=>p.get({configId:'config'}),/CONFIGURATION_CHANGED/);
});

test('step toggles persist with CAS and drop selections that no longer exist',t=>{
 const f=fixture(t),p=new LocalPreferences(f.store);
 f.store.db.exec("INSERT INTO configurations(id,kind,name,body,updated_at) VALUES('ct','COMMENT_TEMPLATE','评论模板','{\"text\":\"合成评论回复\"}',0),('dt','DM_TEMPLATE','私信模板','{\"text\":\"合成私信\"}',0)");
 assert.deepEqual(p.steps(),{version:0,autoReview:false,policyId:null,autoReply:false,autoComment:true,autoDm:true,commentTemplateIds:[],dmTemplateIds:[],replyAccountIds:[],threshold:80,refreshTime:'00:00'});
 const saved=p.saveSteps({version:0,autoReview:true,policyId:'policy',autoReply:true,commentTemplateIds:['ct'],dmTemplateIds:['dt'],replyAccountIds:['account'],threshold:85});
 assert.equal(saved.version,1);assert.equal(saved.autoComment,true);assert.equal(saved.autoDm,true);assert.deepEqual(saved.commentTemplateIds,['ct']);assert.deepEqual(saved.dmTemplateIds,['dt']);assert.equal(saved.threshold,85);
 assert.throws(()=>p.saveSteps({...saved,autoComment:false,autoDm:false}),/AUTOMATION_CHANNEL_REQUIRED/);
 assert.throws(()=>p.saveSteps({...saved,autoComment:false,autoDm:true,dmTemplateIds:[]}),/AUTOMATION_TEMPLATE_REQUIRED/);
 assert.throws(()=>p.saveSteps({...saved,replyAccountIds:[]}),/AUTOMATION_ACCOUNT_REQUIRED/);
 assert.deepEqual(saved.replyAccountIds,['account']);
 assert.throws(()=>p.saveSteps({...saved,replyAccountIds:['missing']}),/PREFERRED_ACCOUNT_UNAVAILABLE/);
 assert.throws(()=>p.saveSteps({...saved,replyAccountIds:['account','account']}),/INVALID_AUTOMATION_STEPS/);
 assert.equal(new LocalPreferences(f.store).steps().threshold,85);
 assert.throws(()=>p.saveSteps({...saved,version:0}),/PREFERENCE_CHANGED/);
 assert.throws(()=>p.saveSteps({...saved,threshold:101}),/INVALID_AUTOMATION_STEPS/);
 assert.throws(()=>p.saveSteps({...saved,policyId:'missing'}),/REVIEW_POLICY_CHANGED/);
 assert.throws(()=>p.saveSteps({...saved,commentTemplateIds:['missing']}),/CONTACT_TEMPLATE_CHANGED/);
 assert.throws(()=>p.saveSteps({...saved,commentTemplateIds:['dt']}),/CONTACT_TEMPLATE_CHANGED/);
 assert.throws(()=>p.saveSteps({...saved,commentTemplateIds:['ct','ct']}),/INVALID_AUTOMATION_STEPS/);
 f.store.db.exec("UPDATE configurations SET archived=1 WHERE id='ct'");
 const cleared=p.steps();assert.deepEqual(cleared.commentTemplateIds,[]);assert.deepEqual(cleared.dmTemplateIds,['dt']);
 f.store.db.exec("UPDATE accounts SET state='ARCHIVED'");assert.deepEqual(p.steps().replyAccountIds,[]);
});

test('legacy defaults are restored as selections only and survive restart without restoring grants',t=>{
 const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),{LocalDatabase}=require('../dist/database.cjs'),{prepareLegacySnapshot,importLegacySnapshot}=require('../dist/legacy-import.cjs');const dir=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'local-pref-')));let db=new LocalDatabase(path.join(dir,'source.sqlite'));t.after(()=>{db.close();fs.rmSync(dir,{recursive:true,force:true});});
 importLegacySnapshot(db,prepareLegacySnapshot({CollectionConfig:[{id:'c',name:'旧选择',keywords:['合成'],excludeWords:[],batchLimit:3,defaultExecutionAccountId:'a'}],PlatformAccount:[{id:'a',platform:'XHS',label:'原账号',dailyLimit:2}],CommentReviewPolicy:[{id:'p',name:'原目标',target:'寻找有明确学习辅导需求的评论'}],AutomationPreferences:[{id:'workspace',configId:'c',policyId:'p'}]}));
 const prefs=new LocalPreferences(db);assert.equal(prefs.selection().configId,'c');const value=prefs.get({configId:'c'});assert.equal(value.batchLimit,3);assert.equal(value.accountId,'a');assert.deepEqual(value.policyIds,['p']);assert.equal(value.source,'LEGACY');assert.equal(db.db.prepare('SELECT enabled FROM review_policies').get().enabled,0);assert.equal(db.db.prepare('SELECT count(*) n FROM authorizations').get().n,0);
 prefs.save({...value,batchLimit:2});db.close();db=new LocalDatabase(path.join(dir,'source.sqlite'));assert.equal(new LocalPreferences(db).get({configId:'c'}).batchLimit,2);
});

test('local account diagnostics retain channel risks, zero quota and unknown without exposing a session',t=>{
 const f=fixture(t),r=new LocalReporting(f.store);f.store.db.exec("UPDATE accounts SET daily_limit=0; INSERT INTO account_holds(id,account_id,channel,reason,source_hash,created_at) VALUES('h','account','COMMENT','REPLY_DISABLED','synthetic',0)");const d=r.account({accountId:'account'});assert.equal(d.platformSessionVerified,false);assert.equal(d.remaining,0);assert.ok(d.channels[0].reasons.includes('ACCOUNT_HAS_RETAINED_RESTRICTION'));assert.ok(!d.channels[1].reasons.includes('ACCOUNT_HAS_RETAINED_RESTRICTION'));assert.ok(d.channels.every(c=>c.reasons.includes('DAILY_QUOTA_EXHAUSTED')));assert.ok(!JSON.stringify(d).includes('fixture-session'));assert.equal(f.store.db.prepare('SELECT count(*) n FROM jobs').get().n,0);
});

test('model statistics distinguish occupancy and completion, unreviewed rows and published dates',t=>{
 const f=fixture(t),r=new LocalReporting(f.store),w=new LocalWorkspace(f.store),one=entry('one'),two=entry('two');one.comments[0].publishedAt='2026-11-05T16:10:00Z';const run=collect(f,[one,two]);assert.equal(r.unreviewed({runId:run.runId}).total,2);const post=f.collection.posts(run.runId)[0];evaluate(f,run.runId,post.id);assert.equal(r.unreviewed({runId:run.runId}).total,1);assert.equal(w.reviews({publication:'known',from:'2026-11-06',to:'2026-11-06'}).total,1);assert.equal(w.reviews({publication:'unknown'}).total,0);assert.equal(w.reviews({maxScore:20}).total,0);assert.equal(w.reviews({postId:'unrelated'}).total,0);assert.throws(()=>w.reviews({minScore:80,maxScore:20}),/INVALID_REVIEW_FILTER/);
 const model=r.model();assert.equal(model.occupied,1);assert.equal(model.items[0].state,'COMPLETED');assert.equal(model.costAvailable,false);assert.ok(!JSON.stringify(model).includes('寻找明确'));assert.equal(r.model({state:'UNKNOWN'}).total,0);assert.equal(r.runs({accountId:'missing'}).total,0);assert.equal(r.runs({state:'COMPLETE',from:'2026-11-06',to:'2026-11-06'}).total,1);assert.throws(()=>range('2026-02-30',''),/INVALID_DATE_RANGE/);assert.throws(()=>r.model({from:'2026-11-07',to:'2026-11-06'}),/INVALID_DATE_RANGE/);
});

test('saved preferences survive into a consistent database snapshot',async t=>{const f=fixture(t),p=new LocalPreferences(f.store),path=require('node:path'),{LocalDatabase}=require('../dist/database.cjs');p.save({configId:'config',version:0,accountId:'account',batchLimit:2,policyIds:['policy']});p.select({configId:'config',version:0});const snapshot=path.join(path.dirname(f.store.file),'preferences-snapshot.sqlite'),manifest=await f.store.snapshot(snapshot),copy=new LocalDatabase(snapshot);try{assert.equal(manifest.version,require('../dist/migrations.cjs').SCHEMA_VERSION);const saved=new LocalPreferences(copy);assert.equal(saved.selection().configId,'config');assert.equal(saved.get({configId:'config'}).batchLimit,2);assert.deepEqual(saved.get({configId:'config'}).policyIds,['policy']);assert.equal(saved.get({configId:'config'}).issues.length,0);assert.equal(copy.db.prepare('SELECT count(*) n FROM jobs').get().n,0);}finally{copy.close();}});

test('comment avatars survive collection and only safe https URLs are returned',t=>{const f=fixture(t),e=entry('avatar'),{LocalService}=require('../dist/service.cjs');e.comments[0].authorAvatarUrl='https://sns-avatar-qc.xhscdn.com/avatar/comment-avatar.jpg';const run=collect(f,[e]),post=f.collection.posts(run.runId)[0];assert.equal(f.collection.comments(run.runId,post.id)[0].snapshot.authorAvatarUrl,'https://sns-avatar-qc.xhscdn.com/avatar/comment-avatar.jpg');let h=new LocalService(f.store,null).postHistory({postId:post.id});assert.equal(h.comments.items[0].author_avatar_url,'https://sns-avatar-qc.xhscdn.com/avatar/comment-avatar.jpg');f.store.db.prepare("UPDATE run_comments SET snapshot=json_set(snapshot,'$.authorAvatarUrl','http://sns-avatar-qc.xhscdn.com/avatar/comment-avatar.jpg') WHERE post_id=?").run(post.id);h=new LocalService(f.store,null).postHistory({postId:post.id});assert.equal(h.comments.items[0].author_avatar_url,null);assert.equal(f.store.db.prepare('SELECT count(*) n FROM jobs').get().n,1);});

test('post history nests replies under their root comment',t=>{
 const f=fixture(t),e=entry('thread',['根评论','回复一','回复二']);
 e.comments[1].parentId=e.comments[0].id;e.comments[2].parentId=e.comments[0].id;e.post.boundedRead=completeReport(e.comments);
 const run=collect(f,[e]),post=f.collection.posts(run.runId)[0],{LocalService}=require('../dist/service.cjs');
 const h=new LocalService(f.store,null).postHistory({postId:post.id});
 assert.equal(h.comments.total,3);assert.equal(h.comments.roots,1);assert.equal(h.comments.items.length,1);
 assert.equal(h.comments.items[0].body,'根评论');assert.equal(h.comments.items[0].reply_count,2);
 assert.deepEqual(h.comments.items[0].replies.map(c=>c.body),['回复一','回复二']);
 assert.equal(h.comments.items[0].replies[0].reply_to_nickname,null);
 const focused=new LocalService(f.store,null).postHistory({postId:post.id,commentPlatformId:'thread-comment-2'});
 assert.equal(focused.comments.page,1);assert.equal(focused.comments.items[0].body,'根评论');
 assert.throws(()=>new LocalService(f.store,null).postHistory({postId:post.id,commentPlatformId:'missing'}),/COMMENT_NOT_FOUND/);
});

test('post history opens the page containing the focused root comment',t=>{
 const f=fixture(t),texts=Array.from({length:21},(_,i)=>`根${i+1}`),e=entry('focus',texts);
 const run=collect(f,[e]),post=f.collection.posts(run.runId)[0],{LocalService}=require('../dist/service.cjs');
 const h=new LocalService(f.store,null).postHistory({postId:post.id,commentPlatformId:'focus-comment-20'});
 assert.equal(h.comments.roots,21);assert.equal(h.comments.page,2);assert.equal(h.comments.items.length,1);assert.equal(h.comments.items[0].body,'根21');
});

test('historical diagnostic output reuses validated evidence without exposing source access references',t=>{const f=fixture(t),e=entry('diagnostic'),run=collect(f,[e]),post=f.collection.posts(run.runId)[0],{LocalService}=require('../dist/service.cjs');const snapshot=post.snapshot;snapshot.sourceReference={token:'must-not-leak'};snapshot.imageDiagnostics={unsafe:'must-not-leak'};snapshot.coverUrl='https://img.example/cover.jpg';snapshot.authorNickname='作者';snapshot.authorAvatarUrl='http://img.example/avatar.jpg';snapshot.publishedAt='2026-01-02';f.store.db.prepare('UPDATE run_posts SET snapshot=? WHERE id=?').run(JSON.stringify(snapshot),post.id);f.store.db.exec(`UPDATE run_comments SET snapshot=json_set(snapshot,'$.imageDiagnostics','invalid primitive')`);const h=new LocalService(f.store,null).postHistory({postId:post.id});assert.equal(h.post.platformId,post.platform_id);assert.equal(h.post.coverUrl,'https://img.example/cover.jpg');assert.equal(h.post.authorNickname,'作者');assert.equal(h.post.authorAvatarUrl,null);assert.equal(h.post.publishedAt,'2026-01-02');assert.equal(h.post.imageDiagnostics,null);assert.equal(h.post.boundedRead.state,'COMPLETE');assert.equal(h.comments.items[0].image_diagnostics,null);assert.ok(!JSON.stringify(h).includes('must-not-leak'));assert.equal(f.store.db.prepare('SELECT count(*) n FROM jobs').get().n,1);});