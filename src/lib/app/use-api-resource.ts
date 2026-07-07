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

  const reload = React.useCallback(async () => {
    if (!enabled) {
      setState("idle")
      setData(null)
      setError(null)
      return null
    }

    setState((current) => (current === "success" ? "refreshing" : "loading"))
    setError(null)
    try {
      const result = await load()
      setData(result)
      setState("success")
      return result
    } catch (caught) {
      const appError = normalizeAppError(caught, {
        fallbackMessage: errorMessage,
      })
      setError(appError)
      setState("error")
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
