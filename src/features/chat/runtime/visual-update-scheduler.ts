export type VisualUpdatePriority = "frame" | "immediate"

export type VisualSchedulerHost = {
  requestFrame: (callback: () => void) => number
  cancelFrame: (handle: number) => void
  setTimer: (callback: () => void, delayMs: number) => number
  clearTimer: (handle: number) => void
}

const DEFAULT_FALLBACK_DELAY_MS = 80

export function browserVisualSchedulerHost(): VisualSchedulerHost {
  return {
    requestFrame: (callback) => window.requestAnimationFrame(callback),
    cancelFrame: (handle) => window.cancelAnimationFrame(handle),
    setTimer: (callback, delayMs) => window.setTimeout(callback, delayMs),
    clearTimer: (handle) => window.clearTimeout(handle),
  }
}

/**
 * Coalesces visual-only updates without delaying canonical event processing.
 * Immediate updates first settle the pending batch and then publish exactly once.
 */
export class VisualUpdateScheduler<T> {
  private readonly host: VisualSchedulerHost
  private readonly publish: (updates: readonly T[]) => void
  private readonly mergePending: ((previous: T, next: T) => T | null) | null
  private readonly fallbackDelayMs: number
  private pending: T[] = []
  private frameHandle: number | null = null
  private timerHandle: number | null = null
  private disposed = false

  constructor(
    host: VisualSchedulerHost,
    publish: (updates: readonly T[]) => void,
    fallbackDelayMs = DEFAULT_FALLBACK_DELAY_MS,
    mergePending?: (previous: T, next: T) => T | null
  ) {
    this.host = host
    this.publish = publish
    this.fallbackDelayMs = fallbackDelayMs
    this.mergePending = mergePending ?? null
  }

  enqueue(update: T, priority: VisualUpdatePriority = "frame") {
    if (this.disposed) return
    const previous = this.pending.at(-1)
    const merged =
      previous !== undefined && this.mergePending
        ? this.mergePending(previous, update)
        : null
    if (merged === null) this.pending.push(update)
    else this.pending[this.pending.length - 1] = merged

    if (priority === "immediate") {
      this.flushNow()
      return
    }

    if (this.frameHandle === null) {
      this.frameHandle = this.host.requestFrame(() => this.flush())
    }
    if (this.timerHandle === null) {
      this.timerHandle = this.host.setTimer(
        () => this.flush(),
        this.fallbackDelayMs
      )
    }
  }

  flushNow() {
    if (this.disposed) return
    this.flush()
  }

  hasPendingUpdates() {
    return this.pending.length > 0
  }

  discardPending() {
    if (this.disposed) return
    this.cancelScheduledFlushes()
    this.pending = []
  }

  dispose() {
    if (this.disposed) return
    this.disposed = true
    this.cancelScheduledFlushes()
    this.pending = []
  }

  private flush() {
    this.cancelScheduledFlushes()
    if (this.pending.length === 0) return

    const updates = this.pending
    this.pending = []
    this.publish(updates)
  }

  private cancelScheduledFlushes() {
    if (this.frameHandle !== null) {
      this.host.cancelFrame(this.frameHandle)
      this.frameHandle = null
    }
    if (this.timerHandle !== null) {
      this.host.clearTimer(this.timerHandle)
      this.timerHandle = null
    }
  }
}
