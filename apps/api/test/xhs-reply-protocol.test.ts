import { describe, it, expect } from 'vitest';
import { prepareXhsReply, verifyXhsReplyResult, XHS_REPLY_PROTOCOL } from '../src/auto-contact/xhs-reply-protocol';
import { UnavailableContactSender } from '../src/auto-contact/contact-sender';
import { toolArguments } from '../src/collection/mcp/policy';
const ids = { post: 'a'.repeat(24), target: 'b'.repeat(24), user: 'c'.repeat(24), sender: 'd'.repeat(24), reply: 'e'.repeat(24), other: 'f'.repeat(24) };
const request = { platform: 'XHS', channel: 'COMMENT' as const, accountId: 'account-1', requestKey: 'auto-contact:job-1', postId: ids.post, commentId: ids.target, recipientId: ids.user, content: ' 合成测试内容\n第二行 ' };
const binding = { accountId: request.accountId, senderId: ids.sender, postReference: { postId: ids.post, token: 'synthetic-only', source: 'pc_feed' as const } };
function fixture() {
    const command = prepareXhsReply(request, binding);
    const observation = { commentId: ids.reply, postId: ids.post, parentCommentId: ids.target, recipientId: ids.user, senderId: ids.sender, contentSha256: command.contentSha256 };
    const envelope = { protocol: XHS_REPLY_PROTOCOL, attemptId: command.attemptId, requestKey: command.requestKey, accountId: command.accountId, processStopped: true as const, kind: 'CONFIRMED' as const, proof: 'PLATFORM_RESPONSE_AND_READBACK' as const, response: { ...observation }, readback: { ...observation }, observedAfterSubmit: true as const };
    return { command, envelope };
}
describe('offline exact XHS reply protocol; no live transport', () => {
    it('preserves authorized text and binds all stable IDs without borrowing targetComment', () => {
        const { command } = fixture();
        expect(command.content).toBe(request.content); expect(command.targetCommentId).toBe(ids.target); expect(command.recipientId).toBe(ids.user);
        expect(command.senderId).toBe(ids.sender); expect(prepareXhsReply(request, binding).attemptId).not.toBe(command.attemptId);
    });
    it.each([
        { ...request, channel: 'DM' }, { ...request, platform: 'DOUYIN' }, { ...request, commentId: '' },
        { ...request, recipientId: '' }, { ...request, content: '  ' }, { ...request, accountId: 'another' },
        { ...request, postId: ids.other },
    ])('rejects unsupported or unbound command %# before any transport', r => {
        expect(() => prepareXhsReply(r as typeof request, binding)).toThrow();
    });
    it('accepts matching synthetic response plus readback, storing only reply ID', () => {
        const { command, envelope } = fixture();
        expect(verifyXhsReplyResult(command, envelope)).toEqual({ kind: 'CONFIRMED', receipt: ids.reply });
        expect(JSON.stringify(verifyXhsReplyResult(command, envelope))).not.toContain(binding.postReference.token);
    });
    it.each(['commentId', 'postId', 'parentCommentId', 'recipientId', 'senderId', 'contentSha256'] as const)('rejects mismatched %s in response or readback', key => {
        for (const side of ['response', 'readback'] as const) {
            const { command, envelope } = fixture(); envelope[side][key] = key === 'contentSha256' ? '0'.repeat(64) : ids.other;
            expect(verifyXhsReplyResult(command, envelope).kind).toBe('UNKNOWN');
        }
    });
    it.each(['attemptId', 'requestKey', 'accountId', 'protocol', 'processStopped', 'observedAfterSubmit'])('rejects stale or unverified envelope %s', key => {
        const { command, envelope } = fixture();
        expect(verifyXhsReplyResult(command, { ...envelope, [key]: key === 'processStopped' || key === 'observedAfterSubmit' ? false : 'other' }).kind).toBe('UNKNOWN');
    });
    it.each([null, { success: true }, { content: [{ type: 'text', text: '评论回复成功 - Feed ID: synthetic' }] }, { kind: 'CONFIRMED', receipt: ids.reply }, { kind: 'FAILED', reason: 'timeout' }])('does not accept legacy acknowledgements or inferred failure %#', raw => {
        expect(verifyXhsReplyResult(fixture().command, raw).kind).toBe('UNKNOWN');
    });
    it('rejects an existing target echo even when visible text happens to match', () => {
        const { command, envelope } = fixture(); envelope.response.commentId = ids.target; envelope.readback.commentId = ids.target;
        expect(verifyXhsReplyResult(command, envelope).kind).toBe('UNKNOWN');
    });
    it('only releases a stopped before-submit rejection, never a post-submit timeout', () => {
        const { command } = fixture(); const base = { protocol: command.protocol, attemptId: command.attemptId, requestKey: command.requestKey, accountId: command.accountId, processStopped: true, kind: 'NOT_SENT', reason: 'CANCELLED' };
        expect(verifyXhsReplyResult(command, { ...base, phase: 'BEFORE_SUBMIT' }).kind).toBe('FAILED');
        expect(verifyXhsReplyResult(command, { ...base, phase: 'AFTER_SUBMIT' }).kind).toBe('UNKNOWN');
        expect(verifyXhsReplyResult(command, { ...base, phase: 'BEFORE_SUBMIT', processStopped: false }).kind).toBe('UNKNOWN');
    });
    it.each(['RATE_LIMITED', 'VERIFICATION', 'BANNED', 'PLATFORM_REFUSED'])('preserves platform stop signal %s', reason => {
        const { command } = fixture();
        expect(verifyXhsReplyResult(command, { protocol: command.protocol, attemptId: command.attemptId, requestKey: command.requestKey, accountId: command.accountId, processStopped: true, kind: 'RISK', reason })).toEqual({ kind: 'RISK', reason });
    });
    it('does not lose a platform stop signal when cancellation is not acknowledged', () => {
        const { command } = fixture();
        expect(verifyXhsReplyResult(command, { protocol: command.protocol, attemptId: command.attemptId, requestKey: command.requestKey, accountId: command.accountId, processStopped: false, kind: 'RISK', reason: 'RATE_LIMITED' })).toEqual({ kind: 'RISK', reason: 'RATE_LIMITED' });
    });
    it('does not register any production sender or relax read tools', async () => {
        const sender = new UnavailableContactSender(); expect(sender.capability()).toBe(false); await expect(sender.send()).rejects.toThrow('SENDER_UNAVAILABLE');
        expect(Object.keys(toolArguments).sort()).toEqual(['check_login_status', 'get_feed_detail', 'search_feeds']);
    });
});

it('preserves safe pre-submit stage and identity consistency without leaking arbitrary diagnostic data',()=>{
 const {command}=fixture();
 const raw={protocol:XHS_REPLY_PROTOCOL,attemptId:command.attemptId,requestKey:command.requestKey,accountId:command.accountId,processStopped:true,kind:'NOT_SENT',phase:'BEFORE_SUBMIT',reason:'TARGET_MISMATCH',diagnostic:{stage:'INSPECT',code:'STATE_POST_MISSING',checks:{post:'UNKNOWN',sender:'MATCH',target:'UNKNOWN',author:'UNKNOWN'}}};
 expect(verifyXhsReplyResult(command,raw)).toEqual({kind:'FAILED',reason:'发送前已停止：TARGET_MISMATCH [INSPECT/STATE_POST_MISSING; post=UNKNOWN,sender=MATCH,target=UNKNOWN,author=UNKNOWN]'});
 for(const diagnostic of [{...raw.diagnostic,url:'https://secret.invalid'}, {...raw.diagnostic,code:'secret raw error'}, {...raw.diagnostic,checks:{...raw.diagnostic.checks,sender:ids.sender}}])expect(verifyXhsReplyResult(command,{...raw,diagnostic}).kind).toBe('UNKNOWN');
 expect(verifyXhsReplyResult(command,{...raw,accountId:'another'}).kind).toBe('UNKNOWN');
 expect(verifyXhsReplyResult(command,{...raw,processStopped:false}).kind).toBe('UNKNOWN');
});

 it.each(['COMPOSER_DRAFT_PRESENT', 'COMPOSER_HIDDEN', 'COMPOSER_ACTIVE', 'COMPOSER_TARGET_BOUND', 'COMPOSER_NOT_DEFAULT', 'COMPOSER_AMBIGUOUS', 'COMPOSER_UNRECOGNIZED', 'COMPOSER_BINDING_UNVERIFIED','COMPOSER_NOT_ACTIVE','BINDING_EMPTY','BINDING_STATE_MISSING','BINDING_USER_MISSING','SUBMIT_NOT_READY','BINDING_INVALID','BINDING_TARGET_MISMATCH','BINDING_AUTHOR_MISMATCH','BINDING_POST_MISMATCH','BINDING_ACCOUNT_MISMATCH', 'EXACT_TARGET_NOT_VISIBLE', 'AUTHOR_AMBIGUOUS'])('keeps safe composer diagnostic %s but never accepts it as delivery',code=>{
 const {command}=fixture();
 const raw={protocol:XHS_REPLY_PROTOCOL,attemptId:command.attemptId,requestKey:command.requestKey,accountId:command.accountId,processStopped:true,kind:'NOT_SENT',phase:'BEFORE_SUBMIT',reason:'TARGET_MISMATCH',diagnostic:{stage:'SELECT',code,checks:{post:'MATCH',sender:'MATCH',target:'MATCH',author:'MATCH'}}};
 expect(verifyXhsReplyResult(command,raw).kind).toBe('FAILED');
 expect(verifyXhsReplyResult(command,{...raw,processStopped:false}).kind).toBe('UNKNOWN');
 expect(verifyXhsReplyResult(command,{...raw,phase:'AFTER_SUBMIT'}).kind).toBe('UNKNOWN');
 });

it.each(['PREFLIGHT_NAVIGATION_UNVERIFIED','PREFLIGHT_REFERENCE_UNVERIFIED'])('retains stopped navigation diagnostic %s without claiming delivery',code=>{
 const {command}=fixture();const raw={protocol:command.protocol,attemptId:command.attemptId,requestKey:command.requestKey,accountId:command.accountId,processStopped:true,kind:'NOT_SENT',phase:'BEFORE_SUBMIT',reason:'TARGET_MISMATCH',diagnostic:{stage:'INSPECT',code,checks:{post:'UNKNOWN',sender:'UNKNOWN',target:'UNKNOWN',author:'UNKNOWN'}}};
 expect(verifyXhsReplyResult(command,raw)).toEqual({kind:'FAILED',reason:`发送前已停止：TARGET_MISMATCH [INSPECT/${code}; post=UNKNOWN,sender=UNKNOWN,target=UNKNOWN,author=UNKNOWN]`});
 expect(verifyXhsReplyResult(command,{...raw,processStopped:false}).kind).toBe('UNKNOWN');expect(verifyXhsReplyResult(command,{...raw,phase:'AFTER_SUBMIT'}).kind).toBe('UNKNOWN');
});
