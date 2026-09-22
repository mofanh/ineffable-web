export type ApiResourceState = "idle" | "loading" | "refreshing" | "success" | "error"

type ResourceSnapshot = {
  data?: unknown
  error?: unknown
  state: ApiResourceState
  updatedAt: number
  invalidation: number
  clearEpoch: number
}

let clearEpoch = 0

// One entry owns both the cached value and the snapshot observed by mounted hooks.
export class ApiResourceEntry {
  revision = 0
  inFlight?: Promise<unknown | null>
  private listeners = new Set<() => void>()
  private snapshot: ResourceSnapshot = { state: "idle", updatedAt: 0, invalidation: 0, clearEpoch }

  getSnapshot = () => this.snapshot
  subscribe = (listener: () => void) => {
    this.listeners.add(listener)
    return () => { this.listeners.delete(listener) }
  }
  publish(patch: Partial<ResourceSnapshot>) {
    this.snapshot = { ...this.snapshot, ...patch }
    this.listeners.forEach(listener => listener())
  }
  setData<T>(value: T | ((current: T | null) => T)) {
    const next = typeof value === "function"
      ? (value as (current: T | null) => T)((this.snapshot.data as T | undefined) ?? null)
      : value
    this.revision++
    this.inFlight = undefined
    this.publish({ data: next, error: undefined, state: "success", updatedAt: Date.now() })
  }
  invalidate() {
    this.revision++
    this.inFlight = undefined
    this.publish({ updatedAt: 0, error: undefined, invalidation: this.snapshot.invalidation + 1 })
  }
  clear() {
    this.revision++
    this.inFlight = undefined
    this.publish({ data: undefined, error: undefined, state: "idle", updatedAt: 0, clearEpoch })
    return this.listeners.size === 0
  }
}

const apiResourceCache = new Map<string, ApiResourceEntry>()

export function getApiResourceEntry(key: string) {
  let entry = apiResourceCache.get(key)
  if (!entry) {
    entry = new ApiResourceEntry()
    apiResourceCache.set(key, entry)
  }
  return entry
}

export function clearApiResourceCache() {
  clearEpoch++
  for (const [key, entry] of apiResourceCache) {
    // Keep active subscribers on the same entry; new readers must share their owner.
    if (entry.clear()) apiResourceCache.delete(key)
  }
}

export function invalidateApiResourceCache(cacheKey: readonly unknown[]) {
  apiResourceCache.get(JSON.stringify(cacheKey))?.invalidate()
}

export function loadApiResource<T>(entry: ApiResourceEntry, load: () => Promise<T>, force: boolean, staleTime: number): Promise<T | null> {
  const current = entry.getSnapshot()
  if (!force && current.data !== undefined && Date.now() - current.updatedAt < staleTime) {
    return Promise.resolve(current.data as T)
  }
  if (entry.inFlight) return entry.inFlight as Promise<T | null>

  const revision = entry.revision
  const canCommit = () => entry.revision === revision && entry.inFlight === promise
  const promise = Promise.resolve().then(load).then(result => {
    if (!canCommit()) return null
    entry.inFlight = undefined
    entry.publish({ data: result, error: undefined, state: "success", updatedAt: Date.now() })
    return result
  }, error => {
    if (!canCommit()) return null
    entry.inFlight = undefined
    entry.publish({ error, state: entry.getSnapshot().data !== undefined ? "success" : "error" })
    return null
  })
  entry.inFlight = promise
  entry.publish({ error: undefined, state: current.data !== undefined ? "refreshing" : "loading" })
  return promise
}
