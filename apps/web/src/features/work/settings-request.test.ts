import {afterEach,describe,expect,it,vi} from 'vitest';
import {settingsDeadline,SettingsTimeout} from './settings-request';
afterEach(()=>vi.useRealTimers());
describe('bounded settings requests',()=>{
 it('returns fast results without an artificial minimum duration',async()=>{vi.useFakeTimers();expect(await settingsDeadline(async()=>42)).toBe(42);expect(vi.getTimerCount()).toBe(0);});
 it('aborts a stalled operation and never retries it',async()=>{vi.useFakeTimers();let signal:AbortSignal|undefined;const work=vi.fn((s:AbortSignal)=>{signal=s;return new Promise<never>(()=>{});});const result=settingsDeadline(work);const rejected=expect(result).rejects.toBeInstanceOf(SettingsTimeout);await vi.advanceTimersByTimeAsync(15000);await rejected;expect(signal?.aborted).toBe(true);expect(work).toHaveBeenCalledTimes(1);expect(vi.getTimerCount()).toBe(0);});
 it('preserves actual failures and clears its timer',async()=>{vi.useFakeTimers();const error=new Error('server rejected');await expect(settingsDeadline(async()=>{throw error;})).rejects.toBe(error);expect(vi.getTimerCount()).toBe(0);});
});
