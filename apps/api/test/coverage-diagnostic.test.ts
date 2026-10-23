import 'reflect-metadata';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {describe,it,expect,vi} from 'vitest';
import {safeCoverageDiagnostic,coverageDiagnosticSchema} from '@crm/contracts';
import {XhsMcpAdapter} from '../src/collection/adapters/xhs-mcp';
import {singlePostSummary} from '../src/collection/single-post.service';
import {semanticSnapshot,snapshotHash} from '../src/collection/semantic-evaluator';
import {checkpointCapture} from '../src/collection/capture-archive';
const fixture=JSON.parse(readFileSync(resolve(__dirname,'../../../scripts/mcp-avatar-diagnostics/coverage-cases.json'),'utf8')).diagnostic;
const clone=()=>structuredClone(fixture);
const id='0123456789abcdef01234567';
const rawComment={id:'root',content:'synthetic only',userInfo:{userId:'user'},subComments:[{id:'child',content:'synthetic reply',userInfo:{userId:'childuser'}}]};
describe('safe same-read coverage diagnostics',()=>{
 it('accepts the Go shared fixture and preserves missing / zero / false',()=>{
  const d=coverageDiagnosticSchema.parse(clone());expect(d.samples[0].hasMore).toEqual({state:'EXACT',value:false});expect(d.samples[0].groups[1].loaded.value).toBe(0);expect(d.samples[0].groups[1].declared.value).toBeNull();expect(d.totalScope).toBe('UNCONFIRMED');
 });
 it.each(['MISSING','NULL','INVALID'])('preserves %s without inventing false or zero',state=>{const d=clone();d.observation='UNAVAILABLE';d.samples[0].total={state,value:null};d.samples[0].hasMore={state,value:null};expect(safeCoverageDiagnostic(d)?.samples[0].hasMore).toEqual({state,value:null});d.samples[0].hasMore.value=false;expect(safeCoverageDiagnostic(d)).toBeUndefined();});
 it('rejects arbitrary strings, extra fields and inconsistent counters/trees',()=>{
  for(const mutate of [(d:any)=>d.secret='PRIVATE', (d:any)=>d.samples[0].ready.document='https://private', (d:any)=>d.samples[0].cursor='PRIVATE_CURSOR', (d:any)=>d.samples[0].loaded.uniqueKnown=3, (d:any)=>d.samples[0].groups[1].parent=2,(d:any)=>d.samples[0].total={state:'MISSING',value:0},(d:any)=>d.samples[0].groups[0].sourceId='PRIVATE_ID']){const d=clone();mutate(d);expect(safeCoverageDiagnostic(d)).toBeUndefined();}
 });
 it('validates count observations without claiming stable page or full coverage',()=>{const d=clone();d.samples[2].hasMore={state:'EXACT',value:true};expect(safeCoverageDiagnostic(d)).toBeUndefined();d.observation='CHANGED';expect(safeCoverageDiagnostic(d)?.observation).toBe('CHANGED');d.samples[2].ready.document='loading';expect(safeCoverageDiagnostic(d)).toBeUndefined();d.observation='UNAVAILABLE';expect(safeCoverageDiagnostic(d)).toBeDefined();});
 it.each([undefined,null,{...fixture,secret:'DO_NOT_RETURN'},fixture])('adapter to summary is optional, safe and never expands request scope',async diagnostic=>{
  const call=vi.fn().mockResolvedValue({content:[{type:'text',text:JSON.stringify({feed_id:id,data:{note:{noteId:id,title:'synthetic'},comments:{list:[rawComment]},coverageDiagnostic:diagnostic}})}]});
  const a=new XhsMcpAdapter({call},true,'XHS_MCP'),post=await a.postReference({postId:id,token:'SYNTHETIC_ONLY',source:'pc_feed'},new AbortController().signal),comments=a.receivedComments(post);
  expect(call).toHaveBeenCalledTimes(1);expect(call.mock.calls[0][1]).toMatchObject({load_all_comments:false,click_more_replies:false});
  const out=singlePostSummary(post,comments);expect(out.roots.count).toBe(1);expect(out.replies.count).toBe(1);expect(out.coverageDiagnostic).toEqual(safeCoverageDiagnostic(diagnostic)??null);
  expect(JSON.stringify(out)).not.toMatch(/SYNTHETIC_ONLY|synthetic only|childuser|DO_NOT_RETURN/);
  const {coverageDiagnostic:_,...bare}=post;expect(snapshotHash(semanticSnapshot(post,comments[0],undefined,false,false))).toBe(snapshotHash(semanticSnapshot(bare,comments[0],undefined,false,false)));
 });
 it('normal capture excludes transient diagnostic from persisted original text and hash',async()=>{
  const config:any={id:'cfg',enabled:true,revision:1},run:any={id:'run',configId:'cfg',revision:1,snapshot:{name:'synthetic',platform:'XHS',mode:'XHS_MCP',keywords:['synthetic'],excludeWords:[],batchLimit:1,enabled:true}},posts:any[]=[];
  const tx:any={$queryRaw:async()=>[config],collectionRun:{findUniqueOrThrow:async()=>({status:'RUNNING'}),update:vi.fn()},semanticControl:{findUnique:async()=>({enabled:false})},capturedPost:{findUnique:async()=>null,upsert:async(v:any)=>{posts.push(v);return {id:'saved'};},groupBy:async()=>[]},capturedComment:{groupBy:async()=>[]}};
  const db:any={$transaction:async(fn:any)=>fn(tx)};
  for(const diagnostic of [undefined,coverageDiagnosticSchema.parse(fixture)])await checkpointCapture(db,run,{posts:[{post:{id,title:'synthetic',coverageDiagnostic:diagnostic},comments:[],complete:false}]} as any);
  expect(posts[0].create.contentHash).toBe(posts[1].create.contentHash);expect(posts[0].create.snapshot).toEqual(posts[1].create.snapshot);expect(JSON.stringify(posts)).not.toContain('coverageDiagnostic');
 });
});
