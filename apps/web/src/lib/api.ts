let csrf = "";
export function setCsrf(value: string) {
  csrf = value;
}
export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
export async function api<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const response = await fetch(`/api${path}`, {
    ...options,
    credentials: "same-origin",
    headers: {
      "Content-Type": "application/json",
      ...(options.method && options.method !== "GET"
        ? { "x-csrf-token": csrf }
        : {}),
      ...options.headers,
    },
  });
  const data = await response.json().catch(() => null);
  if (response.status === 401 && !["/auth/me", "/auth/login"].includes(path))
    window.dispatchEvent(new Event("crm-session-expired"));
  if (!response.ok)
    throw new ApiError(
      response.status,
      data?.message || "请求失败，请检查本地服务",
    );
  return data as T;
}
export const send = <T>(path: string, method: string, body: unknown) =>
  api<T>(path, { method, body: JSON.stringify(body) });
