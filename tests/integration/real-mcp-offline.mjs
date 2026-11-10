// Exercise built workspace exports through a real SDK session against loopback.
// No installed platform tools, browser, account or external service is used.
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {startXhsFixture} from '../../packages/local-runtime/test/fixtures/xhs-mcp-server.ts';
import {XhsHttpTransport} from '@crm/local-runtime/adapters/collection/mcp/transport';
const token=randomBytes(32).toString('hex');
const fixture=await startXhsFixture({authToken:token});
const transport=new XhsHttpTransport(fixture.url,'XHS_MCP',{token,callMs:3000});
try{
 const signal=AbortSignal.timeout(10000);
 await transport.connect(signal);
 await transport.call('check_login_status',{},signal);
 await transport.call('search_feeds',{keyword:'合成离线关键词'},signal);
 await transport.call('get_feed_detail',{feed_id:'offline-post',xsec_token:'fictional-reference-never-persist',load_all_comments:false,click_more_replies:false},signal);
 const before=fixture.state.calls.length;
 await assert.rejects(()=>transport.call('send_message',{},signal),/UNSUPPORTED/);
 assert.equal(fixture.state.calls.length,before);
 assert.deepEqual(fixture.state.calls.map(call=>call.name),['check_login_status','search_feeds','get_feed_detail']);
 assert.equal(fixture.state.forbidden,0);
 await transport.close();
 assert.equal(fixture.state.sessions.size,0);
 console.log('Built MCP adapter verified: authenticated loopback reads, write rejection, session cleanup.');
}finally{await transport.close();await fixture.stop();}
