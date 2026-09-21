import { installTelemetrySink, telemetryPath, type TelemetryEvent } from "./events.ts"
import { readTelemetryConfig, createTelemetryTransport } from "./transport.ts"
import { observePerformance } from "./performance.ts"

/** Called once outside React; StrictMode does not duplicate observers or pageviews. */
export function startBrowserTelemetry(env: Record<string, unknown>) {
  const config = readTelemetryConfig(env)
  if (!config) return null
  const transport = createTelemetryTransport(config, location.origin)
  let path = telemetryPath(location.pathname)
  const emit = (event: TelemetryEvent) => transport.enqueue(event, event.name === "frontend_web_vital" ? "/document" : path)
  const uninstall = installTelemetrySink(emit)
  const performanceObserver = observePerformance(emit)
  emit({ name: "screen_view", properties: {} })
  return {
    route(pathname: string) {
      const next = telemetryPath(pathname)
      if (path !== next) { performanceObserver.flush(); path = next; emit({ name: "screen_view", properties: {} }) }
    },
    stop() { uninstall(); performanceObserver.stop(); transport.stop() },
    stats: transport.stats,
  }
}
