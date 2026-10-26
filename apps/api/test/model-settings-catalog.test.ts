import 'reflect-metadata';
import {beforeEach,describe,expect,it,vi} from 'vitest';
import type {Db} from '../src/common/db';
import type {Actor} from '../src/auth/security';
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
  expect(result).toMatchObject({configured:false,model:'qwen3.8-flash',dailyLimit:1,automaticTest:false});
  expect(result.models.map(m=>m.id)).toEqual(['qwen3.8-flash','qwen3.8-max','qwen3.8-max-0902']);
  expect(result.models.find(m=>m.id==='qwen3.8-max')?.priceVersion).toBe('beijing-2026-10-26');
  expect(decrypt).not.toHaveBeenCalled();expect(db.$transaction).not.toHaveBeenCalled();
 });
 it.each(['qwen3.7-flash-2026-07-15','qwen3.7-plus-2026-05-26'])('keeps saved %s and its existing price confirmation without switching defaults',async model=>{
  const db=database(row(model)),service=new ModelSettingsService(db as unknown as Db),status=await service.status(actor),resolved=await service.resolve();
  expect(status.model).toBe(model);expect(status.models.map(m=>m.id)).toContain(model);expect(status.priceVersion).toBe('beijing-2026-10-21');
  expect(resolved.status.state).toBe('READY');expect(resolved.key).toBeUndefined();expect(JSON.stringify(status)).not.toContain('FAKE-UNIT-ONLY-KEY');expect(db.$transaction).not.toHaveBeenCalled();
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
});
