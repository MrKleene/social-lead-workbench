import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {describe,it,expect,vi,beforeEach} from 'vitest';
const state=vi.hoisted(()=>({login:{isPending:false,error:null as Error|null,mutate:vi.fn()},sessionError:null as Error|null}));
vi.mock('./use-auth',()=>({useAuth:()=>state}));
import {LoginPage} from './login-page';
beforeEach(()=>{state.login.isPending=false;state.login.error=null;state.sessionError=null;});
describe('graphite login preserves authentication affordances',()=>{
 it('requires email and password and leaves 30-day remembrance opt-in',()=>{
  const html=renderToStaticMarkup(<LoginPage/>);
  expect(html).toContain('type="email"');expect(html).toContain('autoComplete="username"');expect(html).toContain('type="password"');expect(html).toContain('autoComplete="current-password"');
  expect(html).toContain('aria-checked="false"');expect(html).toContain('在此设备记住登录 30 天');expect(html).not.toContain('欢迎回来');
 });
 it('keeps pending submission disabled and errors visible',()=>{
  state.login.isPending=true;expect(renderToStaticMarkup(<LoginPage/>)).toMatch(/type="submit"[^>]*disabled=""/);
  state.login.isPending=false;state.login.error=new Error('测试：邮箱或密码错误');expect(renderToStaticMarkup(<LoginPage/>)).toContain('测试：邮箱或密码错误');
 });
});
