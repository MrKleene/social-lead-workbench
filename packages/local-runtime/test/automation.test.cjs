const test=require('node:test'),assert=require('node:assert/strict');
const {fixture,collect,evaluate,entry}=require('./flow-fixture.cjs');
const {LocalAutomation}=require('../dist/automation.cjs');
const {LocalSendQueue}=require('../dist/send-queue.cjs');

function steps(f,value){f.store.db.prepare("INSERT INTO settings(key,value) VALUES('automation-steps',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").run(JSON.stringify(value));}
function rule(automation,{id='rule',channel='DM',content='合成联系内容',accounts=[{id:'account',version:1,dailyLimit:1}],threshold=80}={}){automation.save({id,name:'合成规则',input:{version:0,policyId:'policy',policyRevision:1,threshold,channel,content,accounts}});const p=automation.preview({id,version:1});return automation.authorize({...p,consent:'automatic-contact-frozen-run-v1'});}
function setup(t,{autoReply=false,channel='DM',autoReplyAccounts=[]}={}){const f=fixture(t);steps(f,{autoReply,replyAccountIds:autoReplyAccounts});const automation=new LocalAutomation(f.store,{enabled:()=>true});return {...f,automation,ref:rule(automation,{channel})};}
function queuedReview(f,runId,postId){evaluate(f,runId,postId);return f.store.db.prepare('SELECT id FROM review_results ORDER BY id DESC LIMIT 1').get().id;}
function queueRow(f){return new LocalSendQueue(f.store);}

test('rules cannot retroactively attach to a collected round or pass a global hold',t=>{
 const f=fixture(t),automation=new LocalAutomation(f.store,{enabled:()=>true});const old=collect(f);evaluate(f,old.runId,f.collection.posts(old.runId)[0].id);
 assert.deepEqual(automation.afterReview(old.runId),{queued:0,skipped:0});
 f.advance(120001);const ref=rule(automation),run=collect(f,[entry('post-new')],{contactRules:[ref]});evaluate(f,run.runId,f.collection.posts(run.runId)[0].id);
 assert.deepEqual(automation.afterReview(run.runId),{queued:1,skipped:0});
});

test('review completion enqueues a frozen plan even while automatic replies are off',t=>{
 const f=setup(t,{autoReply:false}),run=collect(f,[entry()],{contactRules:[f.ref]});evaluate(f,run.runId,f.collection.posts(run.runId)[0].id);
 assert.deepEqual(f.automation.afterReview(run.runId),{queued:1,skipped:0});
 assert.deepEqual(f.automation.afterReview(run.runId),{queued:0,skipped:1});
 const row=f.store.db.prepare('SELECT * FROM send_queue').get(),plan=JSON.parse(row.plan);
 assert.equal(row.state,'WAITING_SWITCH');assert.equal(row.origin,'AUTO');assert.equal(row.channel,'DM');
 assert.equal(plan.ruleId,'rule');assert.equal(plan.threshold,80);assert.equal(plan.templates[0].content,'合成联系内容');
 assert.equal(f.store.db.prepare("SELECT count(*) n FROM jobs WHERE kind='SEND'").get().n,0);
});

test('switching automatic replies on schedules one frozen queue item with queue authorization',t=>{
 const f=setup(t,{autoReply:true}),run=collect(f,[entry()],{contactRules:[f.ref]});evaluate(f,run.runId,f.collection.posts(run.runId)[0].id);
 f.automation.afterReview(run.runId);const queue=queueRow(f),started=queue.schedule();assert.equal(started.started,true);assert.equal(typeof started.id,'string');
 const row=f.store.db.prepare('SELECT * FROM send_queue').get(),job=f.store.db.prepare("SELECT * FROM jobs WHERE kind='SEND'").get();
 assert.equal(row.state,'SENDING');assert.equal(job.state,'QUEUED');
 const payload=JSON.parse(job.payload),grant=f.store.db.prepare('SELECT * FROM authorizations WHERE id=?').get(job.authorization_id);
 assert.equal(payload.basis.type,'AUTOMATIC_QUEUE');assert.equal(payload.basis.queueId,row.id);assert.equal(grant.issuer,'AUTOMATION');
 assert.equal(queue.assertScope(payload,grant),1);
});

test('switching automatic replies off returns unsent items to the switch queue',t=>{
 const f=setup(t,{autoReply:true}),run=collect(f,[entry()],{contactRules:[f.ref]});evaluate(f,run.runId,f.collection.posts(run.runId)[0].id);
 f.automation.afterReview(run.runId);const queue=queueRow(f);
 f.store.db.prepare("UPDATE send_queue SET state='READY'").run();steps(f,{autoReply:false});
 assert.deepEqual(queue.schedule(),{started:false});
 const row=f.store.db.prepare('SELECT state,reason FROM send_queue').get();assert.equal(row.state,'WAITING_SWITCH');assert.equal(row.reason,'AUTO_REPLY_OFF');
});

test('direct messages and comments are independent queue contacts for the same recipient',t=>{
 const f=fixture(t);steps(f,{autoReply:false});const automation=new LocalAutomation(f.store,{enabled:()=>true});
 const dm=rule(automation,{id:'dm',channel:'DM'}),comment=rule(automation,{id:'comment',channel:'COMMENT'});
 const run=collect(f,[entry()],{contactRules:[dm,comment]});evaluate(f,run.runId,f.collection.posts(run.runId)[0].id);
 assert.deepEqual(automation.afterReview(run.runId),{queued:2,skipped:0});
 const rows=f.store.db.prepare('SELECT channel,plan FROM send_queue ORDER BY channel').all();
 assert.deepEqual(rows.map(row=>row.channel),['COMMENT','DM']);
 assert.ok(rows.every(row=>JSON.parse(row.plan).templates[0].channel===row.channel));
});

test('manual approval queues without the model score threshold',t=>{
 const f=setup(t,{autoReply:false}),run=collect(f,[entry()],{contactRules:[f.ref]}),reviewId=queuedReview(f,run.runId,f.collection.posts(run.runId)[0].id);
 f.store.db.prepare("UPDATE review_results SET review_status='APPROVED',manual_decision='MATCH',score=0,decision='SKIP' WHERE id=?").run(reviewId);
 const queue=queueRow(f);assert.deepEqual(queue.enqueueReview(reviewId),{queued:1});
 const row=f.store.db.prepare('SELECT * FROM send_queue').get();assert.equal(row.origin,'MANUAL_REVIEW');assert.equal(row.state,'WAITING_SWITCH');
});

test('expired comments require an explicit override before they can be queued again',t=>{
 const f=setup(t,{autoReply:false}),run=collect(f,[entry()],{contactRules:[f.ref]});evaluate(f,run.runId,f.collection.posts(run.runId)[0].id);f.automation.afterReview(run.runId);
 const queue=queueRow(f),now=f.store.clock();f.store.db.prepare('UPDATE send_queue SET comment_published_at=?,expires_at=?').run(now-8*86400000,now-1);
 queue.schedule();const expired=f.store.db.prepare('SELECT * FROM send_queue').get();assert.equal(expired.state,'EXPIRED');assert.equal(expired.reason,'COMMENT_TOO_OLD');
 assert.throws(()=>queue.requeue(expired.id),/COMMENT_TOO_OLD/);
 assert.deepEqual(queue.requeue(expired.id,{override:true}),{id:expired.id});
 const requeued=f.store.db.prepare('SELECT * FROM send_queue').get();assert.equal(requeued.state,'WAITING_SWITCH');assert.equal(requeued.reason,'MANUAL_RECOVERED');
});

test('failed items retry and settled items dismiss, while sending items cannot be cancelled',t=>{
 const f=setup(t,{autoReply:false}),run=collect(f,[entry()],{contactRules:[f.ref]});evaluate(f,run.runId,f.collection.posts(run.runId)[0].id);f.automation.afterReview(run.runId);
 const queue=queueRow(f),id=f.store.db.prepare('SELECT id FROM send_queue').get().id;
 f.store.db.prepare("UPDATE send_queue SET state='SENDING'").run();assert.throws(()=>queue.cancel(id),/SEND_QUEUE_SENDING/);
 f.store.db.prepare("UPDATE send_queue SET state='FAILED',reason='NOT_SUBMITTED'").run();
 assert.deepEqual(queue.retry(id),{id});assert.equal(f.store.db.prepare('SELECT state FROM send_queue').get().state,'WAITING_SWITCH');
 f.store.db.prepare("UPDATE send_queue SET state='FAILED',reason='NOT_SUBMITTED'").run();
 assert.deepEqual(queue.dismiss(id),{id});assert.equal(f.store.db.prepare('SELECT state,reason FROM send_queue').get().state,'CANCELLED');
 assert.throws(()=>queue.dismiss(id),/SEND_QUEUE_NOT_DISMISSABLE/);
});

test('manual send now requires one channel and freezes the chosen account and template',t=>{
 const f=fixture(t);steps(f,{autoReply:false});const automation=new LocalAutomation(f.store,{enabled:()=>true});const dm=rule(automation,{id:'dm',channel:'DM'}),comment=rule(automation,{id:'comment',channel:'COMMENT'});
 f.store.db.exec("INSERT INTO configurations(id,kind,name,body,updated_at) VALUES('dt','DM_TEMPLATE','私信模板','{\"text\":\"手动私信内容\"}',0),('ct','COMMENT_TEMPLATE','评论模板','{\"text\":\"手动评论内容\"}',0)");
 const run=collect(f,[entry()],{contactRules:[dm,comment]});evaluate(f,run.runId,f.collection.posts(run.runId)[0].id);automation.afterReview(run.runId);
 const queue=queueRow(f),ids=f.store.db.prepare("SELECT id FROM send_queue WHERE state='WAITING_SWITCH'").all().map(row=>row.id);
 assert.throws(()=>queue.sendNow({ids,accountId:'account',templateId:'dt'}),/SEND_QUEUE_CHANNEL_MIXED/);
 const dmId=f.store.db.prepare("SELECT id FROM send_queue WHERE channel='DM'").get().id;
 assert.deepEqual(queue.sendNow({ids:[dmId],accountId:'account',templateId:'dt'}),{count:1});
 assert.equal(queue.schedule().started,true);
 const row=f.store.db.prepare('SELECT * FROM send_queue WHERE id=?').get(dmId),job=f.store.db.prepare('SELECT * FROM jobs WHERE kind=\'SEND\'').get(),payload=JSON.parse(job.payload);
 assert.equal(row.manual_now,1);assert.equal(row.state,'SENDING');assert.equal(payload.content,'手动私信内容');assert.equal(payload.basis.type,'MANUAL_QUEUE');
 assert.equal(f.store.db.prepare('SELECT issuer FROM authorizations WHERE id=?').get(job.authorization_id).issuer,'LOCAL_USER');
});

test('quota exhaustion leaves the item waiting with a remaining-quota summary',t=>{
 const f=setup(t,{autoReply:true,autoReplyAccounts:['account']}),run=collect(f,[entry()],{contactRules:[f.ref]});evaluate(f,run.runId,f.collection.posts(run.runId)[0].id);f.automation.afterReview(run.runId);
 const queue=queueRow(f),day=require('../dist/send-safety.cjs').currentQuotaDay(f.store);
 f.store.db.prepare('INSERT INTO account_days(account_id,day,occupied) VALUES(?,?,1) ON CONFLICT(account_id,day) DO UPDATE SET occupied=1').run('account',day);
 assert.deepEqual(queue.schedule(),{started:false});
 const waiting=f.store.db.prepare('SELECT state,reason FROM send_queue').get();assert.equal(waiting.state,'WAITING_QUOTA');assert.equal(waiting.reason,'ACCOUNT_POOL_QUOTA_EXHAUSTED');
 assert.equal(queue.summary().quota,1);assert.equal(queue.summary().remaining,19);
 f.store.db.prepare('DELETE FROM account_days WHERE account_id=? AND day=?').run('account',day);
 assert.equal(queue.schedule().started,true);
});

test('revoking an automatic rule cancels its unsent queue items',t=>{
 const f=setup(t,{autoReply:false}),run=collect(f,[entry()],{contactRules:[f.ref]});evaluate(f,run.runId,f.collection.posts(run.runId)[0].id);f.automation.afterReview(run.runId);
 assert.deepEqual(f.automation.revoke({id:'rule'}),{disabled:true,cancelled:0,queuedCancelled:1});
 const row=f.store.db.prepare('SELECT state,reason FROM send_queue').get();assert.equal(row.state,'CANCELLED');assert.equal(row.reason,'RULE_REVOKED');
});

test('a queued comment still needs a fresh comment capability at send reservation',t=>{
 const f=fixture(t);steps(f,{autoReply:true});const automation=new LocalAutomation(f.store,{enabled:()=>true}),ref=rule(automation,{id:'comment',channel:'COMMENT'});
 const run=collect(f,[entry('c'.repeat(24))],{contactRules:[ref]});evaluate(f,run.runId,f.collection.posts(run.runId)[0].id);automation.afterReview(run.runId);
 const queue=queueRow(f);assert.equal(queue.schedule().started,true);
 const lease=f.queue.claim('send');assert.throws(()=>new (require('../dist/send-safety.cjs').SendSafety)(f.store).reserve(lease),/COMMENT_CAPABILITY_REQUIRED/);
});

test('rule authorization requires registered sender, exact preview and selected current policy',t=>{
 const f=setup(t);assert.throws(()=>f.automation.authorize({id:'rule',version:1,previewHash:'wrong',consent:'automatic-contact-frozen-run-v1'}),/AUTOMATION_CONSENT_REQUIRED/);
 assert.throws(()=>f.automation.frozen(['rule'],[]),/AUTOMATION_POLICY_NOT_SELECTED/);
 assert.throws(()=>new LocalAutomation(f.store).authorize({...f.automation.preview({id:'rule',version:1}),consent:'automatic-contact-frozen-run-v1'}),/SEND_EXECUTOR_UNAVAILABLE/);
 f.automation.revoke({id:'rule'});assert.throws(()=>f.automation.frozen(['rule'],[{id:'policy',revision:1}]),/AUTOMATION_POLICY_NOT_SELECTED/);
});

test('collection with automatic rules requires its own explicit combined consent',t=>{
 const f=setup(t),{LocalWorkflow}=require('../dist/workflow.cjs'),w=new LocalWorkflow(f.store,null,{capabilities:()=>({collect:true,send:true})});
 const p=w.previewCollection({configId:'config',accountId:'account',policyIds:['policy'],ruleIds:['rule']});assert.equal(p.automaticRules,1);
 assert.throws(()=>w.authorizeCollection({...p,requestKey:'collect-auto',consent:'bounded-platform-read-once-v1'}),/COLLECTION_CONSENT_REQUIRED/);
 assert.ok(w.authorizeCollection({...p,requestKey:'collect-auto',consent:'bounded-read-with-frozen-contact-v1'}).id);
});
test('a settled send job records the queue item as sent',t=>{
 const f=setup(t,{autoReply:true}),run=collect(f,[entry()],{contactRules:[f.ref]});evaluate(f,run.runId,f.collection.posts(run.runId)[0].id);f.automation.afterReview(run.runId);
 const queue=queueRow(f);assert.equal(queue.schedule().started,true);
 const job=f.store.db.prepare("SELECT id FROM jobs WHERE kind='SEND'").get(),rowId=f.store.db.prepare('SELECT id FROM send_queue').get().id;
 f.store.db.prepare("UPDATE jobs SET state='SUCCEEDED',result='{\"ok\":true}' WHERE id=?").run(job.id);
 assert.deepEqual(queue.settle(job.id),{id:rowId,state:'SENT',reason:null});
 const row=f.store.db.prepare('SELECT state,settled_at FROM send_queue').get();assert.equal(row.state,'SENT');assert.ok(row.settled_at);
});

test('expired queue rows are purged 30 days after settling',t=>{
 const f=setup(t,{autoReply:false}),run=collect(f,[entry()],{contactRules:[f.ref]});evaluate(f,run.runId,f.collection.posts(run.runId)[0].id);f.automation.afterReview(run.runId);
 const queue=queueRow(f),row=f.store.db.prepare('SELECT id FROM send_queue').get(),now=f.store.clock();
 f.store.db.prepare("UPDATE send_queue SET state='EXPIRED',reason='QUEUE_TOO_OLD',settled_at=? WHERE id=?").run(now-29*86400000,row.id);
 queue.schedule();assert.equal(f.store.db.prepare('SELECT count(*) n FROM send_queue').get().n,1);
 f.store.db.prepare("UPDATE send_queue SET settled_at=? WHERE id=?").run(now-31*86400000,row.id);
 queue.schedule();assert.equal(f.store.db.prepare('SELECT count(*) n FROM send_queue').get().n,0);
});

test('service review decisions enqueue approved contacts and cancel rejected ones',t=>{
 const {LocalService}=require('../dist/service.cjs');
 const f=setup(t,{autoReply:false}),run=collect(f,[entry()],{contactRules:[f.ref]}),reviewId=queuedReview(f,run.runId,f.collection.posts(run.runId)[0].id);
 const service=new LocalService(f.store),raw=f.store.db.prepare('SELECT version FROM review_results WHERE id=?').get(reviewId);
 const done=service.decideReview({id:reviewId,version:raw.version,status:'APPROVED'});
 assert.deepEqual(done.queue,{queued:1});
 const row=f.store.db.prepare('SELECT * FROM send_queue').get();assert.equal(row.origin,'MANUAL_REVIEW');assert.equal(row.state,'WAITING_SWITCH');
 service.decideReview({id:reviewId,version:raw.version+1,status:'REJECTED'});
 const cancelled=f.store.db.prepare('SELECT state,reason FROM send_queue WHERE id=?').get(row.id);assert.equal(cancelled.state,'CANCELLED');assert.equal(cancelled.reason,'REVIEW_REJECTED');
});
