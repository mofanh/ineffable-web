import * as React from "react"

import { normalizeAppError, type AppError } from "@/lib/app/api-errors"

export type ApiResourceState = "idle" | "loading" | "refreshing" | "success" | "error"

export function useApiResource<T>(options: {
  enabled?: boolean
  load: () => Promise<T>
  errorMessage?: string
}) {
  const { load, errorMessage } = options
  const enabled = options.enabled ?? true
  const [data, setData] = React.useState<T | null>(null)
  const [state, setState] = React.useState<ApiResourceState>(
    enabled ? "loading" : "idle"
  )
  const [error, setError] = React.useState<AppError | null>(null)
  const requestIdRef = React.useRef(0)
  const isMountedRef = React.useRef(true)

  React.useEffect(() => {
    isMountedRef.current = true
    return () => {
      isMountedRef.current = false
    }
  }, [])

  const reload = React.useCallback(async () => {
    const requestId = requestIdRef.current + 1
    requestIdRef.current = requestId
    const canCommit = () =>
      isMountedRef.current && requestIdRef.current === requestId

    if (!enabled) {
      if (canCommit()) {
        setState("idle")
        setData(null)
        setError(null)
      }
      return null
    }

    if (canCommit()) {
      setState((current) => (current === "success" ? "refreshing" : "loading"))
      setError(null)
    }
    try {
      const result = await load()
      if (canCommit()) {
        setData(result)
        setState("success")
      }
      return result
    } catch (caught) {
      const appError = normalizeAppError(caught, {
        fallbackMessage: errorMessage,
      })
      if (canCommit()) {
        setError(appError)
        setState("error")
      }
      return null
    }
  }, [enabled, errorMessage, load])

  React.useEffect(() => {
    void reload()
  }, [reload])

  return {
    data,
    state,
    error,
    isLoading: state === "loading",
    isRefreshing: state === "refreshing",
    reload,
  }
}
