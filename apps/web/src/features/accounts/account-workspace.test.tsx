import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {MemoryRouter} from 'react-router-dom';
import {describe,it,expect} from 'vitest';
import {AccountWorkspace} from './account-workspace';
import type {useAccountScreen} from './use-account-screen';
import type {Account} from './types';
const row={id:'private-account-id',label:'业务备注',loginNickname:'示例账号',platform:'XHS',status:'PAUSED',loginStatus:'PREVIOUSLY_VERIFIED',loginProvider:'real',systemBlockReason:'历史回复限制，禁止回复',dailyLimit:10,occupied:3} as Account;
function render(admin=true,overrides:Record<string,unknown>={}){
 const screen={admin,availability:'ready',adding:false,error:'',caps:{isPending:false},state:{query:{isPending:false,isError:false},mutation:{}},rows:[row],readiness:{data:{enabled:true,device:{online:true},accounts:[{id:row.id,eligible:true}]},isPending:false},contact:{data:{capabilities:[{platform:'XHS',channel:'COMMENT',available:true}],accounts:[{id:row.id,unknown:1,canCheck:true,sendEligibility:{state:'REPLY_DISABLED'}}]},isPending:false},...overrides} as unknown as ReturnType<typeof useAccountScreen>;
 return renderToStaticMarkup(<MemoryRouter><AccountWorkspace screen={screen}/></MemoryRouter>);
}
describe('compact account view preserves execution-state meaning',()=>{
 it('keeps read eligibility independent from reply restriction and makes unknown lock actionable',()=>{
  const html=render();
  expect(html).toContain('启动时自动核验');expect(html).toContain('不可回复');expect(html).toContain('历史回复受限');
  expect(html).toContain('仍占用额度，核查前勿重发');expect(html).toContain('href="/reply-history"');
  expect(html).not.toContain('private-account-id');expect(html).not.toContain('REPLY_DISABLED');
 });
 it('retains detail access without exposing admin mutations for sales',()=>{
  const html=render(false);expect(html).toContain('查看示例账号详情');expect(html).not.toContain('添加账号');expect(html).not.toContain('设备设置');expect(html).not.toContain('设置示例账号');
 });
 it('shows load failure rather than an empty-account success state',()=>{
  const html=render(true,{rows:[],state:{query:{isPending:false,isError:true,error:new Error('测试读取失败')},mutation:{}}});
  expect(html).toContain('测试读取失败');expect(html).toContain('重新读取账号');expect(html).not.toContain('添加你的第一个账号');
 });
});
