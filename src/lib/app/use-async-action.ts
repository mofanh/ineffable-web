import * as React from "react"

import { normalizeAppError, type AppError } from "@/lib/app/api-errors"

export function useAsyncAction<TArgs extends unknown[], TResult>(
  action: (...args: TArgs) => Promise<TResult>,
  options?: { errorMessage?: string }
) {
  const [isRunning, setIsRunning] = React.useState(false)
  const [error, setError] = React.useState<AppError | null>(null)

  const run = React.useCallback(
    async (...args: TArgs) => {
      setIsRunning(true)
      setError(null)
      try {
        return await action(...args)
      } catch (caught) {
        const appError = normalizeAppError(caught, {
          fallbackMessage: options?.errorMessage,
        })
        setError(appError)
        throw appError
      } finally {
        setIsRunning(false)
      }
    },
    [action, options?.errorMessage]
  )

  return {
    run,
    isRunning,
    error,
    clearError: React.useCallback(() => setError(null), []),
  }
}
