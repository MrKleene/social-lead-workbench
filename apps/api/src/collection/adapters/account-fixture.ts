import { ReadOnlyMcpTransport } from '../mcp/transport';
import { ReadTool, toolArguments } from '../mcp/policy';
import { ReadFailure } from '../contract';
/** Offline-only finite protocol fixture. IDs are namespaced by XhsMcpAdapter. */
export class AccountFixtureTransport implements ReadOnlyMcpTransport {
  private keyword = ''; private closed = false;
  async call(name: ReadTool, args: Record<string, unknown>, signal: AbortSignal) {
    if (this.closed || signal.aborted) throw new ReadFailure('PAUSED');
    if (!Object.hasOwn(toolArguments, name)) throw new ReadFailure('UNSUPPORTED');
    toolArguments[name].parse(args);
    if (name === 'check_login_status') return { content: [{ type: 'text', text: '✅ 已登录\n离线虚构账号' }] };
    let value: unknown;
    if (name === 'search_feeds') { this.keyword = String(args.keyword); value = { feeds: [1,2,3,4].map(i => ({id:`account-read-post-${i}`,xsecToken:'offline-reference',noteCard:{displayTitle:'离线虚构评论窗口'}})) }; }
    else { const id=String(args.feed_id); value={feed_id:id,data:{note:{noteId:id,title:'离线虚构评论窗口'},comments:{hasMore:true,list:[{id:`${id}-comment`,noteId:id,content:`请问${this.keyword}怎么开始？`,userInfo:{userId:'account-read-fictional-user',nickname:'离线虚构用户'},subComments:null}]}}}; }
    return {content:[{type:'text',text:JSON.stringify(value)}]};
  }
  async close(){this.closed=true;}
}
