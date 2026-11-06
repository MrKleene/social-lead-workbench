import {renderToStaticMarkup} from 'react-dom/server';
import {MemoryRouter} from 'react-router-dom';
import {describe,it,expect,vi} from 'vitest';
const state=vi.hoisted(()=>({accounts:[{id:'a',loginNickname:'甲账号',status:'ACTIVE'},{id:'b',loginNickname:'乙账号',status:'ACTIVE'}],summaryError:null as Error|null,summaries:[{accountId:'a',unread:3,latestBody:'示例评论',latestChannel:'COMMENT',latestAt:'2026-01-01T00:00:00Z'},{accountId:'b',unread:0,latestBody:null,latestChannel:null,latestAt:null}]}));
vi.mock('@/features/auth/use-auth',()=>({useAuth:()=>({user:{role:'ADMIN'}})}));
vi.mock('./use-inbox',()=>({useInbox:()=>({f:{channel:'all',page:1,unread:false,accountId:''},accounts:{data:state.accounts},summaries:{data:state.summaryError?undefined:state.summaries,error:state.summaryError,isError:!!state.summaryError},receivers:{data:[]},messages:{data:{items:[],total:0}},start:{},stop:{},read:{},update:vi.fn()})}));
vi.mock('./chat-workspace',()=>({ChatWorkspace:()=>null}));
import {InboxPage} from './inbox-page';
import {ApiError} from '@/lib/api';
const render=()=>renderToStaticMarkup(<MemoryRouter initialEntries={['/inbox']}><InboxPage/></MemoryRouter>);
describe('account-first inbox',()=>{
 it('shows per-account unread and safely scoped links without treating zero as unread',()=>{const html=render();expect(html).toContain('消息通知');expect((html.match(/data-slot="card"/g)||[])).toHaveLength(2);expect((html.match(/data-slot="avatar-fallback"/g)||[])).toHaveLength(2);expect(html).toContain('3 条系统内未读');expect(html).toContain('accountId=a');expect(html).toContain('accountId=b');expect(html).toContain('示例评论');expect(html).toContain('暂无已接收消息');expect(html).not.toContain('0 条系统内未读')});
 it('does not present missing backend summaries as zero unread or no messages',()=>{state.summaryError=new ApiError(404,'not found');try{const html=render();expect(html).toContain('消息汇总暂不可用');expect(html).not.toContain('暂无已接收消息')}finally{state.summaryError=null}});
 it('distinguishes an empty account list from loading',()=>{const saved=state.accounts;state.accounts=[];try{expect(render()).toContain('暂无可用账号')}finally{state.accounts=saved}});
});
