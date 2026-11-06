import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {describe,it,expect,vi} from 'vitest';
import type {ReplyHistoryItem} from '@crm/contracts';
import {ReplyHistoryTable} from './reply-history-table';
import {ReplyHistoryDetail} from './reply-history-content';
// Render the real disclosure in its expanded state to verify preserved detail fields.
vi.mock('@/components/disclosure',async importOriginal=>{const actual=await importOriginal<typeof import('@/components/disclosure')>();return {Disclosure:(props:Parameters<typeof actual.Disclosure>[0])=>createElement(actual.Disclosure,{...props,defaultOpen:true})};});
const fixture:ReplyHistoryItem={id:'fictional-attempt',mode:'REAL',channel:'COMMENT',origin:'RULE',outcome:'UNKNOWN',displayStatus:'UNKNOWN',senderId:'sender-id',senderName:'示例发送账号',senderNameSource:'执行快照',recipientId:'recipient-id',recipientName:'虚构用户',postId:'post-id',postTitle:'虚构来源帖子',postUrl:null,commentId:'comment-id',originalComment:'已保存的完整原评论',content:'虚构回复正文',createdAt:'2026-11-01T01:00:00Z',attemptedAt:'2026-11-01T01:00:10Z',confirmedAt:null,platformReceipt:null,reason:'平台结果尚未确认',day:'2026-11-01',executionEvidence:[{at:'2026-11-01T01:00:10Z',event:{phase:'synthetic'}}]};
const table=(item:ReplyHistoryItem)=>renderToStaticMarkup(createElement(ReplyHistoryTable,{items:[item],onOpen:()=>{}}));
const detail=(item:ReplyHistoryItem)=>renderToStaticMarkup(createElement(ReplyHistoryDetail,{item}));
describe('reply history presentation',()=>{
 it('keeps unknown protection visible in the list without an unsafe resend action',()=>{const html=table(fixture);expect(html).toContain('结果未知');expect(html).toContain('保留占用 · 勿重发');expect(html).toContain('查看回复详情 fictional-attempt');expect(html).not.toContain('重新发送');expect(html).not.toContain('回复成功');});
 it('does not label unattempted content or a missing timestamp as sent',()=>{const item={...fixture,displayStatus:'NOT_ATTEMPTED',attemptedAt:null};expect(table(item)).toContain('计划：');expect(detail(item)).toContain('计划回复正文');expect(table(item)).toContain('提交前停止');expect(table(item)).not.toContain('2026/11/1');});
 it('keeps failed and simulated results distinct from confirmed sends',()=>{expect(table({...fixture,displayStatus:'FAILED'})).toContain('提交情况见原因');const simulated=detail({...fixture,displayStatus:'SIMULATED_SUCCESS',mode:'SIMULATION'});expect(simulated).toContain('模拟回复正文');expect(simulated).toContain('未真实发送');expect(simulated).not.toContain('平台已确认');});
 it('retains complete source, identities, times, receipt and raw evidence in details',()=>{const html=detail(fixture);for(const text of ['已保存的完整原评论','虚构回复正文','sender-id','recipient-id','post-id','comment-id','执行快照','尚无可靠回执','原额度日','2026-11-01','synthetic','不等于提交时间','核查前勿重发','不换号补发'])expect(html).toContain(text);});
 it('does not claim missing historical evidence proves no submission',()=>{const html=detail({...fixture,executionEvidence:[],reason:null});expect(html).toContain('不能根据日志缺失推断是否提交');expect(html).toContain('不能推断实际提交次数');});
 it('uses a semantic table with six grouped columns and keeps long text in the DOM',()=>{const item={...fixture,content:'完整正文'.repeat(100)};const html=table(item);expect(html).toContain('<table');expect(html.match(/data-slot="table-head"/g)).toHaveLength(6);expect(html).toContain(item.content);expect(html).toContain('原帖与评论');});
});

it('identifies missing historical sender by saved ID without implying send failure',()=>{
 const item={...fixture,senderName:null,senderId:'5bbf06da6cc8c10001993e24',displayStatus:'CONFIRMED',channel:'DM'};
 for(const html of [table(item),detail(item)]){expect(html).toContain('账号 · 993e24');expect(html).toContain('发送时昵称未记录');expect(html).toContain('回复成功');expect(html).not.toContain('发送昵称未保存');}
 expect(table({...item,senderName:'虚构发送账号'})).not.toContain('发送时昵称未记录');
 expect(table({...item,senderId:null})).toContain('发送账号未记录');
});
