import {expect,it} from 'vitest';
import {assessCommentReadback} from '../src/auto-contact/comment-readback-assessment';
const target={commentId:'p',recipientId:'r',senderId:'s',content:'synthetic'};
const parent={id:'p',userId:'r',text:'question',hasReplies:true};
it('never calls a missing reply unsent when coverage is incomplete',()=>{
 expect(assessCommentReadback([parent],null,target)).toMatchObject({submission:'UNKNOWN',parentFound:true,loadedReplies:0,coverage:'INSUFFICIENT',reason:'PARENT_REPLY_COVERAGE_INSUFFICIENT'});
});
it('binds parent identity and matching replies to exact sender/content/parent',()=>{
 const match={id:'reply',userId:'s',text:'synthetic',parentId:'p'};
 expect(assessCommentReadback([parent,match,{...match,id:'wrong',parentId:'elsewhere'}],null,target)).toMatchObject({submission:'UNKNOWN',matchingReplyIds:['reply'],reason:'MATCH_REQUIRES_RECEIPT_VERIFICATION'});
 expect(assessCommentReadback([{...parent,userId:'other'},match],null,target).parentFound).toBe(false);
 expect(assessCommentReadback([parent,{...match,userId:'other'}],null,target).matchingReplyIds).toEqual([]);
});
it('keeps multiple identical replies ambiguous and never releases protections',()=>{
 expect(assessCommentReadback([parent,{id:'a',userId:'s',text:'synthetic',parentId:'p'},{id:'b',userId:'s',text:'synthetic',parentId:'p'}],null,target)).toMatchObject({submission:'UNKNOWN',reason:'AMBIGUOUS_MATCH'});
});
