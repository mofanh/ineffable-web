import * as React from "react"

import { normalizeAppError } from "@/lib/app/api-errors"
import { ApiResourceEntry, getApiResourceEntry, loadApiResource } from "@/lib/app/api-resource-cache"

export { clearApiResourceCache, invalidateApiResourceCache, type ApiResourceState } from "@/lib/app/api-resource-cache"

export function useApiResource<T>(options: {
  enabled?: boolean
  load: () => Promise<T>
  errorMessage?: string
  cacheKey?: readonly unknown[]
  staleTime?: number
  retainPreviousData?: boolean
}) {
  const { load, errorMessage, staleTime = 30_000, retainPreviousData = false } = options
  const enabled = options.enabled ?? true
  const key = options.cacheKey ? JSON.stringify(options.cacheKey) : null
  const [uncachedEntry] = React.useState(() => new ApiResourceEntry())
  const entry = key ? getApiResourceEntry(key) : uncachedEntry
  const uncachedLoad = key === null ? load : null
  const snapshot = React.useSyncExternalStore(entry.subscribe, entry.getSnapshot, entry.getSnapshot)
  const active = React.useRef<{ entry: ApiResourceEntry; enabled: boolean } | null>(null)
  const [previous, setPrevious] = React.useState<{ entry: ApiResourceEntry; data: T; clearEpoch: number } | null>(null)

  React.useLayoutEffect(() => {
    const identity = { entry, enabled, uncachedLoad }
    active.current = identity
    return () => { if (active.current === identity) active.current = null }
  }, [entry, enabled, uncachedLoad])

  React.useEffect(() => {
    if (snapshot.data !== undefined && enabled) {
      setPrevious({ entry, data: snapshot.data as T, clearEpoch: snapshot.clearEpoch })
    } else if (!enabled) {
      setPrevious(null)
    }
  }, [entry, snapshot.data, snapshot.clearEpoch, enabled])

  const execute = React.useCallback(async (force: boolean) => {
    const identity = active.current
    if (!identity?.enabled || identity.entry !== entry) return null
    const result = await loadApiResource(entry, load, force || key === null, staleTime)
    return active.current === identity ? result : null
  }, [entry, key, load, staleTime])

  React.useEffect(() => {
    void execute(false)
    return () => { if (key === null) entry.clear() }
  }, [execute, enabled, entry, key, snapshot.invalidation])

  const setData = React.useCallback((value: T | ((current: T | null) => T)) => {
    if (active.current?.entry !== entry || !active.current.enabled || entry.getSnapshot().clearEpoch !== snapshot.clearEpoch) return
    entry.setData(value)
  }, [entry, snapshot.clearEpoch])

  const reload = React.useCallback(() => execute(true), [execute])
  const retained = retainPreviousData && previous?.entry !== entry && previous?.clearEpoch === snapshot.clearEpoch
    ? previous.data : null
  const data = enabled ? (snapshot.data as T | undefined) ?? retained : null
  const state = enabled ? snapshot.state : "idle"
  const error = enabled && snapshot.error !== undefined
    ? normalizeAppError(snapshot.error, { fallbackMessage: errorMessage }) : null

  return { data, state, error, isLoading: state === "loading", isRefreshing: state === "refreshing", reload, setData }
}
