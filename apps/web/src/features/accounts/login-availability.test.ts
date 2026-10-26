import { describe, expect, it } from 'vitest';
import { loginAvailability } from './login-availability';
import type { LoginCapabilities } from './account-login-panel';

const configured: LoginCapabilities = { enabled: false, mode: 'real', storageRoot: '/fixture', deviceRequired: true, device: null };
describe('扫码入口前置条件', () => {
  it('尚未取得能力时显示加载，不误报未启用', () => {
    expect(loginAvailability(undefined, true, false)).toBe('loading');
  });
  it('请求失败覆盖旧的可扫码能力，不静默回退模拟', () => {
    expect(loginAvailability(undefined, false, true)).toBe('error');
    expect(loginAvailability({ ...configured, enabled: true }, false, true)).toBe('error');
  });
  it('已配置但没有设备时引导批准，仍禁止扫码', () => {
    expect(loginAvailability(configured, false, false)).toBe('device-required');
  });
  it('有设备但不可执行时显示设备问题', () => {
    expect(loginAvailability({ ...configured, device: { name: '测试设备', os: 'macOS', online: false } }, false, false)).toBe('device-unavailable');
  });
  it('批准在线后的服务端能力才允许扫码', () => {
    expect(loginAvailability({ ...configured, enabled: true }, false, false)).toBe('ready');
  });
  it('确实禁用与缺少设备管理的配置区分', () => {
    expect(loginAvailability({ ...configured, mode: 'disabled' }, false, false)).toBe('disabled');
    expect(loginAvailability({ ...configured, deviceRequired: false }, false, false)).toBe('setup-required');
  });
  it('离线模式也保留设备门槛，临时离线可演示', () => {
    expect(loginAvailability({ ...configured, mode: 'offline' }, false, false)).toBe('device-required');
    expect(loginAvailability({ ...configured, mode: 'offline', enabled: true, deviceRequired: false }, false, false)).toBe('ready');
  });
});

import {accountState,canRecover,hasSavedLogin} from './account-presentation';
import type {Account} from './types';
const saved={status:'PAUSED',loginProvider:'real',loginStatus:'UNVERIFIED',loginVerifiedAt:'2026-10-20',sessionReference:{state:'UNVERIFIED'}} as Account;
describe('当前账号状态不混同历史/模拟状态',()=>{
 it('历史确认不会显示当前已登录',()=>{expect(hasSavedLogin(saved)).toBe(true);expect(accountState(saved)).toBe('任务启动前核验');expect(canRecover(saved)).toBe(true);expect(accountState({...saved,loginStatus:'PREVIOUSLY_VERIFIED'})).toBe('上次验证通过');});
 it('离线模拟不冒充真实登录',()=>expect(accountState({...saved,loginStatus:'OFFLINE_VERIFIED',loginProvider:'offline'})).toBe('离线演示'));
 it('受限或设备不匹配不提供恢复执行',()=>{expect(canRecover({...saved,status:'RESTRICTED'})).toBe(false);expect(canRecover({...saved,loginStatus:'DEVICE_MISMATCH'})).toBe(false);expect(accountState({...saved,status:'RESTRICTED',loginStatus:'VERIFIED'})).toBe('平台受限');});
 it('缺少引用不伪造恢复能力',()=>expect(canRecover({...saved,sessionReference:null})).toBe(false));
});

import {accountName,accountOptionName,accountRemark} from './account-presentation';
describe('account names are independent from login state',()=>{
 const a={id:'account-alpha1',label:'小红书 · 待授权账号',loginNickname:'已保存昵称'};
 it('uses the saved nickname without the initial placeholder',()=>{expect(accountName(a)).toBe('已保存昵称');expect(accountRemark(a)).toBe('');expect(accountOptionName(a)).not.toContain('待授权');});
 it('preserves a custom remark without modifying the saved name',()=>{expect(accountOptionName({...a,label:'业务备注'})).toContain('已保存昵称（业务备注）');expect(accountName({...a,label:'业务备注',loginNickname:null})).toBe('业务备注');});
 it('uses neutral fallback and distinguishes same nicknames by account reference',()=>{expect(accountName({...a,loginNickname:null})).toBe('昵称未获取');expect(accountOptionName(a)).not.toBe(accountOptionName({...a,id:'account-bravo2'}));});
});
