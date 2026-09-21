/** Closed, content-free observation contract. No user/run IDs or arbitrary strings. */
export type TelemetryEvent =
  | { name: "screen_view"; properties: Record<string, never> }
  | { name: "frontend_web_vital"; properties: { metric: "INP" | "LCP" | "CLS"; value: number } }
  | { name: "frontend_long_tasks"; properties: { count: number; total_ms: number; max_ms: number } }
  | { name: "frontend_scroll_frames"; properties: { count: number; slow_frames: number; max_ms: number } }
  | { name: "chat_send_requested"; properties: { mode: "ordinary" | "guided" } }
  | { name: "chat_send_response"; properties: { status: number; duration_ms: number } }
  | { name: "chat_first_output"; properties: { duration_ms: number } }
  | { name: "chat_run_observed_end"; properties: { outcome: "completed" | "failed" | "cancelled"; duration_ms: number } }

export type TelemetrySink = (event: TelemetryEvent) => void
let sink: TelemetrySink | undefined
export function installTelemetrySink(next: TelemetrySink) {
  sink = next
  return () => { if (sink === next) { sink = undefined; freshRuns.clear() } }
}
export function telemetryEnabled() { return sink !== undefined }
export function trackTelemetry(event: TelemetryEvent) {
  // Observations must never change a successful business operation into a failure.
  try { sink?.(event) } catch { /* optional observation */ }
}

/** Route allowlist also protects unknown routes and invitation tokens. */
export function telemetryPath(pathname: string): string {
  if (/^\/workspace\/[^/]+\/objects(?:\/[^/]+)?\/?$/.test(pathname)) return "/workspace/:workspaceId/objects/:objectId"
  if (/^\/team-spaces\/[^/]+\/members\/?$/.test(pathname)) return "/team-spaces/:workspaceId/members"
  if (pathname.startsWith("/workspace-invitations/")) return "/workspace-invitations/:token"
  if (pathname.startsWith("/sandbox-preview/")) return "/sandbox-preview/:exposureId"
  return ["/", "/login", "/register", "/account", "/automation", "/agent-nodes", "/models", "/notifications", "/team-spaces/new", "/system/models", "/system/plans", "/system/secrets", "/system/users", "/admin/llm"].includes(pathname) ? pathname : "/other"
}

/** Runtime allowlist: do not trust extra properties supplied through JS or casts. */
export function safeProperties(event: TelemetryEvent): Record<string, string | number> | null {
  const p = event.properties as Record<string, unknown>
  const numbers = (keys: string[]) => Object.fromEntries(keys.flatMap(key => typeof p[key] === "number" && Number.isFinite(p[key]) && p[key] >= 0 ? [[key, Math.min(p[key], 86_400_000)]] : []))
  switch (event.name) {
    case "screen_view": return {}
    case "frontend_web_vital": return ["INP", "LCP", "CLS"].includes(String(p.metric)) ? { ...numbers(["value"]), metric: String(p.metric) } : null
    case "frontend_long_tasks": return numbers(["count", "total_ms", "max_ms"])
    case "frontend_scroll_frames": return numbers(["count", "slow_frames", "max_ms"])
    case "chat_send_requested": return p.mode === "ordinary" || p.mode === "guided" ? { mode: p.mode } : null
    case "chat_send_response": return numbers(["status", "duration_ms"])
    case "chat_first_output": return numbers(["duration_ms"])
    case "chat_run_observed_end": return ["completed", "failed", "cancelled"].includes(String(p.outcome)) ? { ...numbers(["duration_ms"]), outcome: String(p.outcome) } : null
    default: return null
  }
}

// Eligibility comes only from a new POST /send stream, never a subscribe/replay.
// IDs are ephemeral local correlation, not telemetry properties.
const freshRuns = new Map<string, number>()
export function noteFreshRun(runId: string) {
  if (!telemetryEnabled()) return
  if (freshRuns.size >= 32) freshRuns.delete(freshRuns.keys().next().value!)
  freshRuns.set(runId, Date.now())
}
export function claimFreshRun(runId: string) {
  const started = freshRuns.get(runId)
  freshRuns.delete(runId)
  return started !== undefined && Date.now() - started < 10_000
}

export function releaseFreshRun(runId: string) { freshRuns.delete(runId) }
