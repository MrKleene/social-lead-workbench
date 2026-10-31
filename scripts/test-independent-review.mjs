// Fresh owned tmpfs containers only; no .env, production data, real credentials or external model calls.
import {spawnSync} from 'node:child_process';
import {randomBytes} from 'node:crypto';
import {mkdtempSync,writeFileSync,readFileSync,readdirSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url)),output=mkdtempSync(join(tmpdir(),'crm-independent-review-pg-')),id=randomBytes(8).toString('hex'),password=randomBytes(24).toString('hex'),containers=[],results=[];
const safe=s=>String(s??'').replaceAll(password,'[REDACTED]');
function docker(args){const r=spawnSync('docker',args,{env:{...process.env,POSTGRES_PASSWORD:password},encoding:'utf8',timeout:20000});assert.equal(r.status,0,safe(r.stderr));return r.stdout.trim();}
function launch(kind,image,port,args){const c=docker(['run','--detach','--rm','--pull=never','--name',`crm-independent-review-${kind}-${id}`,'--label',`crm.acceptance=${id}`,'--tmpfs',`${kind==='pg'?'/var/lib/postgresql/data':'/data'}:rw,size=536870912`,'-p',`127.0.0.1::${port}`,...args,image,...(kind==='redis'?['redis-server','--save','','--appendonly','no']:[])]);containers.push(c);const info=JSON.parse(docker(['inspect',c]))[0];assert(!info.Mounts.some(m=>['bind','volume'].includes(m.Type)));const map=info.NetworkSettings.Ports[`${port}/tcp`][0];assert.equal(map.HostIp,'127.0.0.1');return {id:c,port:map.HostPort};}
async function ready(c,args){for(let i=0;i<40;i++){if(spawnSync('docker',['exec',c,...args],{stdio:'ignore'}).status===0)return;await new Promise(r=>setTimeout(r,250));}throw Error('isolated service not ready');}
function run(label,args,env){const r=spawnSync(args[0],args.slice(1),{cwd:root,env,encoding:'utf8',timeout:120000,maxBuffer:16000000});writeFileSync(join(output,label+'.log'),safe(r.stdout)+'\n'+safe(r.stderr));results.push({label,exit:r.status});console.log(label+': '+r.status);if(r.status!==0)console.log(safe(r.stdout)+'\n'+safe(r.stderr));assert.equal(r.status,0,label+' failed');return r.stdout;}
try{
 const pg=launch('pg','postgres:17',5432,['-e','POSTGRES_DB=crm_test','-e','POSTGRES_USER=crmtest','-e','POSTGRES_PASSWORD']),redis=launch('redis','redis:7-alpine',6379,[]);
 await ready(pg.id,['pg_isready','-U','crmtest','-d','crm_test']);await ready(redis.id,['redis-cli','ping']);
 const url=`postgresql://crmtest:${password}@127.0.0.1:${pg.port}/crm_test?schema=public`,env={...process.env,DATABASE_URL:url,TEST_DATABASE_URL:url,REDIS_URL:`redis://127.0.0.1:${redis.port}`,DOTENV_CONFIG_PATH:'/dev/null',XHS_MCP_ENABLED:'0',CRM_MOCK_ONLY:'1',COLLECTION_QUEUE_NAME:'crm-independent-review-'+id};
 run('migrate',['node','node_modules/prisma/build/index.js','migrate','deploy'],env);
 const diff=run('schema-diff',['node','node_modules/prisma/build/index.js','migrate','diff','--from-url',url,'--to-schema-datamodel','prisma/schema.prisma','--script'],env);
 // Existing account/contact FK and checkpoint-name drift predates this migration.
 assert(!/SemanticReview|SemanticModelCall|CommentReviewPolicy|ManualReviewJob|AutoReviewJob|AutoContact|ModelSettings|CollectionConfig/.test(diff),'independent review migration must match its schema');
 const sql=(database,input)=>{const r=spawnSync('docker',['exec','-i',pg.id,'psql','-X','-U','crmtest','-d',database,'-v','ON_ERROR_STOP=1'],{input,encoding:'utf8',timeout:20000});assert.equal(r.status,0,safe(r.stderr));return r.stdout;};
 sql('crm_test','CREATE DATABASE crm_migration_test;');
 const migrations=readdirSync(join(root,'prisma/migrations')).filter(n=>n!=='migration_lock.toml').sort(),last='202610260002_independent_comment_review';
 for(const name of migrations.filter(n=>n<last))sql('crm_migration_test',readFileSync(join(root,'prisma/migrations',name,'migration.sql'),'utf8'));
 sql('crm_migration_test',`INSERT INTO "CollectionConfig" (id,name,platform,keywords,"excludeWords","semanticRules","commentRules","updatedAt") VALUES ('legacy-fixture','合成旧配置','XHS',ARRAY['搜索独立'],ARRAY['评论排除'],'{"version":1,"target":"识别评论中明确写出学科名称的人","reviewThreshold":70}','{"version":1,"targetDescription":"保留旧词条"}',now());
 INSERT INTO "ModelSettings" (id,model,"priceVersion",consent,"dailyLimit",note,"encryptedKey","updatedAt") VALUES ('fixture','qwen3.8-flash','fixture',false,2,'合成描述','{"synthetic":"NOT A REAL KEY"}',now());
 CREATE TABLE fixture_before AS SELECT to_jsonb(c) AS snapshot FROM "CollectionConfig" c;
 CREATE TABLE fixture_model_before AS SELECT to_jsonb(m) AS snapshot FROM "ModelSettings" m;`);
 sql('crm_migration_test',readFileSync(join(root,'prisma/migrations',last,'migration.sql'),'utf8'));
 sql('crm_migration_test',`DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM "CollectionConfig" c,fixture_before f WHERE to_jsonb(c)-'legacyMatchingEnabled'=f.snapshot AND NOT c."legacyMatchingEnabled") THEN RAISE EXCEPTION 'source changed'; END IF;
 IF NOT EXISTS(SELECT 1 FROM "ModelSettings" m,fixture_model_before f WHERE to_jsonb(m)=f.snapshot) THEN RAISE EXCEPTION 'model changed'; END IF;
 IF NOT EXISTS(SELECT 1 FROM "CommentReviewPolicy" p JOIN "CommentReviewPolicyVersion" v ON p.id=v."policyId" WHERE p.id='legacy-legacy-fixture' AND NOT p.enabled AND p.revision=1 AND p.target=v.target AND p.target='识别评论中明确写出学科名称的人') THEN RAISE EXCEPTION 'disabled policy migration failed'; END IF;
 END $$;`);sql('crm_migration_test',`UPDATE "CommentReviewPolicy" SET enabled=true; UPDATE "ModelSettings" SET consent=true; CREATE TABLE fixture_policy_before AS SELECT to_jsonb(p) AS snapshot FROM "CommentReviewPolicy" p;`);
 sql('crm_migration_test',readFileSync(join(root,'prisma/migrations/202610260003_review_automation/migration.sql'),'utf8'));
 sql('crm_migration_test',`DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM "CommentReviewPolicy" p,fixture_policy_before f WHERE to_jsonb(p)-'autoEnabled'-'autoModelVersion'-'autoActorId'=f.snapshot AND p.enabled AND NOT p."autoEnabled" AND p."autoModelVersion" IS NULL AND p."autoActorId" IS NULL) THEN RAISE EXCEPTION 'legacy consent became automation'; END IF; END $$;`);
 sql('crm_migration_test',readFileSync(join(root,'prisma/migrations/202610260004_manual_post_review/migration.sql'),'utf8'));
 sql('crm_migration_test',`DO $$ BEGIN IF (SELECT count(*) FROM "ManualReviewJob")<>0 OR EXISTS(SELECT 1 FROM "CommentReviewPolicy" WHERE "autoEnabled") THEN RAISE EXCEPTION 'manual migration changed automation'; END IF; END $$;`);
 sql('crm_migration_test',`UPDATE "CommentReviewPolicy" SET "autoEnabled"=true,"autoModelVersion"=1,"autoActorId"='synthetic';
 INSERT INTO "AutoReviewJob" (id,"policyId","policyVersion","postId","runId",status,"updatedAt") VALUES ('old-auto','legacy-legacy-fixture',1,'synthetic-post','synthetic-run','PENDING',now());
 INSERT INTO "ManualReviewJob" (id,"policyId","policyRevision","modelVersion",model,"priceVersion","actorId","postId",title,coverage,"scopeHash",items,preview,status,"updatedAt") VALUES ('old-manual','legacy-legacy-fixture',1,1,'fixture','fixture','synthetic','synthetic-post','合成帖子','PARTIAL','old-hash','[]','{"redactionVersion":"contact-redaction-v1","target":"合成目标","items":[]}','PENDING',now());
 CREATE TABLE fixture_manual_before AS SELECT to_jsonb(m) AS snapshot FROM "ManualReviewJob" m;
 CREATE TABLE fixture_model_raw_before AS SELECT to_jsonb(m) AS snapshot FROM "ModelSettings" m;`);
 sql('crm_migration_test',readFileSync(join(root,'prisma/migrations/202610260005_original_comment_input/migration.sql'),'utf8'));
 sql('crm_migration_test',`DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM "CommentReviewPolicy" WHERE "autoEnabled") THEN RAISE EXCEPTION 'raw migration enabled auto'; END IF;
 IF NOT EXISTS(SELECT 1 FROM "ModelSettings" m, fixture_model_raw_before f WHERE to_jsonb(m)-'consentInputPolicy'-'consent'-'version'=f.snapshot-'consent'-'version' AND NOT m.consent AND m."consentInputPolicy" IS NULL AND m.version=(f.snapshot->>'version')::int+1) THEN RAISE EXCEPTION 'key/budget changed or consent migrated'; END IF;
 IF NOT EXISTS(SELECT 1 FROM "ManualReviewJob" m, fixture_manual_before f WHERE m.status='INVALIDATED' AND to_jsonb(m)-'status'-'reason'-'updatedAt'=f.snapshot-'status'-'reason'-'updatedAt') THEN RAISE EXCEPTION 'old manual input changed or not invalidated'; END IF;
 IF NOT EXISTS(SELECT 1 FROM "AutoReviewJob" WHERE status='CANCELLED' AND "inputPolicyVersion"='contact-redaction-v1') THEN RAISE EXCEPTION 'old auto not cancelled'; END IF;
 IF NOT EXISTS(SELECT 1 FROM "CollectionConfig" c,fixture_before f WHERE to_jsonb(c)-'legacyMatchingEnabled'=f.snapshot) THEN RAISE EXCEPTION 'source mutated'; END IF;
 END $$;`);
 results.push({label:'original-input-migration-invalidates-old-consent-and-jobs-preserves-source-key-budget',exit:0});
 results.push({label:'upgrade-preserves-existing-data-and-disabled-target',exit:0});console.log('upgrade preservation: 0');
 sql('crm_migration_test',`INSERT INTO "PlatformAccount" (id,platform,label,"isDemo") VALUES ('legacy-account','XHS','合成旧账号',true);
 INSERT INTO "PlatformIdentity" (id,platform,"platformUserId",nickname) VALUES ('legacy-identity','XHS','synthetic-user','合成');
 INSERT INTO "ContactLedger" (id,"identityId","accountId") VALUES ('legacy-ledger','legacy-identity','legacy-account');
 INSERT INTO "ContactAttempt" (id,"ledgerId","requestKey",kind,outcome,day,"actorId","updatedAt") VALUES ('legacy-attempt','legacy-ledger','legacy-key','FIRST','SIMULATED_SUCCESS','2026-10-26','synthetic',now());
 INSERT INTO "AccountDay" ("accountId",day,occupied) VALUES ('legacy-account','2026-10-26',1);
 CREATE TABLE fixture_contact_before AS SELECT to_jsonb(a) AS snapshot FROM "ContactAttempt" a;
 CREATE TABLE fixture_ledger_before AS SELECT to_jsonb(a) AS snapshot FROM "ContactLedger" a;`);
 sql('crm_migration_test',readFileSync(join(root,'prisma/migrations/202610270001_auto_contact/migration.sql'),'utf8'));
 sql('crm_migration_test',`DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM "AutoContactRule") OR EXISTS(SELECT 1 FROM "AutoContactJob") THEN RAISE EXCEPTION 'sending migration created business activity'; END IF;
 IF NOT EXISTS(SELECT 1 FROM "ContactAttempt" a,fixture_contact_before f WHERE to_jsonb(a)-'jobId'-'mode'-'channel'-'content'-'platformReceipt'-'attemptedAt'-'confirmedAt'=f.snapshot AND a.mode='LEGACY_SIMULATION') THEN RAISE EXCEPTION 'legacy attempt changed'; END IF;
 IF NOT EXISTS(SELECT 1 FROM "ContactLedger" a,fixture_ledger_before f WHERE to_jsonb(a)-'mode'=f.snapshot AND a.mode='LEGACY_SIMULATION') THEN RAISE EXCEPTION 'legacy ledger changed'; END IF;
 IF NOT EXISTS(SELECT 1 FROM "AccountDay" WHERE day='2026-10-26' AND occupied=1) THEN RAISE EXCEPTION 'UTC quota reset'; END IF;
 END $$;`);
 results.push({label:'auto-contact-preserves-legacy-simulation-utc-and-default-off',exit:0});
 const presetMigration='202610300001_automation_presets';
 for(const name of migrations.filter(n=>n>'202610270001_auto_contact'&&n<presetMigration))sql('crm_migration_test',readFileSync(join(root,'prisma/migrations',name,'migration.sql'),'utf8'));
 sql('crm_migration_test',`INSERT INTO "AutoContactRule" (id,platform,"policyId","policyRevision",channel,content,enabled,"authorizedHash","updatedAt") VALUES ('legacy-rule','XHS','legacy-legacy-fixture',1,'COMMENT','保留原正文',true,'unchanged-authorization',now());
 CREATE TABLE fixture_rule_before AS SELECT to_jsonb(r) AS snapshot FROM "AutoContactRule" r;
 CREATE TABLE fixture_attempt_presets_before AS SELECT to_jsonb(a) AS snapshot FROM "ContactAttempt" a;
 CREATE TABLE fixture_quota_presets_before AS SELECT to_jsonb(a) AS snapshot FROM "AccountDay" a;`);
 sql('crm_migration_test',readFileSync(join(root,'prisma/migrations',presetMigration,'migration.sql'),'utf8'));
 sql('crm_migration_test',`DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM "AutoContactRule" r,fixture_rule_before f WHERE to_jsonb(r)-'channels'-'templateId'-'templateVersion'=f.snapshot AND r.channels=ARRAY[r.channel] AND r."templateId" IS NULL) THEN RAISE EXCEPTION 'preset migration changed rule authorization'; END IF;
 IF EXISTS((SELECT to_jsonb(a) FROM "ContactAttempt" a) EXCEPT (SELECT snapshot FROM fixture_attempt_presets_before)) THEN RAISE EXCEPTION 'preset migration changed attempts'; END IF;
 IF EXISTS((SELECT to_jsonb(a) FROM "AccountDay" a) EXCEPT (SELECT snapshot FROM fixture_quota_presets_before)) THEN RAISE EXCEPTION 'preset migration changed quota'; END IF;
 IF EXISTS(SELECT 1 FROM "AutomationPreferences") THEN RAISE EXCEPTION 'migration chose a new default'; END IF;
 END $$;`);
 results.push({label:'presets-preserve-authorized-rule-content-channel-attempts-quota-and-defaults',exit:0});
 const acceptancePostsMigration='202610310002_normal_acceptance_posts';
 for(const name of migrations.filter(n=>n>presetMigration&&n<acceptancePostsMigration))sql('crm_migration_test',readFileSync(join(root,'prisma/migrations',name,'migration.sql'),'utf8'));
 sql('crm_migration_test',`INSERT INTO "NormalAutomationAcceptance" (id,state,scope,"actorId","runId","capturedPostId","modelCallId","reviewIds","sendJobId","closedAt") VALUES ('old-scope','CLOSED','{}','synthetic','old-run','old-post','old-call',ARRAY['old-review'],'old-send',now()); CREATE TABLE fixture_scope_before AS SELECT to_jsonb(a) AS snapshot FROM "NormalAutomationAcceptance" a;`);
 sql('crm_migration_test',readFileSync(join(root,'prisma/migrations',acceptancePostsMigration,'migration.sql'),'utf8'));
 sql('crm_migration_test',`DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM "NormalAutomationAcceptance" a,fixture_scope_before f WHERE to_jsonb(a)-'batchPlanned'=f.snapshot AND NOT a."batchPlanned") THEN RAISE EXCEPTION 'acceptance claim changed'; END IF;
 IF NOT EXISTS(SELECT 1 FROM "NormalAcceptancePost" WHERE "acceptanceId"='old-scope' AND "postId"='old-post' AND "modelCallId"='old-call' AND "reviewIds"=ARRAY['old-review']) THEN RAISE EXCEPTION 'old post claim not retained'; END IF;
 END $$;`);
 results.push({label:'multi-post-preserves-closed-scope-run-model-send-and-review-claims',exit:0});
 run('integration',['npm','run','test:integration','-w','@crm/api'],env);
}finally{for(const c of containers.reverse())docker(['stop',c]);writeFileSync(join(output,'checks.json'),JSON.stringify({results,isolated:true,removed:containers.length},null,2));console.log('Evidence: '+output);}
