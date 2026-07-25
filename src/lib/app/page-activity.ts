import * as React from "react"

export const BACKGROUND_CONVERSATION_REFRESH_INTERVAL_MS = 5_000
export const ACTIVE_REFRESH_MIN_INTERVAL_MS = 1_000

export function isPageActive(
  visibilityState: DocumentVisibilityState,
  online: boolean
) {
  return visibilityState === "visible" && online
}

function getPageActivitySnapshot() {
  return isPageActive(document.visibilityState, navigator.onLine)
}

function getServerPageActivitySnapshot() {
  return true
}

function subscribePageActivity(onStoreChange: () => void) {
  window.addEventListener("online", onStoreChange)
  window.addEventListener("offline", onStoreChange)
  document.addEventListener("visibilitychange", onStoreChange)

  return () => {
    window.removeEventListener("online", onStoreChange)
    window.removeEventListener("offline", onStoreChange)
    document.removeEventListener("visibilitychange", onStoreChange)
  }
}

export function usePageActive() {
  return React.useSyncExternalStore(
    subscribePageActivity,
    getPageActivitySnapshot,
    getServerPageActivitySnapshot
  )
}

export function useActivePageRefresh(
  refresh: () => void | Promise<void>,
  options?: {
    enabled?: boolean
    minIntervalMs?: number
  }
) {
  const isActive = usePageActive()
  const refreshRef = React.useRef(refresh)
  const inFlightRef = React.useRef(false)
  const lastStartedAtRef = React.useRef(Number.NEGATIVE_INFINITY)
  const enabled = options?.enabled ?? true
  const minIntervalMs =
    options?.minIntervalMs ?? ACTIVE_REFRESH_MIN_INTERVAL_MS

  React.useEffect(() => {
    refreshRef.current = refresh
  }, [refresh])

  React.useEffect(() => {
    if (!enabled || !isActive) {
      return
    }

    const triggerRefresh = () => {
      const now = Date.now()
      if (
        !getPageActivitySnapshot() ||
        inFlightRef.current ||
        now - lastStartedAtRef.current < minIntervalMs
      ) {
        return
      }

      lastStartedAtRef.current = now
      inFlightRef.current = true
      void Promise.resolve(refreshRef.current()).finally(() => {
        inFlightRef.current = false
      })
    }

    triggerRefresh()
    window.addEventListener("focus", triggerRefresh)
    return () => window.removeEventListener("focus", triggerRefresh)
  }, [enabled, isActive, minIntervalMs])
}
