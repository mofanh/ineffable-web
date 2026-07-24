import * as React from "react"

import { normalizeAppError, type AppError } from "@/lib/app/api-errors"

export type ApiResourceState = "idle" | "loading" | "refreshing" | "success" | "error"

type ApiResourceCacheEntry = {
  data?: unknown
  updatedAt: number
  inFlight?: Promise<unknown>
}

const apiResourceCache = new Map<string, ApiResourceCacheEntry>()

function serializeCacheKey(cacheKey?: readonly unknown[]) {
  return cacheKey ? JSON.stringify(cacheKey) : null
}

function readCacheEntry(cacheKey: string | null) {
  return cacheKey
    ? (apiResourceCache.get(cacheKey) as ApiResourceCacheEntry | undefined)
    : undefined
}

async function loadCachedResource<T>({
  cacheKey,
  force,
  load,
  staleTime,
}: {
  cacheKey: string | null
  force: boolean
  load: () => Promise<T>
  staleTime: number
}) {
  if (!cacheKey) {
    return load()
  }

  const current = apiResourceCache.get(cacheKey)
  if (
    !force &&
    current?.data !== undefined &&
    Date.now() - current.updatedAt < staleTime
  ) {
    return current.data as T
  }
  if (current?.inFlight) {
    return current.inFlight as Promise<T>
  }

  const promise = load()
  apiResourceCache.set(cacheKey, {
    data: current?.data,
    updatedAt: current?.updatedAt ?? 0,
    inFlight: promise,
  })

  try {
    const result = await promise
    apiResourceCache.set(cacheKey, {
      data: result,
      updatedAt: Date.now(),
    })
    return result
  } catch (error) {
    if (current?.data !== undefined) {
      apiResourceCache.set(cacheKey, current)
    } else {
      apiResourceCache.delete(cacheKey)
    }
    throw error
  }
}

export function clearApiResourceCache() {
  apiResourceCache.clear()
}

export function invalidateApiResourceCache(cacheKey: readonly unknown[]) {
  const serializedCacheKey = serializeCacheKey(cacheKey)
  if (!serializedCacheKey) {
    return
  }
  const current = apiResourceCache.get(serializedCacheKey)
  if (current) {
    apiResourceCache.set(serializedCacheKey, {
      ...current,
      updatedAt: 0,
    })
  }
}

export function useApiResource<T>(options: {
  enabled?: boolean
  load: () => Promise<T>
  errorMessage?: string
  cacheKey?: readonly unknown[]
  staleTime?: number
  retainPreviousData?: boolean
}) {
  const {
    load,
    errorMessage,
    staleTime = 30_000,
    retainPreviousData = false,
  } = options
  const enabled = options.enabled ?? true
  const serializedCacheKey = serializeCacheKey(options.cacheKey)
  const initialCacheEntry = readCacheEntry(serializedCacheKey)
  const [data, setDataState] = React.useState<T | null>(
    () => (initialCacheEntry?.data as T | undefined) ?? null
  )
  const [state, setState] = React.useState<ApiResourceState>(
    enabled
      ? initialCacheEntry?.data !== undefined
        ? "success"
        : "loading"
      : "idle"
  )
  const [error, setError] = React.useState<AppError | null>(null)
  const dataRef = React.useRef(data)
  const requestIdRef = React.useRef(0)
  const isMountedRef = React.useRef(true)

  React.useEffect(() => {
    dataRef.current = data
  }, [data])

  React.useEffect(() => {
    isMountedRef.current = true
    return () => {
      isMountedRef.current = false
    }
  }, [])

  const execute = React.useCallback(async (force: boolean) => {
    const requestId = requestIdRef.current + 1
    requestIdRef.current = requestId
    const canCommit = () =>
      isMountedRef.current && requestIdRef.current === requestId

    if (!enabled) {
      if (canCommit()) {
        setState("idle")
        setDataState(null)
        setError(null)
      }
      return null
    }

    const cached = readCacheEntry(serializedCacheKey)
    const hasFreshCache =
      !force &&
      cached?.data !== undefined &&
      Date.now() - cached.updatedAt < staleTime
    if (hasFreshCache) {
      if (canCommit()) {
        setDataState(cached.data as T)
        setState("success")
        setError(null)
      }
      return cached.data as T
    }

    if (canCommit()) {
      if (cached?.data !== undefined) {
        setDataState(cached.data as T)
      } else if (!retainPreviousData) {
        setDataState(null)
      }
      setState((current) =>
        current === "success" || cached?.data !== undefined
          ? "refreshing"
          : "loading"
      )
      setError(null)
    }
    try {
      const result = await loadCachedResource({
        cacheKey: serializedCacheKey,
        force,
        load,
        staleTime,
      })
      if (canCommit()) {
        setDataState(result)
        setState("success")
      }
      return result
    } catch (caught) {
      const appError = normalizeAppError(caught, {
        fallbackMessage: errorMessage,
      })
      if (canCommit()) {
        setError(appError)
        setState((current) =>
          current === "refreshing" && dataRef.current !== null
            ? "success"
            : "error"
        )
      }
      return null
    }
  }, [
    enabled,
    errorMessage,
    load,
    retainPreviousData,
    serializedCacheKey,
    staleTime,
  ])

  React.useEffect(() => {
    void execute(false)
  }, [execute])

  const reload = React.useCallback(() => execute(true), [execute])

  const setData = React.useCallback(
    (value: T | ((current: T | null) => T)) => {
      setDataState((current) => {
        const next =
          typeof value === "function"
            ? (value as (current: T | null) => T)(current)
            : value
        if (serializedCacheKey) {
          apiResourceCache.set(serializedCacheKey, {
            data: next,
            updatedAt: Date.now(),
          })
        }
        return next
      })
      setState("success")
      setError(null)
    },
    [serializedCacheKey]
  )

  return {
    data,
    state,
    error,
    isLoading: state === "loading",
    isRefreshing: state === "refreshing",
    reload,
    setData,
  }
}
