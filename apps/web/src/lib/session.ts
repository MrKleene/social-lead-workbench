/**
 * Local session store.
 *
 * The desktop renderer runs on the custom `workbench://app` scheme. Chromium's
 * cookie jar does not reliably support non-http schemes, so the session lives in
 * localStorage instead. Everything goes through this module so a future
 * move to IPC-backed storage touches one file.
 */

export type SessionUser = {
  accountNo: string
  email: string
  name: string
  role: string[]
  exp: number
}

export type Session = {
  token: string
  user: SessionUser
}

const KEY = 'social-lead.session'

export function getSession(): Session | null {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Session
    if (!parsed?.token || !parsed?.user?.email) return null
    if (typeof parsed.user.exp === 'number' && parsed.user.exp < Date.now()) {
      localStorage.removeItem(KEY)
      return null
    }
    return parsed
  } catch {
    return null
  }
}

export function setSession(session: Session): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(session))
  } catch {
    // Storage unavailable: the app still works for this run, just asks again.
  }
}

export function clearSession(): void {
  try {
    localStorage.removeItem(KEY)
  } catch {
    // ignore
  }
}
