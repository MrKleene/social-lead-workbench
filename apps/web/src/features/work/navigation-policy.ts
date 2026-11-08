/**
 * Settings/templates stay mounted within the workspace, so a draft there is
 * only at risk when the route actually leaves `/work`.
 */
export function shouldProtectDrafts(
  kinds: readonly 'retained'[],
  currentPath: string,
  nextPath: string
) {
  if (!kinds.length) return false
  if (currentPath === '/configuration') return currentPath !== nextPath
  if (!/^\/work(?:\/|$)/.test(nextPath)) return true
  return false
}
