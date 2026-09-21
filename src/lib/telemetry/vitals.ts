import { onCLS, onINP, onLCP } from "web-vitals"
import type { TelemetrySink } from "./events.ts"

type Vital = { name: "INP" | "LCP" | "CLS"; value: number }
type Registry = { listeners: Set<(metric: Vital) => void> }
const key = Symbol.for("ineffable.telemetry.web-vitals")
/** web-vitals has no dispose API. Register once per document (also across HMR),
 * then unsubscribe all application callbacks on stop. No old closures accumulate. */
export function subscribeVitals(emit: TelemetrySink) {
  const root = globalThis as unknown as Record<symbol, Registry | undefined>
  let registry = root[key]
  if (!registry) {
    registry = { listeners: new Set() }
    root[key] = registry
    const listeners = registry.listeners
    const report = (metric: Vital) => {
      for (const listener of listeners) listener(metric)
    }
    onINP(report); onLCP(report); onCLS(report)
  }
  const listener = (metric: Vital) => emit({ name: "frontend_web_vital", properties: { metric: metric.name, value: metric.value } })
  registry.listeners.add(listener)
  return () => { registry.listeners.delete(listener) }
}
