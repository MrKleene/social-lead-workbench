import 'reflect-metadata';
import {describe,it,expect,vi} from 'vitest';
import {commentStreamInput,commentStreamWindow,orderCommentIndex,readSavedCommentStream,type CommentIndex} from '../src/collection/saved-comment-stream';
import {CaptureService} from '../src/collection/capture.service';
const row=(id:string,parent:string|null=null,n=0,matches=true):CommentIndex=>({id:'capture-'+id,commentId:id,parent,createdAt:new Date(1000+n),versions:1,matches});
describe('saved-only comment stream',()=>{
 it('loads parents before replies across batches without dropping a child received before its parent',()=>{
  const rows=[row('reply','root',0),row('other',null,2),row('root',null,1),...Array.from({length:65},(_,i)=>row('child'+i,'root',3+i))];
  const first=commentStreamWindow(rows,undefined,30),second=commentStreamWindow(rows,first.items.at(-1)!.commentId,30),last=commentStreamWindow(rows,second.items.at(-1)!.commentId,30);
  expect(first.items[0].commentId).toBe('root');expect(first.items[1].commentId).toBe('reply');expect(second.context.map(r=>r.commentId)).toEqual(['root']);expect(last.hasMore).toBe(false);
  const loaded=[...first.items,...second.items,...last.items];expect(new Set(loaded.map(r=>r.commentId)).size).toBe(rows.length);expect(loaded).toHaveLength(rows.length);
 });
 it('search matches retain actual ancestors without turning ancestors into matching results',()=>{
  const result=commentStreamWindow([row('root',null,0,false),row('child','root',1,false),row('hit','child',2,true)]);
  expect(result.items.map(r=>r.commentId)).toEqual(['hit']);expect(result.context.map(r=>r.commentId)).toEqual(['root','child']);expect(result.matched).toBe(1);
 });
 it('preserves orphan and cyclic identities without fabricating a root or looping',()=>{
  const rows=[row('orphan','missing'),row('a','b'),row('b','a'),row('self','self')];
  expect(new Set(orderCommentIndex(rows).map(r=>r.commentId)).size).toBe(4);expect(commentStreamWindow(rows).items).toHaveLength(4);
  expect(()=>commentStreamWindow(rows,'unknown')).toThrow('发生变化');
 });
 it('validates filters, binds cursors to post/search, and uses a fixed record creation boundary',async()=>{
  const rows=Array.from({length:31},(_,i)=>row(String(i),null,i));
  const db:any={$queryRaw:vi.fn().mockResolvedValue(rows),capturedComment:{findMany:vi.fn().mockImplementation(({where}:any)=>Promise.resolve(where.id.in.map((id:string)=>({id}))))}};
  const first=await readSavedCommentStream(db,'cfg',{postId:'post',q:'%',kind:'all'});expect(first.items).toHaveLength(30);expect(first.nextCursor).toBeTruthy();
  const last=await readSavedCommentStream(db,'cfg',{postId:'post',q:'%',kind:'all',cursor:first.nextCursor!});expect(last.items).toHaveLength(1);expect(last.snapshotAt).toBe(first.snapshotAt);expect(last.nextCursor).toBeNull();
  const args=db.$queryRaw.mock.calls[1];expect(args.some((v:unknown)=>v instanceof Date&&v.toISOString()===first.snapshotAt)).toBe(true);expect(args[0].join('')).toContain('strpos');expect(args[0].join('')).toContain('"createdAt"<=');
  await expect(readSavedCommentStream(db,'cfg',{postId:'different',q:'%',kind:'all',cursor:first.nextCursor!})).rejects.toThrow('位置无效');
  await expect(readSavedCommentStream(db,'cfg',{postId:'post',q:'changed',kind:'all',cursor:first.nextCursor!})).rejects.toThrow('位置无效');
  expect(commentStreamInput.safeParse({postId:'p',kind:'unknown'}).success).toBe(false);expect(commentStreamInput.safeParse({postId:'p',q:'x'.repeat(201)}).success).toBe(false);
 });
 it('requires an administrator and a known configuration before querying comments',async()=>{
  const db:any={collectionConfig:{findUnique:vi.fn().mockResolvedValue(null)},$queryRaw:vi.fn()},service=new CaptureService(db);
  await expect(service.commentStream({id:'u',role:'SALES'} as any,'cfg',{postId:'p'})).rejects.toThrow();expect(db.collectionConfig.findUnique).not.toHaveBeenCalled();
  await expect(service.commentStream({id:'u',role:'ADMIN'} as any,'cfg',{postId:'p'})).rejects.toThrow();expect(db.$queryRaw).not.toHaveBeenCalled();
 });
});
