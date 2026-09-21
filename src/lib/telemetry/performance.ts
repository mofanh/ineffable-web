import { subscribeVitals } from "./vitals.ts"
import type { TelemetrySink } from "./events.ts"

export function observePerformance(emit: TelemetrySink) {
  let stopped = false
  const unsubscribeVitals = subscribeVitals(emit)
  let tasks = { count: 0, total_ms: 0, max_ms: 0 }
  let frames = { count: 0, slow_frames: 0, max_ms: 0 }
  let observer: PerformanceObserver | undefined
  try {
    if (PerformanceObserver.supportedEntryTypes.includes("longtask")) {
      observer = new PerformanceObserver(list => {
        if (document.visibilityState !== "visible") return
        for (const entry of list.getEntries()) {
          tasks.count++; tasks.total_ms += entry.duration; tasks.max_ms = Math.max(tasks.max_ms, entry.duration)
        }
      })
      observer.observe({ type: "longtask" })
    }
  } catch { /* unsupported browser */ }
  let frame = 0
  let last = 0
  let scrollUntil = 0
  const tick = (now: number) => {
    frame = 0
    if (stopped || document.visibilityState !== "visible") { last = 0; return }
    if (last) {
      const gap = now - last
      frames.count++; if (gap > 34) frames.slow_frames++
      frames.max_ms = Math.max(frames.max_ms, gap)
    }
    if (now > scrollUntil) { last = 0; return }
    last = now; frame = requestAnimationFrame(tick)
  }
  const onScroll = () => {
    if (document.visibilityState !== "visible") return
    scrollUntil = performance.now() + 200
    if (!frame) frame = requestAnimationFrame(tick)
  }
  const flush = () => {
    if (tasks.count) emit({ name: "frontend_long_tasks", properties: tasks })
    if (frames.count) emit({ name: "frontend_scroll_frames", properties: frames })
    tasks = { count: 0, total_ms: 0, max_ms: 0 }
    frames = { count: 0, slow_frames: 0, max_ms: 0 }
  }
  const visibility = () => { if (document.visibilityState === "hidden") { cancelAnimationFrame(frame); frame = 0; last = 0; flush() } }
  document.addEventListener("scroll", onScroll, { capture: true, passive: true })
  document.addEventListener("visibilitychange", visibility)
  const interval = setInterval(flush, 30_000)
  return { flush, stop() {
    stopped = true; unsubscribeVitals(); clearInterval(interval); observer?.disconnect(); cancelAnimationFrame(frame)
    document.removeEventListener("scroll", onScroll, true)
    document.removeEventListener("visibilitychange", visibility)
  } }
}
