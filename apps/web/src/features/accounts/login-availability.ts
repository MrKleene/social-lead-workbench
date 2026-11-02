import type { LoginCapabilities } from './account-login-panel';

export type LoginAvailability = 'loading' | 'error' | 'disabled' | 'device-required' | 'device-unavailable' | 'setup-required' | 'ready';

// enabled means execution is ready, while mode says whether QR is configured.
// Query failures must override cached capabilities so stale readiness cannot offer login.
export function loginAvailability(data: LoginCapabilities | undefined, pending: boolean, failed: boolean): LoginAvailability {
  if (failed) return 'error';
  if (pending || !data) return 'loading';
  if (data.mode === 'disabled') return 'disabled';
  if (data.enabled) return 'ready';
  if (data.deviceRequired) return data.device ? 'device-unavailable' : 'device-required';
  return 'setup-required';
}

export const loginAvailabilityText: Record<LoginAvailability, string> = {
  loading: '正在读取扫码登录能力…',
  error: '无法读取扫码登录能力，请重试；尚不能判断是否可扫码。',
  disabled: '此启动环境未配置扫码登录，请核对持久工作台启动方式。',
  'device-required': '扫码登录已配置；请先在专用电脑设置中批准执行设备，批准并认证在线后才能扫码。',
  'device-unavailable': '扫码登录已配置；专用电脑已撤销、离线或尚未认证，请查看设备设置。',
  'setup-required': '扫码登录已配置，但执行前置条件未满足；请核对持久工作台与设备设置。',
  ready: '扫码登录可用。',
};
