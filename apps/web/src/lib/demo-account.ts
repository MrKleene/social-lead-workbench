/**
 * The single built-in account for this local desktop build.
 *
 * Replace `verifyDemoAccount` with a real provider (e.g. `@clerk/electron`) when
 * remote authentication lands. Nothing else in the app needs to change: the gate
 * only cares about `getSession()`.
 */

export const DEMO_ACCOUNT = {
  accountNo: 'LOCAL-001',
  email: 'demo@social-lead.app',
  password: 'demo1234',
  name: '本地演示用户',
} as const

export const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000

export function verifyDemoAccount(email: string, password: string): boolean {
  return (
    email.trim().toLowerCase() === DEMO_ACCOUNT.email &&
    password === DEMO_ACCOUNT.password
  )
}
