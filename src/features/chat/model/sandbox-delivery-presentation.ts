import type { SandboxResultDeliveryHealth } from "@/lib/api/api-client"

export function sandboxDeliveryPresentation(health?: SandboxResultDeliveryHealth | null) {
  if (!health) return null
  if (health.inspection_failed || health.scan_truncated) {
    return { key: "chat.composer.sandboxDeliveryUnknown" as const, count: 0 }
  }
  if (!Number.isSafeInteger(health.pending_results) || health.pending_results <= 0) return null
  return {
    key: health.oldest_pending_seconds >= 30
      ? "chat.composer.sandboxDeliveryRetrying" as const
      : "chat.composer.sandboxDeliveryPending" as const,
    count: health.pending_results,
  }
}
