import 'reflect-metadata';
import {beforeEach,describe,expect,it,vi} from 'vitest';
import type {Db} from '../src/common/db';
import type {Actor} from '../src/auth/security';
import {QwenMatchingService} from '../src/collection/qwen-matching.service';
import {ModelSettingsService} from '../src/model-settings/model-settings.service';
import {probe,decrypt} from '../../../runtime/model-vault.cjs';
vi.mock('../../../runtime/model-vault.cjs',()=>({probe:vi.fn(()=> 'READY'),decrypt:vi.fn(()=> 'FAKE-UNIT-ONLY-KEY'),encrypt:vi.fn(),VaultError:class extends Error{code='MOCK';}}));
const actor:Actor={id:'fixture',name:'fixture',email:'fixture@example.invalid',role:'ADMIN'};
const row=(model:string,priceVersion='beijing-2026-10-21')=>({id:'qwen-comment-matching',model,priceVersion,version:1,endpoint:'beijing-standard',dailyLimit:2,consent:true,note:'synthetic',encryptedKey:{fixture:true},updatedAt:null});
const database=(value:ReturnType<typeof row>|null)=>({modelSettings:{findUnique:vi.fn(async()=>value)},$transaction:vi.fn()});
beforeEach(()=>vi.clearAllMocks());
describe('model catalog settings: mocked database and vault, no filesystem or HTTP',()=>{
 it('new settings expose current text choices without provisioning or saving anything',async()=>{
  const db=database(null),result=await new ModelSettingsService(db as unknown as Db).status(actor);
  expect(result).toMatchObject({configured:false,model:'qwen3.8-flash',dailyLimit:null,automaticTest:false});
  expect(result.models.map(m=>m.id)).toEqual(['qwen3.8-flash','qwen3.8-max','qwen3.8-max-0902']);
  expect(result.models.find(m=>m.id==='qwen3.8-max')?.priceVersion).toBe('beijing-2026-10-26');
  expect(decrypt).not.toHaveBeenCalled();expect(db.$transaction).not.toHaveBeenCalled();
 });
 it.each(['qwen3.7-flash-2026-07-15','qwen3.7-plus-2026-05-26'])('keeps saved %s and its existing price confirmation without switching defaults',async model=>{
  const db=database(row(model)),service=new ModelSettingsService(db as unknown as Db),status=await service.status(actor),resolved=await service.resolve();
  expect(status.model).toBe(model);expect(status.models.map(m=>m.id)).toContain(model);expect(status.priceVersion).toBe('beijing-2026-10-21');
  expect(decrypt).not.toHaveBeenCalled();expect(resolved.status.state).toBe('READY');expect(resolved.key).toBeUndefined();expect(JSON.stringify(status)).not.toContain('FAKE-UNIT-ONLY-KEY');expect(db.$transaction).not.toHaveBeenCalled();
 });
 it('a Max price mismatch blocks before decryption or a settings write',async()=>{
  const db=database(row('qwen3.8-max')),service=new ModelSettingsService(db as unknown as Db);
  expect((await service.resolve()).status.state).toBe('INVALID_CONFIG');expect(decrypt).not.toHaveBeenCalled();
  await expect(service.save(actor,{version:1,model:'qwen3.8-max',endpoint:'beijing-standard',dailyLimit:2,note:'',priceVersion:'beijing-2026-10-21',confirmPricing:true,consent:true})).rejects.toThrow();
  expect(db.$transaction).not.toHaveBeenCalled();
 });
 it('verified Max uses the regional endpoint and withholds the mock key from metadata',async()=>{
  const service=new ModelSettingsService(database(row('qwen3.8-max','beijing-2026-10-26')) as unknown as Db);
  expect(await service.resolve()).toMatchObject({status:{state:'READY',model:'qwen3.8-max'},endpoint:'https://cn-beijing.maas.qianwenaiapi.com/compatible-mode/v1/chat/completions'});
  expect((await service.resolve()).key).toBeUndefined();expect(probe).not.toHaveBeenCalled();
 });
 it('configured metadata and unauthorized Key access never decrypt a credential',async()=>{
  const db=database({...row('qwen3.8-flash'),consent:false}),service=new ModelSettingsService(db as unknown as Db);
  await service.status(actor);expect((await service.resolve()).status.state).toBe('READY');
  expect((await service.resolve(db as unknown as Db,true)).status.state).toBe('UNAUTHORIZED');expect(decrypt).not.toHaveBeenCalled();
 });
 it('null allows arbitrarily high request counts while finite caps, switch, cooldown and concurrent reservation still block',async()=>{
  let limit:number|null=null,enabled=true,active=0,last:Date|null=null;
  const db={semanticControl:{findUnique:async()=>({enabled,version:1})},semanticModelCall:{aggregate:async()=>({_count:{_all:1000000},_sum:{inputTokens:0,outputTokens:0}}),findFirst:async()=>last?{status:'COMPLETED',createdAt:last}:null,count:async(args:any)=>args.where.status?active:0}};
  const settings=()=>({status:{state:'READY' as const,message:'mock',model:'qwen3.8-flash',region:'cn-beijing' as const,dailyLimit:limit,batchLimit:5,automaticRetries:0 as const,timeoutSeconds:20}});
  const transport=vi.fn(),q=new QwenMatchingService(db as unknown as Db,{settings,transport});
  expect((await q.status(db as unknown as Db,'fixture')).usage.canCall).toBe(true);
  limit=100;expect((await q.status(db as unknown as Db,'fixture')).usage.canCall).toBe(false);
  limit=null;enabled=false;expect((await q.status(db as unknown as Db,'fixture')).usage.canCall).toBe(false);
  enabled=true;active=1;expect((await q.status(db as unknown as Db,'fixture')).usage.canCall).toBe(false);
  active=0;last=new Date();expect((await q.status(db as unknown as Db,'fixture')).usage.canCall).toBe(false);
  last=new Date(Date.now()-31000);expect((await q.status(db as unknown as Db,'fixture')).usage.canCall).toBe(true);expect(transport).not.toHaveBeenCalled();
 });

});
