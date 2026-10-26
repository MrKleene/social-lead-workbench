import {it,expect} from 'vitest';
import {mergeCommentStream,type CommentStreamPage} from './comment-stream-model';
const c=(id:string)=>({id,platformCommentId:id,snapshot:{postId:'p',commentId:id}} as any);
const page=(items:any[],context:any[]=[])=>({items,context} as CommentStreamPage);
it('deduplicates cross-batch context and matches while maintaining the first loaded version',()=>{
 const root=c('root'),reply=c('reply'),r=mergeCommentStream([page([reply],[root]),page([root,{...reply,id:'repeated-capture'}]),page([c('next')],[root])]);
 expect(r.comments.map(x=>x.id)).toEqual(['root','reply','next']);expect(r.matched.size).toBe(3);
});
it('counts ancestor context separately from actual search matches',()=>{const r=mergeCommentStream([page([c('reply')],[c('root')])]);expect(r.comments).toHaveLength(2);expect([...r.matched]).toEqual(['reply']);});
