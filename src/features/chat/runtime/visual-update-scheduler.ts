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
  private readonly fallbackDelayMs: number
  private pending: T[] = []
  private frameHandle: number | null = null
  private timerHandle: number | null = null
  private disposed = false

  constructor(
    host: VisualSchedulerHost,
    publish: (updates: readonly T[]) => void,
    fallbackDelayMs = DEFAULT_FALLBACK_DELAY_MS
  ) {
    this.host = host
    this.publish = publish
    this.fallbackDelayMs = fallbackDelayMs
  }

  enqueue(update: T, priority: VisualUpdatePriority = "frame") {
    if (this.disposed) return
    this.pending.push(update)

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
