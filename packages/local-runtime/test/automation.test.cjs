const test=require('node:test'),assert=require('node:assert/strict');
const {fixture,collect,evaluate,entry}=require('./flow-fixture.cjs');
const {LocalAutomation}=require('../dist/automation.cjs');
const {LocalSendQueue}=require('../dist/send-queue.cjs');
const {LocalService}=require('../dist/service.cjs');

function steps(f,value){f.store.db.prepare("INSERT INTO settings(key,value) VALUES('automation-steps',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").run(JSON.stringify(value));}
function contactRule(automation,{id='rule',channel='DM',content='合成联系内容',accounts=[{id:'account',version:1,dailyLimit:1}],threshold=80}={}){automation.save({id,name:'合成规则',input:{version:0,policyId:'policy',policyRevision:1,threshold,channel,content,accounts}});const p=automation.preview({id,version:1});return automation.authorize({...p,consent:'automatic-contact-frozen-run-v1'});}
function contactSetup(t,{channel='DM'}={}){const f=fixture(t);steps(f,{autoReply:false,replyAccountIds:[]});const automation=new LocalAutomation(f.store,{enabled:()=>true});return {...f,automation,ref:contactRule(automation,{channel})};}
function queueSetup(t,{autoReply=false,channels=['DM'],autoComment=true,autoDm=true,threshold=80,accounts=['account']}={}){
 const f=fixture(t);
 f.store.db.exec("INSERT INTO configurations(id,kind,name,body,updated_at) VALUES('ct','COMMENT_TEMPLATE','评论模板','{\"text\":\"合成评论回复\"}',0),('dt','DM_TEMPLATE','私信模板','{\"text\":\"合成私信\"}',0)");
 steps(f,{autoReply,autoComment,autoDm,commentTemplateIds:['ct'],dmTemplateIds:['dt'],replyAccountIds:accounts});
 const sendQueue=new LocalSendQueue(f.store);
 const rule=sendQueue.saveRule({policyId:'policy',threshold,channels,enabled:true,version:0});
 return {...f,automation:new LocalAutomation(f.store,{enabled:()=>true}),sendQueue,rule};
}
function reviewed(f,{autoReply=false,channels=['DM'],autoComment=true,autoDm=true,threshold=80,accounts=['account']}={}){
 const setup=queueSetup(f,{autoReply,channels,autoComment,autoDm,threshold,accounts});
 const run=collect(setup,[entry()]);evaluate(setup,run.runId,setup.collection.posts(run.runId)[0].id);const reviewId=setup.store.db.prepare('SELECT id FROM review_results ORDER BY id DESC LIMIT 1').get().id;
 return {...setup,run,reviewId};
}
function queuedRows(f){return f.store.db.prepare('SELECT * FROM send_queue ORDER BY channel').all();}

test('queue rules are unique per policy, versioned and never create a second system default through save',t=>{
 const f=queueSetup(t);
 const rules=f.sendQueue.rules();assert.equal(rules.length,1);assert.equal(rules[0].policyId,'policy');assert.equal(rules[0].threshold,80);assert.deepEqual(rules[0].channels,['DM']);assert.equal(rules[0].systemDefault,false);
 assert.throws(()=>f.sendQueue.saveRule({policyId:'policy',threshold:60,channels:['COMMENT'],enabled:true,version:0}),/QUEUE_RULE_CHANGED/);
 assert.throws(()=>f.sendQueue.saveRule({id:f.rule.id,threshold:60,channels:[],enabled:true,version:1}),/INVALID_QUEUE_RULE/);
 assert.throws(()=>f.sendQueue.saveRule({id:f.rule.id,threshold:60,channels:['DM','DM'],enabled:true,version:1}),/INVALID_QUEUE_RULE/);
 assert.throws(()=>f.sendQueue.saveRule({id:f.rule.id,threshold:101,channels:['DM'],enabled:true,version:1}),/INVALID_QUEUE_RULE/);
 assert.throws(()=>f.sendQueue.saveRule({id:f.rule.id,threshold:60,channels:['DM'],enabled:true,version:0}),/QUEUE_RULE_CHANGED/);
 const updated=f.sendQueue.saveRule({id:f.rule.id,threshold:60,channels:['DM','COMMENT'],enabled:false,version:1});
 assert.equal(updated.version,2);assert.equal(updated.threshold,60);assert.deepEqual(updated.channels,['DM','COMMENT']);assert.equal(updated.enabled,false);
 assert.throws(()=>f.sendQueue.saveRule({policyId:'missing',threshold:80,channels:['DM'],enabled:true,version:0}),/REVIEW_POLICY_CHANGED/);
 f.store.db.prepare('UPDATE queue_rules SET system_default=1 WHERE id=?').run(f.rule.id);
 assert.throws(()=>f.sendQueue.deleteRule({id:f.rule.id,version:2}),/QUEUE_RULE_SYSTEM_DEFAULT/);
});

test('pending list follows dispatch order and summary exposes a send pause',t=>{
 const f=reviewed(t,{autoReply:false,channels:['DM']});f.automation.afterReview(f.run.runId);const row=f.store.db.prepare('SELECT * FROM send_queue').get(),now=Date.now();
 f.store.db.prepare('DELETE FROM send_queue').run();
 const insert=f.store.db.prepare('INSERT INTO send_queue(id,run_id,review_id,comment_id,channel,recipient_id,origin,state,priority,manual_now,plan,enqueued_at,expires_at,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)');
 for(const [id,at] of [['third',now+300],['first',now+100],['second',now+200]])insert.run(id,row.run_id,row.review_id,row.comment_id,'DM','recipient-'+id,'AUTO','READY',0,0,'{}',at,now+86400000,at,at);
 assert.deepEqual(f.sendQueue.list({tab:'pending'}).items.map(item=>item.id),['first','second','third']);
 assert.equal(f.sendQueue.summary().paused,false);
 f.store.db.prepare("INSERT INTO safety_state(id,reason,created_at) VALUES('sending','SUBMISSION_UNKNOWN',?)").run(now);
 const summary=f.sendQueue.summary();assert.equal(summary.paused,true);assert.equal(summary.pauseReason,'SUBMISSION_UNKNOWN');
});

test("queue tab merges quota and sending while attention keeps failed unknown expired",t=>{
  const f=reviewed(t,{autoReply:false,channels:["DM"]});f.automation.afterReview(f.run.runId);
  const source=f.store.db.prepare("SELECT * FROM send_queue").get(),now=Date.now();
  f.store.db.prepare("DELETE FROM send_queue").run();
  const insert=f.store.db.prepare("INSERT INTO send_queue(id,run_id,review_id,comment_id,channel,recipient_id,origin,state,priority,manual_now,plan,enqueued_at,expires_at,created_at,updated_at) VALUES(?,?,?,?,?,?,'MANUAL_REVIEW',?,0,0,?,?,?,?,?)");
  const rows=[["waiting","WAITING_SWITCH","r1","{}"],["ready","READY","r2",JSON.stringify({manualBatchId:"batch-1"})],["quota","WAITING_QUOTA","r3","{}"],["sending","SENDING","r4",JSON.stringify({manualBatchId:"batch-1"})],["failed","FAILED","r5","{}"],["unknown","UNKNOWN","r6","{}"],["expired","EXPIRED","r7","{}"]];
  for(const [id,state,recipient,plan] of rows)insert.run(id,source.run_id,source.review_id,source.comment_id,"DM",recipient,state,plan,now,now+86400000,now,now);
  const queue=f.sendQueue.list({tab:"queue"}),attention=f.sendQueue.list({tab:"attention"}),summary=f.sendQueue.summary();
  assert.equal(queue.total,4);assert.equal(attention.total,3);assert.equal(summary.queue,4);assert.equal(summary.attention,3);assert.equal(summary.quota,1);assert.equal(summary.sending,1);
  assert.deepEqual(summary.progress,{batchId:"batch-1",state:"SENDING",total:2,done:0,failed:0,channel:"DM",comment:"想请教学习方法和选题指导",postTitle:"合成学习讨论",recipientNickname:"合成用户",accountName:null});
  f.store.db.prepare("UPDATE send_queue SET state='SENT' WHERE id='sending'").run();
  const after=f.sendQueue.summary().progress;assert.equal(after.state,"READY");assert.equal(after.done,1);assert.equal(after.total,2);
});

test('review completion queues one waiting row per configured channel without the old contact rule snapshot',t=>{
 const f=reviewed(t,{autoReply:false,channels:['DM','COMMENT']});
 assert.deepEqual(f.automation.afterReview(f.run.runId),{queued:2,skipped:0});
 assert.deepEqual(f.automation.afterReview(f.run.runId),{queued:0,skipped:2});
 const rows=queuedRows(f);assert.deepEqual(rows.map(row=>row.channel),['COMMENT','DM']);
 for(const row of rows){const plan=JSON.parse(row.plan);assert.equal(row.state,'WAITING_SWITCH');assert.equal(row.reason,'AUTO_REPLY_OFF');assert.equal(row.origin,'AUTO');assert.equal(plan.ruleId,f.rule.id);assert.equal(plan.threshold,80);assert.equal(plan.templates[0].channel,row.channel);}
 const list=f.sendQueue.list({tab:'pending'});assert.equal(list.total,2);assert.equal(list.items[0].recipientNickname,'合成用户');assert.equal(f.sendQueue.list({tab:'pending',query:'合成用户'}).total,2);const dm=f.sendQueue.list({tab:'pending',channel:'DM'}),comment=f.sendQueue.list({tab:'pending',channel:'COMMENT'});assert.equal(dm.total,1);assert.equal(dm.items.length,1);assert.equal(dm.items[0].channel,'DM');assert.equal(comment.total,1);assert.equal(comment.items[0].channel,'COMMENT');assert.throws(()=>f.sendQueue.list({tab:'pending',channel:'OTHER'}),/INVALID_PENDING_FILTER/);
 assert.equal(f.store.db.prepare("SELECT count(*) n FROM jobs WHERE kind='SEND'").get().n,0);
});

test('switching automatic replies on schedules the enabled channel and leaves the other waiting',t=>{
 const f=reviewed(t,{autoReply:true,channels:['DM','COMMENT'],autoDm:true,autoComment:false});
 f.automation.afterReview(f.run.runId);
 const started=f.sendQueue.schedule();assert.equal(started.started,true);assert.equal(typeof started.id,'string');
 const rows=queuedRows(f),dm=rows.find(row=>row.channel==='DM'),comment=rows.find(row=>row.channel==='COMMENT');
 assert.equal(dm.state,'SENDING');assert.equal(comment.state,'WAITING_SWITCH');assert.equal(comment.reason,'AUTO_CHANNEL_OFF');
 const job=f.store.db.prepare("SELECT * FROM jobs WHERE kind='SEND'").get(),payload=JSON.parse(job.payload),grant=f.store.db.prepare('SELECT * FROM authorizations WHERE id=?').get(job.authorization_id);
 assert.equal(payload.basis.type,'AUTOMATIC_QUEUE');assert.equal(payload.basis.queueId,dm.id);assert.equal(grant.issuer,'AUTOMATION');assert.equal(f.sendQueue.assertScope(payload,grant),20);
});

test('switching automatic replies off returns ready items to the waiting switch queue',t=>{
 const f=reviewed(t,{autoReply:true,channels:['DM']});
 f.automation.afterReview(f.run.runId);
 f.store.db.prepare("UPDATE send_queue SET state='READY'").run();steps(f,{autoReply:false,autoComment:true,autoDm:true,commentTemplateIds:['ct'],dmTemplateIds:['dt'],replyAccountIds:['account']});
 assert.deepEqual(f.sendQueue.schedule(),{started:false});
 const row=f.store.db.prepare('SELECT state,reason FROM send_queue').get();assert.equal(row.state,'WAITING_SWITCH');assert.equal(row.reason,'AUTO_REPLY_OFF');
});

test('manual approval queues below the automatic threshold without reusing the model score',t=>{
 const f=reviewed(t,{autoReply:false}),raw=f.store.db.prepare('SELECT * FROM review_results WHERE id=?').get(f.reviewId);
 f.store.db.prepare("UPDATE review_results SET review_status='APPROVED',manual_decision='MATCH',score=0,decision='SKIP' WHERE id=?").run(f.reviewId);
 assert.deepEqual(f.sendQueue.enqueueReview(f.reviewId),{queued:1});
 const row=f.store.db.prepare('SELECT * FROM send_queue').get();assert.equal(row.origin,'MANUAL_REVIEW');assert.equal(row.state,'WAITING_SWITCH');
 assert.equal(raw.score,92);
});

test('service approval only enqueues and reports a missing queue rule instead of throwing',t=>{
 const f=reviewed(t,{autoReply:false}),service=new LocalService(f.store),raw=f.store.db.prepare('SELECT version FROM review_results WHERE id=?').get(f.reviewId);
 const done=service.decideReview({id:f.reviewId,version:raw.version,status:'APPROVED'});
 assert.deepEqual(done.queue,{queued:1});
 const row=f.store.db.prepare('SELECT origin,state FROM send_queue').get();assert.equal(row.origin,'MANUAL_REVIEW');assert.equal(row.state,'WAITING_SWITCH');
 const other=reviewed(t,{autoReply:false});other.store.db.prepare('DELETE FROM queue_rules').run();const otherService=new LocalService(other.store),otherRaw=other.store.db.prepare('SELECT version FROM review_results WHERE id=?').get(other.reviewId);
 const skipped=otherService.decideReview({id:other.reviewId,version:otherRaw.version,status:'APPROVED'});
 assert.deepEqual(skipped.queue,{queued:0,skipped:'QUEUE_RULE_CONFIGURATION_MISSING'});
 assert.equal(other.store.db.prepare('SELECT count(*) n FROM send_queue').get().n,0);
});

test('one click generation backfills historical reviews idempotently and marks expired comments',t=>{
 const f=queueSetup(t,{autoReply:false,channels:['DM','COMMENT']});
 const run=collect(f,[entry()]);evaluate(f,run.runId,f.collection.posts(run.runId)[0].id);
 const preview=f.sendQueue.generate({apply:false});
 assert.equal(preview.comments,1);assert.equal(preview.commentRows,1);assert.equal(preview.dmRows,1);assert.equal(preview.expired,0);
 assert.equal(f.store.db.prepare('SELECT count(*) n FROM send_queue').get().n,0);
 const applied=f.sendQueue.generate({apply:true});assert.deepEqual(applied,{...preview,apply:true});
 assert.equal(f.store.db.prepare('SELECT count(*) n FROM send_queue').get().n,2);
 const again=f.sendQueue.generate({apply:true});assert.equal(again.comments,0);assert.equal(again.skipped,2);
 f.store.db.prepare("UPDATE run_comments SET snapshot=json_set(snapshot,'$.publishedAt',?)").run(new Date(f.store.clock()-8*86400000).toISOString());
 f.store.db.prepare('DELETE FROM send_queue').run();
 const expired=f.sendQueue.generate({apply:false});assert.equal(expired.expired,2);assert.equal(expired.commentRows,1);assert.equal(expired.dmRows,1);
});

test('failed items retry and settled items dismiss, while sending items cannot be moved out',t=>{
 const f=reviewed(t,{autoReply:false});f.automation.afterReview(f.run.runId);const id=f.store.db.prepare('SELECT id FROM send_queue').get().id;
 f.store.db.prepare("UPDATE send_queue SET state='SENDING'").run();assert.throws(()=>f.sendQueue.cancel(id),/SEND_QUEUE_SENDING/);
 f.store.db.prepare("UPDATE send_queue SET state='FAILED',reason='NOT_SUBMITTED'").run();
 assert.deepEqual(f.sendQueue.retry(id),{id});assert.equal(f.store.db.prepare('SELECT state FROM send_queue').get().state,'WAITING_SWITCH');
 f.store.db.prepare("UPDATE send_queue SET state='FAILED',reason='NOT_SUBMITTED'").run();
 assert.deepEqual(f.sendQueue.dismiss(id),{id});assert.equal(f.store.db.prepare('SELECT state,reason FROM send_queue').get().state,'CANCELLED');
 assert.throws(()=>f.sendQueue.dismiss(id),/SEND_QUEUE_NOT_DISMISSABLE/);
});

test('expired comments require an explicit override before they can be queued again',t=>{
 const f=reviewed(t,{autoReply:false});f.automation.afterReview(f.run.runId);
 const now=f.store.clock();f.store.db.prepare('UPDATE send_queue SET comment_published_at=?,expires_at=?').run(now-8*86400000,now-1);
 f.sendQueue.schedule();const expired=f.store.db.prepare('SELECT * FROM send_queue').get();assert.equal(expired.state,'EXPIRED');assert.equal(expired.reason,'COMMENT_TOO_OLD');
 assert.throws(()=>f.sendQueue.requeue(expired.id),/COMMENT_TOO_OLD/);
 assert.deepEqual(f.sendQueue.requeue(expired.id,{override:true}),{id:expired.id});
 const requeued=f.store.db.prepare('SELECT * FROM send_queue').get();assert.equal(requeued.state,'WAITING_SWITCH');assert.equal(requeued.reason,'MANUAL_RECOVERED');
});

test('manual send now requires one channel and freezes the chosen account and template',t=>{
 const f=reviewed(t,{autoReply:false,channels:['DM','COMMENT']});f.automation.afterReview(f.run.runId);
 const ids=f.store.db.prepare("SELECT id FROM send_queue WHERE state='WAITING_SWITCH'").all().map(row=>row.id);
 assert.throws(()=>f.sendQueue.sendNow({ids,accountId:'account',templateId:'dt'}),/SEND_QUEUE_CHANNEL_MIXED/);
 const dmId=f.store.db.prepare("SELECT id FROM send_queue WHERE channel='DM'").get().id;
 assert.deepEqual(f.sendQueue.sendNow({ids:[dmId],accountId:'account',templateId:'dt'}),{count:1});
 assert.equal(f.sendQueue.schedule().started,true);
 const row=f.store.db.prepare('SELECT * FROM send_queue WHERE id=?').get(dmId),job=f.store.db.prepare("SELECT * FROM jobs WHERE kind='SEND'").get(),payload=JSON.parse(job.payload);
 assert.equal(row.manual_now,1);assert.equal(row.state,'SENDING');assert.equal(payload.content,'合成私信');assert.equal(payload.basis.type,'MANUAL_QUEUE');
 assert.equal(f.store.db.prepare('SELECT issuer FROM authorizations WHERE id=?').get(job.authorization_id).issuer,'LOCAL_USER');
});

test('manual send now accepts a template pool and freezes one template per queued row',t=>{
 const f=reviewed(t,{autoReply:false,channels:['DM']});
 f.automation.afterReview(f.run.runId);
 f.store.db.exec("INSERT INTO configurations(id,kind,name,body,updated_at) VALUES('dt2','DM_TEMPLATE','私信模板2','{\"text\":\"合成私信2\"}',0),('dt3','DM_TEMPLATE','私信模板3','{\"text\":\"合成私信3\"}',0)");
 const source=f.store.db.prepare("SELECT * FROM send_queue WHERE channel='DM'").get();
 f.store.db.prepare('DELETE FROM send_queue').run();
 const insert=f.store.db.prepare("INSERT INTO send_queue(id,platform,run_id,review_id,comment_id,channel,recipient_id,origin,state,priority,manual_now,plan,comment_published_at,enqueued_at,expires_at,created_at,updated_at) VALUES(?,'XHS',?,?,?,'DM',?,'MANUAL_REVIEW','WAITING_SWITCH',0,0,?,?,?,?,?,?)");
 for(const [index,id] of ['q1','q2','q3'].entries())insert.run(id,source.run_id,source.review_id,source.comment_id,'recipient-'+index,source.plan,source.comment_published_at,source.enqueued_at,source.expires_at,source.created_at,source.updated_at);
 assert.throws(()=>f.sendQueue.sendNow({ids:['q1'],accountId:'account',templateIds:[]}),/SEND_QUEUE_TEMPLATE_REQUIRED/);
 assert.throws(()=>f.sendQueue.sendNow({ids:['q1'],accountId:'account',templateIds:['ct']}),/CONTACT_TEMPLATE_CHANGED/);
 assert.deepEqual(f.sendQueue.sendNow({ids:['q1','q2','q3'],accountId:'account',templateIds:['dt','dt2','dt3']}),{count:3});
 const picked=f.store.db.prepare("SELECT id,plan FROM send_queue ORDER BY id").all().map(row=>({id:row.id,template:JSON.parse(row.plan).templates}));
 assert.deepEqual(picked.map(item=>item.template.length),[1,1,1]);assert.equal(new Set(picked.map(item=>item.template[0].templateId)).size,3);
 assert.ok(picked.every(item=>['dt','dt2','dt3'].includes(item.template[0].templateId)));
 assert.ok(picked.every(item=>['合成私信','合成私信2','合成私信3'].includes(item.template[0].content)));
});

test('quota exhaustion leaves the item waiting with a remaining-quota summary',t=>{
 const f=reviewed(t,{autoReply:true,channels:['DM'],accounts:['account']});f.automation.afterReview(f.run.runId);
 const day=require('../dist/send-safety.cjs').currentQuotaDay(f.store);
 f.store.db.prepare('INSERT INTO account_days(account_id,day,occupied,daily_limit_override) VALUES(?,?,1,1) ON CONFLICT(account_id,day) DO UPDATE SET occupied=1,daily_limit_override=1').run('account',day);
 assert.deepEqual(f.sendQueue.schedule(),{started:false});
 const waiting=f.store.db.prepare('SELECT state,reason FROM send_queue').get();assert.equal(waiting.state,'WAITING_QUOTA');assert.equal(waiting.reason,'ACCOUNT_POOL_QUOTA_EXHAUSTED');
 assert.equal(f.sendQueue.summary().quota,1);assert.equal(f.sendQueue.summary().remaining,0);
 f.store.db.prepare('DELETE FROM account_days WHERE account_id=? AND day=?').run('account',day);
 assert.equal(f.sendQueue.schedule().started,true);
});

test('a queued comment still needs a fresh comment capability at send reservation',t=>{
 const f=reviewed(t,{autoReply:true,channels:['COMMENT']});f.automation.afterReview(f.run.runId);
 assert.equal(f.sendQueue.schedule().started,true);
 const lease=f.queue.claim('send');assert.throws(()=>new (require('../dist/send-safety.cjs').SendSafety)(f.store).reserve(lease),/COMMENT_CAPABILITY_REQUIRED/);
});

test('a settled send job records the queue item as sent',t=>{
 const f=reviewed(t,{autoReply:true});f.automation.afterReview(f.run.runId);
 assert.equal(f.sendQueue.schedule().started,true);
 const job=f.store.db.prepare("SELECT id FROM jobs WHERE kind='SEND'").get(),rowId=f.store.db.prepare('SELECT id FROM send_queue').get().id;
 f.store.db.prepare("UPDATE jobs SET state='SUCCEEDED',result='{\"ok\":true}' WHERE id=?").run(job.id);
 assert.deepEqual(f.sendQueue.settle(job.id),{id:rowId,state:'SENT',reason:null});
 const row=f.store.db.prepare('SELECT state,settled_at FROM send_queue').get();assert.equal(row.state,'SENT');assert.ok(row.settled_at);
});

test('expired queue rows are purged 30 days after settling',t=>{
 const f=reviewed(t,{autoReply:false});f.automation.afterReview(f.run.runId);
 const row=f.store.db.prepare('SELECT id FROM send_queue').get(),now=f.store.clock();
 f.store.db.prepare("UPDATE send_queue SET state='EXPIRED',reason='QUEUE_TOO_OLD',settled_at=? WHERE id=?").run(now-29*86400000,row.id);
 f.sendQueue.schedule();assert.equal(f.store.db.prepare('SELECT count(*) n FROM send_queue').get().n,1);
 f.store.db.prepare("UPDATE send_queue SET settled_at=? WHERE id=?").run(now-31*86400000,row.id);
 f.sendQueue.schedule();assert.equal(f.store.db.prepare('SELECT count(*) n FROM send_queue').get().n,0);
});

test('rule authorization requires registered sender, exact preview and selected current policy',t=>{
 const f=contactSetup(t);assert.throws(()=>f.automation.authorize({id:'rule',version:1,previewHash:'wrong',consent:'automatic-contact-frozen-run-v1'}),/AUTOMATION_CONSENT_REQUIRED/);
 assert.throws(()=>f.automation.frozen(['rule'],[]),/AUTOMATION_POLICY_NOT_SELECTED/);
 assert.throws(()=>new LocalAutomation(f.store).authorize({...f.automation.preview({id:'rule',version:1}),consent:'automatic-contact-frozen-run-v1'}),/SEND_EXECUTOR_UNAVAILABLE/);
 f.automation.revoke({id:'rule'});assert.throws(()=>f.automation.frozen(['rule'],[{id:'policy',revision:1}]),/AUTOMATION_POLICY_NOT_SELECTED/);
});

test('collection with automatic rules requires its own explicit combined consent',t=>{
 const f=contactSetup(t),{LocalWorkflow}=require('../dist/workflow.cjs'),w=new LocalWorkflow(f.store,null,{capabilities:()=>({collect:true,send:true})});
 const p=w.previewCollection({configId:'config',accountId:'account',policyIds:['policy'],ruleIds:['rule']});assert.equal(p.automaticRules,1);
 assert.throws(()=>w.authorizeCollection({...p,requestKey:'collect-auto',consent:'bounded-platform-read-once-v1'}),/COLLECTION_CONSENT_REQUIRED/);
 assert.ok(w.authorizeCollection({...p,requestKey:'collect-auto',consent:'bounded-read-with-frozen-contact-v1'}).id);
});