import 'reflect-metadata';
import {expect,it,vi} from 'vitest';
import {replyHistoryItem} from '../src/auto-contact/reply-history';
import {ContactSettingsService} from '../src/auto-contact/contact-settings.service';
const now=new Date('2026-10-28T15:07:20Z'),sender='a'.repeat(24),post='b'.repeat(24),comment='c'.repeat(24),recipient='d'.repeat(24),protocol='aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa';
const attempt:any={id:'attempt',requestKey:'single:1',jobId:null,mode:'REAL',channel:'COMMENT',outcome:'CONFIRMED',content:'回复原文 <script>alert(1)</script>',day:'REAL:Asia/Shanghai:2026-10-28',createdAt:now,attemptedAt:now,confirmedAt:now,platformReceipt:'e'.repeat(24),resolutionNote:'已确认',historySnapshot:{platform:'XHS',senderPlatformId:sender,accountLabel:'小红书 · 待扫码',recipientId:recipient,postId:post,commentId:comment,source:{post:{title:'原帖标题',sourceReference:{token:'never-expose'}},comment:{userId:recipient,commentId:comment,authorNickname:'原收件人',comment:'原评论'}}}};
function journal(identity='MATCH',title='Te Fure - 小红书',path='/user/profile/[SENDER]') {return {action:'SINGLE_REPLY_EXECUTION_STAGE',createdAt:now,metadata:{stage:'TRANSPORT_STOP',protocolAttemptId:protocol,stopped:true,journal:{state:'AVAILABLE',records:[{sequence:1,attemptId:protocol,stage:'RESTRICTION_CHECK',at:now.toISOString(),evidence:{identity,title,pathname:path,warnings:[],screenshotState:'NOT_CAPTURED'}}]}}};}
it('projects frozen target/body and verified historical nickname without current account lookups or tokens',()=>{
 const a=replyHistoryItem(attempt,[journal()]);expect(a).toMatchObject({senderName:'Te Fure',recipientName:'原收件人',originalComment:'原评论',content:attempt.content,postUrl:`https://www.xiaohongshu.com/explore/${post}`,displayStatus:'CONFIRMED'});expect(JSON.stringify(a)).not.toContain('never-expose');expect(a.origin).toBe('SINGLE_TEST');expect(replyHistoryItem({...attempt,jobId:'job'},[]).origin).toBe('RULE');
});
it('does not use a mismatched, ambiguous, malformed, or post-page title as sender identity',()=>{
 for(const audits of [[],[journal('MISMATCH')],[journal('MATCH','Post','/explore/[POST]')],[journal(),journal('MATCH','Other - 小红书')],[{...journal(),metadata:{...journal().metadata,token:'secret'}}]])expect(replyHistoryItem(attempt,audits).senderName).toBeNull();
 expect(replyHistoryItem({...attempt,historySnapshot:null},[])).toMatchObject({senderName:null,senderId:null,recipientName:null,originalComment:null,postUrl:null});
 const h={...attempt.historySnapshot,source:{comment:{userId:'other',commentId:'other',authorNickname:'wrong',comment:'wrong'}}};expect(replyHistoryItem({...attempt,historySnapshot:h},[])).toMatchObject({recipientName:null,originalComment:null});
});
it('only explicit same-attempt terminal non-submission evidence labels FAILED as not sent; UNKNOWN always retained',()=>{
 const end={action:'SINGLE_REPLY_TEST_FINISHED',createdAt:now,metadata:{attemptId:'attempt',result:'NOT_ATTEMPTED',submission:'NOT_ATTEMPTED',stopped:true}};
 const failed={...attempt,outcome:'FAILED',confirmedAt:null,platformReceipt:null};
 expect(replyHistoryItem(failed,[end]).displayStatus).toBe('NOT_ATTEMPTED');expect(replyHistoryItem(failed,[]).displayStatus).toBe('FAILED');
 expect(replyHistoryItem({...failed,outcome:'UNKNOWN'},[end]).displayStatus).toBe('UNKNOWN');
 expect(replyHistoryItem(failed,[{...end,metadata:{...end.metadata,attemptId:'other'}}]).displayStatus).toBe('FAILED');
 expect(replyHistoryItem(attempt,[end]).displayStatus).toBe('CONFIRMED');
});
it('keeps an invalid URL and arbitrary snapshot fields out of the read projection',()=>{
 const a=replyHistoryItem({...attempt,historySnapshot:{...attempt.historySnapshot,postId:'javascript:alert(1)',extra:'secret',source:{post:{sourceReference:{token:'secret'}}}}},[]);expect(a.postUrl).toBeNull();expect(JSON.stringify(a)).not.toContain('secret');
});
it('history is admin-only, mode scoped, deterministically paginated; audit is bound to each request',async()=>{
 const tx:any={contactAttempt:{findMany:vi.fn(async()=>[attempt]),count:vi.fn(async()=>1)},auditLog:{findMany:vi.fn(async()=>[{...journal(),entityId:'unrelated'}])}};
 const db:any={$transaction:vi.fn(async fn=>fn(tx))},service=new ContactSettingsService(db,{mode:'REAL'} as any),admin:any={id:'admin',role:'ADMIN'};
 await expect(service.history({role:'SALES'} as any)).rejects.toThrow();expect(db.$transaction).not.toHaveBeenCalled();
 const page=await service.history(admin,20,'CONFIRMED');expect(tx.contactAttempt.findMany).toHaveBeenCalledWith(expect.objectContaining({where:{mode:'REAL',outcome:'CONFIRMED'},skip:20,take:20,orderBy:[{createdAt:'desc'},{id:'desc'}]}));expect(page.items[0].senderName).toBeNull();expect(page).toMatchObject({total:1,confirmedTotal:1,offset:20,limit:20,mode:'REAL'});
});
it('database errors propagate rather than returning a false empty page',async()=>{
 const service=new ContactSettingsService({$transaction:async()=>{throw Error('offline');}} as any,{mode:'REAL'} as any);await expect(service.history({role:'ADMIN'} as any)).rejects.toThrow('offline');
});
it('not-attempted filter requires same request and attempt terminal proof and never queries UNKNOWN',async()=>{
 const tx:any={auditLog:{findMany:vi.fn(async q=>q.select?[{entityId:'single:1',metadata:{attemptId:'attempt'}}]:[])},contactAttempt:{findMany:vi.fn(async()=>[]),count:vi.fn(async()=>0)}};
 const service=new ContactSettingsService({$transaction:async(fn:any)=>fn(tx)} as any,{mode:'REAL'} as any);
 await service.history({role:'ADMIN'} as any,0,'NOT_ATTEMPTED');expect(tx.contactAttempt.findMany).toHaveBeenCalledWith(expect.objectContaining({where:{mode:'REAL',outcome:'FAILED',confirmedAt:null,platformReceipt:null,OR:[{id:'attempt',requestKey:'single:1'}]}}));
});
