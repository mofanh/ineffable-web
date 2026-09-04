import type { GatewayChatStreamEvent } from "@/lib/api/chat/gateway-events"

export type ModelFailureTranslationKey =
  | "rateLimited"
  | "authenticationFailed"
  | "permissionDenied"
  | "resourceNotFound"
  | "requestTimeout"
  | "requestRejected"
  | "upstreamUnavailable"
  | "transport"
  | "protocol"

export type ModelFailurePresentation = {
  translationKey: ModelFailureTranslationKey | null
  fallbackMessage: string
  retryAfterMs: number | null
  providerCode: string | null
  providerMessage: string | null
  providerRequestId: string | null
}

const STANDARD_MODEL_FAILURES: Record<string, ModelFailureTranslationKey> = {
  model_rate_limited: "rateLimited",
  model_authentication_failed: "authenticationFailed",
  model_permission_denied: "permissionDenied",
  model_resource_not_found: "resourceNotFound",
  model_request_timeout: "requestTimeout",
  model_request_rejected: "requestRejected",
  model_upstream_unavailable: "upstreamUnavailable",
  model_transport: "transport",
  model_protocol: "protocol",
}

function recordValue(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

function safeText(value: unknown, maxLength: number): string | null {
  if (typeof value !== "string") {
    return null
  }
  const normalized = Array.from(value)
    .map((character) => {
      const code = character.charCodeAt(0)
      const disallowedControl =
        (code >= 0 && code <= 8) ||
        code === 11 ||
        code === 12 ||
        (code >= 14 && code <= 31) ||
        code === 127
      return disallowedControl ? "�" : character
    })
    .join("")
    .replace(/\s+/g, " ")
    .trim()
  return normalized ? Array.from(normalized).slice(0, maxLength).join("") : null
}

export function modelFailurePresentationFromEvent(
  event: GatewayChatStreamEvent
): ModelFailurePresentation | null {
  if (event.event !== "run.failed") {
    return null
  }
  const metadata = recordValue(event.metadata)
  const failure = recordValue(metadata?.failure)
  const modelFailure = recordValue(failure?.model_failure)
  const category = safeText(failure?.category, 128)
  const retryAfter = modelFailure?.retry_after_ms
  return {
    translationKey: category ? STANDARD_MODEL_FAILURES[category] ?? null : null,
    fallbackMessage:
      safeText(event.content, 4096) ?? safeText(failure?.cause, 4096) ?? "Gateway stream failed",
    retryAfterMs:
      typeof retryAfter === "number" && Number.isFinite(retryAfter) && retryAfter >= 0
        ? Math.floor(retryAfter)
        : null,
    providerCode: safeText(modelFailure?.provider_code, 256),
    providerMessage: safeText(modelFailure?.provider_message, 2048),
    providerRequestId: safeText(modelFailure?.provider_request_id, 256),
  }
}
