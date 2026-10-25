import {it,expect} from 'vitest';
import {replyTargetFor} from './reply-target';
import type {ArchivedComment} from './archive-data';
const row=(id:string,post='p')=>({id,snapshot:{postId:post,commentId:id,userId:'u'+id}} as ArchivedComment);
it('resolves only exact same-post source target independently of root; never guesses author',()=>{
 const root=row('root'),other=row('other'),reply=row('reply');reply.snapshot.parentId='root';reply.snapshot.replyTarget={source:'targetComment',commentId:'other',userId:'uother'};
 expect(replyTargetFor(reply,[root,other,reply])).toEqual({state:'RESOLVED',comment:other});
 expect(replyTargetFor(reply,[root,reply,row('other','different')])).toEqual({state:'UNAVAILABLE'});
 expect(replyTargetFor(reply,[other,{...other,id:'version2'}])).toEqual({state:'CONFLICT'});
 expect(replyTargetFor(reply,[{...other,snapshot:{...other.snapshot,userId:'wrong'}}])).toEqual({state:'CONFLICT'});
 reply.snapshot.replyTargetConflict=true;expect(replyTargetFor(reply,[other])).toEqual({state:'CONFLICT'});
 expect(replyTargetFor(root,[other])).toEqual({state:'MISSING'});
});
