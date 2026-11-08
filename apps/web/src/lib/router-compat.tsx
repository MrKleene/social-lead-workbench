/**
 * Thin compatibility layer over TanStack Router.
 *
 * The business pages were written against react-router's `Link` /
 * `useSearchParams` / `useLocation`. Rather than rewriting 13 files in the same
 * pass as the router swap, they import from here. Two differences callers must
 * know about:
 *   - `to` may still carry a query string; it is split into `to` + `search`.
 *   - `setParams` accepts a URLSearchParams, a plain object, or an updater, and
 *     tolerates react-router's `flushSync` option (ignored).
 */
import * as React from 'react'
import {
  Link as TanStackLink,
  Outlet as TanStackOutlet,
  useBlocker as useTanStackBlocker,
  useLocation as useTanStackLocation,
  useNavigate,
  useSearch,
} from '@tanstack/react-router'

// TanStack's route-aware generics are far stricter than react-router's runtime
// contract; the compat surface deliberately stays loose.
const AnyLink = TanStackLink as unknown as React.ComponentType<any>
const AnyOutlet = TanStackOutlet as unknown as React.ComponentType<any>

type ParamsObject = Record<string, string>

function toSearchString(search: unknown): string {
  if (!search || typeof search !== 'object') return ''
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(search as Record<string, unknown>)) {
    if (value === undefined || value === null || value === '') continue
    params.set(key, String(value))
  }
  const serialised = params.toString()
  return serialised ? `?${serialised}` : ''
}

function toObject(params: URLSearchParams): ParamsObject {
  const result: ParamsObject = {}
  for (const [key, value] of params) result[key] = value
  return result
}

export function Link({ to, ...rest }: { to: string } & Record<string, any>) {
  const [pathname, query] = to.split('?')
  const search = query ? toObject(new URLSearchParams(query)) : undefined
  return <AnyLink to={pathname} search={search} {...rest} />
}

export const Outlet = AnyOutlet

export function useLocation() {
  const location = useTanStackLocation()
  return {
    pathname: location.pathname,
    search: toSearchString(location.search),
    hash: location.hash,
    href: location.href,
  }
}

type SetParams = (
  next:
    | URLSearchParams
    | ParamsObject
    | ((previous: URLSearchParams) => URLSearchParams | ParamsObject),
  options?: { replace?: boolean; flushSync?: boolean }
) => void

export function useSearchParams(): [URLSearchParams, SetParams] {
  const search = useSearch({ strict: false }) as Record<string, unknown>
  const navigate = useNavigate() as any

  const params = React.useMemo(() => {
    const result = new URLSearchParams()
    for (const [key, value] of Object.entries(search ?? {})) {
      if (value === undefined || value === null || value === '') continue
      result.set(key, String(value))
    }
    return result
  }, [search])

  const setParams = React.useCallback<SetParams>(
    (next, options) => {
      const resolved =
        typeof next === 'function' ? next(new URLSearchParams(params)) : next
      const asObject =
        resolved instanceof URLSearchParams ? toObject(resolved) : resolved
      navigate({ search: () => asObject, replace: options?.replace })
    },
    [navigate, params]
  )

  return [params, setParams]
}

type CompatLocation = { pathname: string; search: string; hash: string }

export function useBlocker(
  shouldBlock: (args: {
    currentLocation: CompatLocation
    nextLocation: CompatLocation
  }) => boolean
) {
  const blocker = useTanStackBlocker({
    shouldBlockFn: ({ current, next }) =>
      shouldBlock({
        currentLocation: {
          pathname: (current as any).pathname,
          search: toSearchString((current as any).search),
          hash: (current as any).hash ?? '',
        },
        nextLocation: {
          pathname: (next as any).pathname,
          search: toSearchString((next as any).search),
          hash: (next as any).hash ?? '',
        },
      }),
    withResolver: true,
    enableBeforeUnload: false,
  })

  return {
    state:
      blocker.status === 'blocked'
        ? ('blocked' as const)
        : ('unblocked' as const),
    proceed: () => blocker.proceed?.(),
    reset: () => blocker.reset?.(),
  }
}
