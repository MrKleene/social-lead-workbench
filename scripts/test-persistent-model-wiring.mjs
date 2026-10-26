// Exercise the actual launcher declarations with fake spawn/vault dependencies.
// No real process, model, key, database or instance is started or read.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
const source=readFileSync(new URL('./dev-persistent.mjs',import.meta.url),'utf8');
const start=source.indexOf("stage='services';"),end=source.indexOf('for(const c of [api,web,collector]',start);
assert(start>=0&&end>start,'Persistent service launch boundary must be reviewed when changed');
for(const backendOnly of [true,false])test(`persistent model vault routing, backendOnly=${backendOnly}`,()=>{
 const calls=[],pathRequests=[],env={DATABASE_URL:'FAKE-IN-MEMORY-ONLY',APP_ORIGIN:'http://127.0.0.1:12345'};
 runInNewContext(source.slice(start,end),{env,backendOnly,manifest:{id:'synthetic-instance',webPort:12345},process:{execPath:'synthetic-node'},modelVault:{vaultPath:id=>{pathRequests.push(id);return '/synthetic-private/model-vault/master.key';}},launch:(command,args,childEnv,options)=>{calls.push({command,args,env:childEnv,role:options.role});return {};}});
 assert.deepEqual(pathRequests,['synthetic-instance','synthetic-instance']);
 for(const role of ['collector','api']){const child=calls.find(c=>c.role===role);assert(child);assert.equal(child.env.CRM_MODEL_VAULT_FILE,'/synthetic-private/model-vault/master.key');assert.equal(child.env.APP_ORIGIN,env.APP_ORIGIN);assert.notEqual(child.env,env);}
 assert.equal(env.CRM_MODEL_VAULT_FILE,undefined,'Do not leak vault routing into general/web environment');
 const web=calls.find(c=>c.role==='web');assert.equal(!!web,!backendOnly);if(web)assert.equal(web.env.CRM_MODEL_VAULT_FILE,undefined);
 assert.equal(calls.length,backendOnly?2:3);
});
