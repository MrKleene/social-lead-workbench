import { beforeEach, afterEach, it, expect, vi } from 'vitest';
let transport: typeof import('./api');
const reply = (status: number, data: object = {}) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
const fetcher = vi.fn<typeof fetch>();
const expired = vi.fn();
beforeEach(async () => {
  vi.resetModules(); fetcher.mockReset(); expired.mockReset();
  const window = new EventTarget(); window.addEventListener('crm-session-expired', expired);
  vi.stubGlobal('window', window); vi.stubGlobal('navigator', {}); vi.stubGlobal('fetch', fetcher);
  transport = await import('./api');
});
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });
it('coalesces parallel expired requests and retries once with refreshed CSRF', async () => {
  let ready = false, refreshCount = 0;
  fetcher.mockImplementation(async (url, options) => {
    if (url === '/api/auth/refresh') { refreshCount++; await new Promise(resolve => setTimeout(resolve, 5)); ready = true; return reply(201, { csrfToken: 'new-csrf' }); }
    if (url === '/api/auth/me') return reply(ready ? 200 : 401, { csrfToken: 'new-csrf' });
    if (!ready) return reply(401);
    expect((options?.headers as Record<string, string>)['x-csrf-token']).toBe('new-csrf');
    return reply(200, { ok: true });
  });
  expect(await Promise.all([transport.send('/synthetic', 'POST', {}), transport.send('/synthetic', 'POST', {})])).toEqual([{ ok: true }, { ok: true }]);
  expect(refreshCount).toBe(1); expect(expired).not.toHaveBeenCalled();
});
it('rechecks shared cookies within the cross-tab lock before rotating', async () => {
  const lock = vi.fn(async (_name, run) => run()); vi.stubGlobal('navigator', { locks: { request: lock } });
  fetcher.mockResolvedValueOnce(reply(401)).mockResolvedValueOnce(reply(200, { csrfToken: 'other-tab' })).mockResolvedValueOnce(reply(200, { ok: true }));
  expect(await transport.api('/synthetic')).toEqual({ ok: true });
  expect(lock).toHaveBeenCalledOnce(); expect(fetcher.mock.calls.some(([url]) => url === '/api/auth/refresh')).toBe(false);
});
it('short sessions and expired remember tokens fail once without refresh loops', async () => {
  fetcher.mockResolvedValue(reply(401, { message: '登录已过期，请重新登录' }));
  await expect(transport.api('/auth/me')).rejects.toMatchObject({ status: 401 });
  expect(fetcher).toHaveBeenCalledTimes(3); expect(expired).not.toHaveBeenCalled();
});
it('a retried 401 never triggers a second refresh', async () => {
  fetcher.mockResolvedValueOnce(reply(401)).mockResolvedValueOnce(reply(401)).mockResolvedValueOnce(reply(201, { csrfToken: 'new' })).mockResolvedValueOnce(reply(401));
  await expect(transport.api('/synthetic')).rejects.toMatchObject({ status: 401 });
  expect(fetcher).toHaveBeenCalledTimes(4); expect(expired).toHaveBeenCalledOnce();
});
it.each([403, 429, 503])('does not expire or loop on refresh status %s', async status => {
  fetcher.mockResolvedValueOnce(reply(401)).mockResolvedValueOnce(reply(401)).mockResolvedValueOnce(reply(status));
  await expect(transport.api('/synthetic')).rejects.toMatchObject({ status });
  expect(fetcher).toHaveBeenCalledTimes(3); expect(expired).not.toHaveBeenCalled();
});
it('network failure leaves existing auth state intact', async () => {
  fetcher.mockResolvedValueOnce(reply(401)).mockResolvedValueOnce(reply(401)).mockRejectedValueOnce(new TypeError('offline'));
  await expect(transport.api('/synthetic')).rejects.toThrow('offline'); expect(expired).not.toHaveBeenCalled();
});
it('409 races only poll me and recover without reusing the refresh token', async () => {
  vi.useFakeTimers();
  fetcher.mockResolvedValueOnce(reply(401)).mockResolvedValueOnce(reply(401)).mockResolvedValueOnce(reply(409)).mockResolvedValueOnce(reply(200, { csrfToken: 'winner' })).mockResolvedValueOnce(reply(200, { ok: true }));
  const pending = transport.api('/synthetic'); await vi.advanceTimersByTimeAsync(250);
  expect(await pending).toEqual({ ok: true }); expect(fetcher.mock.calls.filter(([url]) => url === '/api/auth/refresh')).toHaveLength(1);
});
it('login failure and logout never invoke refresh', async () => {
  fetcher.mockResolvedValue(reply(401));
  await expect(transport.send('/auth/login', 'POST', {})).rejects.toMatchObject({ status: 401 });
  await expect(transport.send('/auth/logout', 'POST', {})).rejects.toMatchObject({ status: 401 });
  expect(fetcher).toHaveBeenCalledTimes(2); expect(expired).not.toHaveBeenCalled();
  expect((fetcher.mock.calls[1][1]?.headers as Record<string, string>)['x-crm-auth']).toBe('1');
});
it('business errors never cause unsafe automatic retries', async () => {
  fetcher.mockResolvedValue(reply(503));
  await expect(transport.send('/synthetic', 'POST', {})).rejects.toMatchObject({ status: 503 }); expect(fetcher).toHaveBeenCalledOnce();
});

it('unresolved 409 stops after four reads with an actionable message', async () => {
  vi.useFakeTimers();
  fetcher.mockResolvedValueOnce(reply(401)).mockResolvedValueOnce(reply(401)).mockResolvedValueOnce(reply(409)).mockResolvedValue(reply(401));
  const pending = transport.api('/synthetic');
  const checked = expect(pending).rejects.toMatchObject({ status: 409, message: '登录续期尚未完成，请刷新页面重试' });
  await vi.advanceTimersByTimeAsync(2100); await checked;
  expect(fetcher).toHaveBeenCalledTimes(7); expect(expired).not.toHaveBeenCalled();
});
