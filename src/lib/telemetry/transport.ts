import { safeProperties, type TelemetryEvent } from "./events.ts"

export type TelemetryConfig = { apiUrl: string; clientId: string; environment: string }
export function readTelemetryConfig(env: Record<string, unknown>): TelemetryConfig | null {
  if (env.VITE_TELEMETRY_ENABLED !== "true") return null
  try {
    const url = new URL(String(env.VITE_OPENPANEL_API_URL))
    if (url.username || url.password || url.search || url.hash ||
        !(url.protocol === "https:" || url.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname))) return null
    const clientId = String(env.VITE_OPENPANEL_CLIENT_ID ?? "")
    const environment = String(env.VITE_TELEMETRY_ENVIRONMENT ?? "unspecified")
    if (!/^[a-zA-Z0-9_-]{1,128}$/.test(clientId) || !/^[a-zA-Z0-9_-]{1,32}$/.test(environment)) return null
    return { apiUrl: url.href.replace(/\/$/, ""), clientId, environment }
  } catch { return null }
}

/** Single serial, bounded, best-effort transport. No retries or persistent queue. */
export function createTelemetryTransport(config: TelemetryConfig, origin: string, fetcher: typeof fetch = fetch) {
  const queue: string[] = []
  let stopped = false
  let sending = false
  let timer: ReturnType<typeof setTimeout> | undefined
  let controller: AbortController | undefined
  let windowStart = Date.now()
  let count = 0
  const stats = { accepted: 0, delivered: 0, failed: 0, dropped: 0 }
  async function flush() {
    timer = undefined
    if (stopped || sending || !queue.length) return
    sending = true
    controller = new AbortController()
    const timeout = setTimeout(() => controller?.abort(), 2000)
    try {
      const response = await fetcher(`${config.apiUrl}/track`, {
        method: "POST", mode: "cors", credentials: "omit", referrerPolicy: "no-referrer", redirect: "error",
        headers: { "content-type": "application/json", "openpanel-client-id": config.clientId },
        body: queue.shift(), signal: controller.signal,
      })
      if (response.ok) stats.delivered++; else stats.failed++
      void response.body?.cancel().catch(() => {})
    } catch { stats.failed++ } finally {
      clearTimeout(timeout)
      sending = false
      if (!stopped && queue.length) timer = setTimeout(() => { void flush() }, 250)
    }
  }
  return {
    stats,
    enqueue(event: TelemetryEvent, path: string) {
      if (stopped) return
      const properties = safeProperties(event)
      if (!properties) return
      if (Date.now() - windowStart >= 60_000) { count = 0; windowStart = Date.now() }
      if (queue.length >= 32 || count >= 120) { stats.dropped++; return }
      count++; stats.accepted++
      queue.push(JSON.stringify({ type: "track", payload: { name: event.name, properties: {
        ...properties, schema_version: 1, environment: config.environment,
        __path: `${origin}${path}`, __referrer: "", __title: path,
      } } }))
      if (!sending && timer === undefined) timer = setTimeout(() => { void flush() }, 250)
    },
    stop() { stopped = true; clearTimeout(timer); queue.length = 0; controller?.abort() },
  }
}
