/**
 * UI preferences (theme, text direction, sidebar layout).
 *
 * These used to be stored in cookies. The packaged renderer runs with
 * Chromium's cookie encryption enabled, which reads the OS keychain the first
 * time a cookie is touched — that raised a macOS password prompt on every
 * launch. Preferences are not credentials, so they live in localStorage, which
 * needs no keychain access.
 */

export function getPreference(name: string): string | undefined {
  try {
    return localStorage.getItem(name) ?? undefined
  } catch {
    return undefined
  }
}

export function setPreference(name: string, value: string): void {
  try {
    localStorage.setItem(name, value)
  } catch {
    // Storage unavailable: the preference simply does not persist.
  }
}

export function removePreference(name: string): void {
  try {
    localStorage.removeItem(name)
  } catch {
    // ignore
  }
}
