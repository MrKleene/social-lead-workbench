import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {MemoryRouter} from 'react-router-dom';
import {describe,it,expect} from 'vitest';
import {AccountWorkspace} from './account-workspace';
function render(unknown=0){
 const account={id:'fictional',platform:'XHS',label:'虚构账号',loginNickname:'虚构账号',loginProvider:'real',loginStatus:'PREVIOUSLY_VERIFIED',systemBlockReason:'历史回复限制，禁止回复',status:'PAUSED',occupied:0,dailyLimit:10};
 const screen={availability:'ready',admin:true,rows:[account],adding:false,error:'',caps:{isPending:false},state:{query:{isPending:false,isError:false,error:null},mutation:{error:null}},readiness:{isPending:false,isError:false,data:{enabled:true,device:{online:true},accounts:[{id:account.id,eligible:true,reason:'PREVIOUSLY_VERIFIED'}]}},contact:{isPending:false,isError:false,data:{accounts:[{id:account.id,unknown}]}}} as unknown as Parameters<typeof AccountWorkspace>[0]['screen'];
 return renderToStaticMarkup(createElement(MemoryRouter,null,createElement(AccountWorkspace,{screen})));
}
describe('compact account risk presentation',()=>{
 it('shows the restriction once in the risk field without a duplicate banner',()=>{const html=render();expect(html.match(/历史回复受限/g)).toHaveLength(1);expect(html).not.toContain('account-compact-alert');expect(html).not.toContain('历史回复限制，禁止回复');expect(html).toContain('启动时自动核验');expect(html).toContain('不可回复');});
 it('retains the distinct unknown-send warning, quota protection and history link',()=>{const html=render(1);expect(html.match(/历史回复受限/g)).toHaveLength(1);expect(html).toContain('1 条回复结果未知，仍占用额度，核查前勿重发');expect(html).toContain('核查记录');expect(html).toContain('href="/reply-history"');});
});
