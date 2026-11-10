import {expect,it,afterEach} from 'vitest';
import {mkdtemp,writeFile,rm,symlink,chmod} from 'node:fs/promises';
import {tmpdir} from 'node:os';import {join} from 'node:path';
import {readReplyJournal,executionEventSchema,journalRecordSchema} from '../src/adapters/auto-contact/reply-stage-journal';
import {prepareXhsReply,replyResultDiagnostic,verifyXhsReplyResult} from '@crm/domain/auto-contact/xhs-reply-protocol';
const id='aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa';const roots:string[]=[];afterEach(async()=>{await Promise.all(roots.splice(0).map(p=>rm(p,{recursive:true,force:true})));});
async function file(text:string){const dir=await mkdtemp(join(tmpdir(),'synthetic-stage-'));roots.push(dir);const path=join(dir,`reply-stage-${id}.jsonl`);await writeFile(path,text,{mode:0o600});return {dir,path};}
const row={sequence:1,attemptId:id,stage:'ATTEMPTED',at:'2026-10-27T00:00:00.000Z'};
it('reads bounded durable stages without interpreting them as receipt or retry permission',async()=>{const f=await file(JSON.stringify(row)+'\n');expect(await readReplyJournal(f.dir,id)).toEqual({state:'AVAILABLE',records:[row]});});
it('keeps intact prefix on torn write, marks truncated',async()=>{const f=await file(JSON.stringify(row)+'\n{"sequence":');expect(await readReplyJournal(f.dir,id)).toEqual({state:'TRUNCATED',records:[row]});});
it.each([{...row,token:'secret'}, {...row,sequence:2},{...row,attemptId:'bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb'},{...row,stage:'SECRET'},{...row,at:'yesterday'}])('rejects untrusted/mismatched journal %#',async r=>{const f=await file(JSON.stringify(r)+'\n');expect(await readReplyJournal(f.dir,id)).toEqual({state:'INVALID',records:[]});});
it('rejects symlink/oversize/public file and invalid attempt path',async()=>{const f=await file('x'.repeat(131073));expect((await readReplyJournal(f.dir,id)).state).toBe('INVALID');await writeFile(f.path,JSON.stringify(row)+'\n');await chmod(f.path,0o644);expect((await readReplyJournal(f.dir,id)).state).toBe('INVALID');await rm(f.path);await symlink('/dev/null',f.path);expect((await readReplyJournal(f.dir,id)).state).toBe('INVALID');expect((await readReplyJournal(f.dir,'../secret')).state).toBe('INVALID');});
it('missing journal stays unknown evidence',async()=>{const f=await file('');await rm(f.path);expect(await readReplyJournal(f.dir,id)).toEqual({state:'MISSING',records:[]});});
function envelope(){const c=prepareXhsReply({platform:'XHS',channel:'COMMENT',accountId:'a',requestKey:'synthetic',postId:'a'.repeat(24),commentId:'b'.repeat(24),recipientId:'c'.repeat(24),content:'private body'},{accountId:'a',senderId:'d'.repeat(24),postReference:{postId:'a'.repeat(24),token:'private-token',source:'pc_feed'}});return {c,raw:{protocol:c.protocol,attemptId:c.attemptId,accountId:c.accountId,requestKey:c.requestKey,kind:'UNKNOWN',processStopped:true,reason:'UNCONFIRMED',diagnostic:{stage:'SUBMIT',code:'DRIVER_PANIC',checks:{post:'MATCH',sender:'MATCH',target:'MATCH',author:'MATCH'}}}};}
it('preserves safe UNKNOWN diagnosis without upgrading outcome or saving raw payload',()=>{const {c,raw}=envelope();const d=replyResultDiagnostic(c,raw);expect(d).toEqual({kind:'UNKNOWN',envelopeValid:true,diagnostic:{stage:'SUBMIT',code:'DRIVER_PANIC'}});expect(verifyXhsReplyResult(c,raw).kind).toBe('UNKNOWN');expect(JSON.stringify(d)).not.toContain('private');expect(replyResultDiagnostic(c,{...raw,accountId:'other'})).toEqual({kind:'INVALID',envelopeValid:false});expect(replyResultDiagnostic(c,{...raw,diagnostic:{...raw.diagnostic,code:'PRIVATE_SECRET'}})).not.toHaveProperty('diagnostic');});
it('audit projection rejects arbitrary diagnostic codes, fields and tokens',()=>{expect(executionEventSchema.safeParse({stage:'RPC_RETURNED',protocolAttemptId:id,kind:'UNKNOWN',envelopeValid:false,diagnostic:{stage:'SUBMIT',code:'PRIVATE_SECRET'}}).success).toBe(false);expect(executionEventSchema.safeParse({stage:'RPC_INTENT',protocolAttemptId:id,token:'secret'}).success).toBe(false);});

it('receipt projection accepts bounded structural evidence and rejects credentials/raw payload',async()=>{
 const receipt={state:'RESPONSE_CAPTURED',status:200,endpointSha256:'f'.repeat(64),fields:[{path:'/data/id',type:'string',publicId:'e'.repeat(24)},{path:'/success',type:'boolean',boolean:true}]};
 const record={...row,stage:'RECEIPT_CAPTURE',receipt};const f=await file(JSON.stringify(record)+'\n');expect((await readReplyJournal(f.dir,id)).state).toBe('AVAILABLE');
 for(const bad of [{...receipt,rawBody:'secret'},{...receipt,fields:[{path:'/token',type:'string'}]},{...receipt,fields:[{path:'/msg',type:'string',text:'private'}]}]){const f=await file(JSON.stringify({...record,receipt:bad})+'\n');expect((await readReplyJournal(f.dir,id)).state).toBe('INVALID')}
});
it('initial binding diagnostics remain evidence only; accepted solely as fixed stage enums',async()=>{for(const stage of ['INITIAL_BINDING_WAIT','INITIAL_BINDING_MATCHED','INITIAL_BINDING_EMPTY_TIMEOUT']){const f=await file(JSON.stringify({...row,stage})+'\n');expect((await readReplyJournal(f.dir,id)).state).toBe('AVAILABLE');}const f=await file(JSON.stringify({...row,stage:'INITIAL_BINDING_MATCHED',boundTarget:'invented'})+'\n');expect((await readReplyJournal(f.dir,id)).state).toBe('INVALID');});

import {selectionEvidenceSchema} from '@crm/domain/auto-contact/selection-evidence';
it('selection evidence is fixed enums, never raw state or replacement confirmation',async()=>{
 const selection={frame:'TOP',target:'UNIQUE',depth:'ROOT',button:'EXACT',centerHit:'COVERED',component:'MATCH',handler:'PRESENT',bindingShape:'PLAIN',binding:'EMPTY',editor:'EMPTY',replyUI:'ACTIVE',focused:true};
 expect(selectionEvidenceSchema.safeParse(selection).success).toBe(true);
 for(const change of [{token:'secret'},{component:'private author'},{centerHit:{x:20}},{binding:'CONFIRMED'}])expect(selectionEvidenceSchema.safeParse({...selection,...change}).success).toBe(false);
 const f=await file(JSON.stringify({...row,stage:'SELECTION_STOPPED',selection})+'\n');expect((await readReplyJournal(f.dir,id)).records[0].selection).toEqual(selection);
});

it('keeps safe failure diagnostics and rejects arbitrary platform text',()=>{
 const base={sequence:1,attemptId:'11111111-1111-4111-8111-111111111111',stage:'RECEIPT_CAPTURE',at:'2026-11-03T08:43:00.000Z',receipt:{state:'RESPONSE_CAPTURED',failure:{category:'BUSINESS_REJECTION',code:-9131,messageClass:'UNSPECIFIED'}}};
 expect(journalRecordSchema.safeParse(base).success).toBe(true);
 expect(journalRecordSchema.safeParse({...base,receipt:{...base.receipt,failure:{...base.receipt.failure,message:'secret'}}}).success).toBe(false);
});
