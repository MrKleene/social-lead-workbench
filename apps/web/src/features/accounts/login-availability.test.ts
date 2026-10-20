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
