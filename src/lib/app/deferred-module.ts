import { useEffect, useSyncExternalStore } from "react"

/** Share code loading without making a latency-sensitive mount a Suspense retry. */
export function createDeferredModule<T>(load: () => Promise<T>) {
  type Snapshot = { status: "pending" } | { status: "ready"; value: T } | { status: "failed"; error: unknown }
  let snapshot: Snapshot = { status: "pending" }
  let promise: Promise<T> | undefined
  const listeners = new Set<() => void>()
  const getSnapshot = () => snapshot
  const subscribe = (listener: () => void) => {
    listeners.add(listener)
    return () => { listeners.delete(listener) }
  }
  function preload() {
    return (promise ??= Promise.resolve().then(load).then(
      value => {
        snapshot = { status: "ready", value }
        listeners.forEach(listener => listener())
        return value
      },
      error => {
        snapshot = { status: "failed", error }
        listeners.forEach(listener => listener())
        throw error
      },
    ))
  }
  function useModule() {
    const current = useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
    useEffect(() => { void preload().catch(() => undefined) }, [])
    if (current.status === "failed") throw current.error
    return current.status === "ready" ? current.value : null
  }
  return { preload, useModule }
}
