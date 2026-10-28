let csrf = "";
let renewal: Promise<void> | null = null;
export function setCsrf(value: string) { csrf = value; }
export class ApiError extends Error {
  constructor(public status: number, message: string) { super(message); }
}
async function readResponse<T>(response: Response): Promise<T> {
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new ApiError(response.status, data?.message || "请求失败，请检查本地服务");
  return data as T;
}
function request(path: string, options: RequestInit = {}) {
  return fetch(`/api${path}`, {
    ...options,
    credentials: "same-origin",
    cache: "no-store",
    headers: {
      "Content-Type": "application/json",
      ...(options.method && options.method !== "GET" ? { "x-csrf-token": csrf } : {}),
      ...(path === "/auth/refresh" || path === "/auth/logout" ? { "x-crm-auth": "1" } : {}),
      ...options.headers,
    },
  });
}
async function recoverSession() {
  // Re-read shared cookies after acquiring the cross-tab lock. Another tab may
  // already have refreshed. Only CSRF state is returned to JavaScript.
  const me = await request("/auth/me");
  if (me.ok) { setCsrf((await readResponse<{ csrfToken: string }>(me)).csrfToken); return; }
  if (me.status !== 401) { await readResponse(me); return; }
  const refreshed = await request("/auth/refresh", { method: "POST", body: "{}" });
  if (refreshed.status === 409) {
    // Fallback for browsers without Web Locks: never reuse an old refresh token.
    // Bounded reads allow the winner's Set-Cookie to arrive; no refresh loop.
    for (let attempt = 0; attempt < 4; attempt++) {
      await new Promise(resolve => setTimeout(resolve, 200 * (attempt + 1)));
      const ready = await request("/auth/me");
      if (ready.ok) { setCsrf((await readResponse<{ csrfToken: string }>(ready)).csrfToken); return; }
      if (ready.status !== 401) { await readResponse(ready); return; }
    }
    throw new ApiError(409, "登录续期尚未完成，请刷新页面重试");
  }
  const session = await readResponse<{ csrfToken: string }>(refreshed);
  setCsrf(session.csrfToken);
}
function withAuthLock<T>(work: () => Promise<T>): Promise<T> {
  return typeof navigator !== "undefined" && navigator.locks
    ? Promise.resolve(navigator.locks.request("crm-auth-renewal", work)).then(value => value as T)
    : work();
}
function renewSession() {
  if (!renewal) {
    renewal = withAuthLock(recoverSession).finally(() => { renewal = null; });
  }
  return renewal;
}
export async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  let response = await (["/auth/login", "/auth/logout"].includes(path)
    ? withAuthLock(() => request(path, options)) : request(path, options));
  if (response.status === 401 && !["/auth/login", "/auth/refresh", "/auth/logout"].includes(path)) {
    try {
      await renewSession();
      // Retry once only. The original 401 was rejected before business execution.
      response = await request(path, options);
    } catch (error) {
      if (path !== "/auth/me" && error instanceof ApiError && error.status === 401) window.dispatchEvent(new Event("crm-session-expired"));
      throw error;
    }
    if (path !== "/auth/me" && response.status === 401) window.dispatchEvent(new Event("crm-session-expired"));
  }
  return readResponse<T>(response);
}
export const send = <T>(path: string, method: string, body: unknown) =>
  api<T>(path, { method, body: JSON.stringify(body) });
