import { telemetryEnabled, trackTelemetry } from "../../../lib/telemetry/events.ts"
import type { GatewayChatStreamEvent } from "../../../lib/api/chat/gateway-events.ts"

/** Only receives events accepted by the canonical run reducer. In-memory timings,
 * not run state or a source of business outcomes; IDs never leave this observer. */
export class ChatTelemetry {
  private runs = new Map<string, { started: number; first: boolean; epoch: number | null }>()
  observe(event: GatewayChatStreamEvent, runId: string | null, epoch: number | null) {
    if (!telemetryEnabled() || !runId) return
    const now = Date.now()
    if (event.event === "run.started") {
      for (const [id, timing] of this.runs) if (now - timing.started > 3_600_000) this.runs.delete(id)
      // Restored/historical runs are not new user interactions.
      if (!event.ts_ms || Math.abs(now - event.ts_ms) > 5000 || this.runs.has(runId)) return
      if (this.runs.size >= 32) this.runs.delete(this.runs.keys().next().value!)
      this.runs.set(runId, { started: now, first: false, epoch })
      return
    }
    const timing = this.runs.get(runId)
    if (!timing) return
    if (now - timing.started > 3_600_000) { this.runs.delete(runId); return }
    if (timing.epoch !== epoch) { this.runs.delete(runId); return }
    const duration_ms = Math.max(0, now - timing.started)
    if (event.event === "model.text.delta" && event.content && !timing.first) {
      timing.first = true
      trackTelemetry({ name: "chat_first_output", properties: { duration_ms } })
    }
    const outcome = event.event.slice(4)
    if (event.event.startsWith("run.") && (outcome === "completed" || outcome === "failed" || outcome === "cancelled")) {
      this.runs.delete(runId)
      trackTelemetry({ name: "chat_run_observed_end", properties: { outcome, duration_ms } })
    }
  }
}
