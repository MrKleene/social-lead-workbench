import {describe,it,expect} from 'vitest';
import {archiveOffset,infoPosts,replyDepth,savedCommentCount} from './collection-info-model';
import type {ArchivedComment,ArchivedPost} from './archive-data';
const p:ArchivedPost={id:'p-row',platformPostId:'p',runId:'r',lastRunId:'r',lastSeenAt:'2026-10-22',snapshot:{title:'虚构帖子'},coverage:'PARTIAL',stopReason:null};
const c:ArchivedComment={id:'c',postId:p.id,runId:'r',lastRunId:'r',platformCommentId:'c',lastSeenAt:'2026-10-22',snapshot:{postId:'p',commentId:'c',userId:'fake',title:'虚构帖子',body:'',comment:'虚构评论',parentId:null,parent:null,coverage:'PARTIAL',isDemo:true},contextVersion:'v1',post:{coverage:'PARTIAL',stopReason:null},reviews:[]};
describe('post-first saved information',()=>{
 it('groups distinct snapshots without inventing a count',()=>{const row=infoPosts([p,{...p,id:'v2'}],[c,{...c,id:'v2',contextVersion:'v2'}])[0];expect(row.versions).toHaveLength(2);expect(row.comments).toHaveLength(2);expect(savedCommentCount(row.comments)).toBe(1);});
 it('retains saved posts without comments',()=>{const row=infoPosts([p],[])[0];expect(row.comments).toEqual([]);expect(row.title).toBe(p.snapshot.title);});
 it('exposes comment-only post without inventing independent original',()=>{const row=infoPosts([],[{...c,snapshot:{...c.snapshot,title:''}}])[0];expect(row.title).toBe('');expect(row.versions).toEqual([]);expect(row.id).toBe('p');});
 it('respects first/last run associations',()=>expect(infoPosts([{...p,runId:'old',lastRunId:'new'}],[c],'r')[0].versions).toHaveLength(0));
 it('keeps partial coverage unchanged',()=>expect(infoPosts([p],[])[0].versions[0].coverage).toBe('PARTIAL'));
 it('uses parent links with bounded indentation even in cycles',()=>{const reply={...c,snapshot:{...c.snapshot,commentId:'reply',parentId:'c'}};expect(replyDepth(reply,[c,reply])).toBe(1);expect(replyDepth(c,[c])).toBe(0);expect(replyDepth({...c,snapshot:{...c.snapshot,parentId:'c'}},[c])).toBe(0);});
 it.each(['-1','NaN','100001','Infinity'])('rejects invalid offset %s',x=>expect(archiveOffset(x)).toBe(0));
 it('normalizes safe page offsets',()=>{expect(archiveOffset('51')).toBe(50);expect(archiveOffset(null)).toBe(0);});
});

describe('cover selection independent of comments and task history',()=>{
 const cover='https://sns-webpic-qc.xhscdn.com/fictional-cover';
 it('uses newest safe returned cover regardless of input order',()=>{const newer={...p,id:'new',lastSeenAt:'2026-10-23',snapshot:{title:'虚构',coverUrl:cover}};expect(infoPosts([p,newer],[c])[0].coverUrl).toBe(cover);expect(savedCommentCount(infoPosts([p,newer],[c])[0].comments)).toBe(1);});
 it('old and unsafe covers remain placeholders',()=>{expect(infoPosts([p],[c])[0].coverUrl).toBeUndefined();expect(infoPosts([{...p,snapshot:{...p.snapshot,coverUrl:'https://evil.example/p'}}],[c])[0].coverUrl).toBeUndefined();});
 it('never borrows another task cover',()=>{expect(infoPosts([{...p,runId:'other',lastRunId:'other',snapshot:{...p.snapshot,coverUrl:cover}}],[c],'r')[0].coverUrl).toBeUndefined();});
});
