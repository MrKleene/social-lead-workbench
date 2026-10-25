import {describe,it,expect,vi} from 'vitest';
import {readCommentContext,CONTEXT_PAGE_LIMIT} from './comment-context';
import type {ArchivedComment,ArchivePage} from './archive-data';
const row=(id:string,commentId=id,userId='u')=>({id,snapshot:{postId:'p',commentId,userId}} as ArchivedComment);
const page=(items:ArchivedComment[],hasMore=false)=>({items,hasMore,commentScope:{postId:'p'}} as ArchivePage);
const signal=()=>new AbortController().signal;
describe('saved cross-page comment context',()=>{
 it('finds a parent across scoped pages without merging it into current page',async()=>{const read=vi.fn(async(offset:number)=>offset?page([row('parent')]):page([row('reply')],true));expect(await readCommentContext('p',{commentId:'parent'},read,signal())).toEqual({items:[row('parent')],complete:true,scanned:2});expect(read.mock.calls).toEqual([[0],[50]]);});
 it('keeps multiple versions and requires direct target identity when provided',async()=>{const read=vi.fn(async()=>page([row('v1','target'),row('v2','target'),row('wrong','target','other')]));expect((await readCommentContext('p',{commentId:'target',userId:'u'},read,signal())).items.map(r=>r.id)).toEqual(['v1','v2']);});
 it('rejects missing, wrong scopes and foreign post rows',async()=>{for(const data of [{...page([]),commentScope:null},{...page([]),commentScope:{postId:'other'}},page([{...row('a'),snapshot:{...row('a').snapshot,postId:'other'}}])])await expect(readCommentContext('p',{commentId:'a'},async()=>data,signal())).rejects.toThrow('范围不匹配');});
 it('bounds requests even when the server always has more',async()=>{const read=vi.fn(async n=>page([row(String(n))],true));const result=await readCommentContext('p',{commentId:'absent'},read,signal());expect(read).toHaveBeenCalledTimes(CONTEXT_PAGE_LIMIT);expect(result.complete).toBe(false);});
 it('stops repeated pages without pretending the comment is absent',async()=>{const read=vi.fn(async()=>page([row('same')],true));expect((await readCommentContext('p',{commentId:'absent'},read,signal())).complete).toBe(false);expect(read).toHaveBeenCalledTimes(2);});
 it('does not request after closing and does not suppress read failures',async()=>{const controller=new AbortController(),read=vi.fn(async()=>page([]));controller.abort();await expect(readCommentContext('p',{commentId:'x'},read,controller.signal)).rejects.toThrow();expect(read).not.toHaveBeenCalled();await expect(readCommentContext('p',{commentId:'x'},async()=>{throw Error('offline');},signal())).rejects.toThrow('offline');});
 it('stops after aborting an in-flight page before another request',async()=>{const controller=new AbortController(),read=vi.fn(async()=>{controller.abort();return page([row('a')],true);});await expect(readCommentContext('p',{commentId:'x'},read,controller.signal)).rejects.toThrow();expect(read).toHaveBeenCalledTimes(1);});
});
