import type {
  CapabilityExposurePolicy,
  CapabilityExposureSelection,
} from "@/lib/api/api-client"

export function reconcileCapabilityExposureDraftPolicy(
  current: CapabilityExposureSelection | null,
  dirty: boolean,
  fallback: CapabilityExposureSelection,
  policy: CapabilityExposurePolicy
) {
  if (dirty && current && policy.allowed_modes.includes(current.mode)) {
    return current
  }
  return fallback
}

export function capabilityExposureForSubmission(
  selection: CapabilityExposureSelection | null,
  conversationId: string | null,
  hydratedConversationId: string | null
) {
  if (!selection) return undefined

  // A null conversation is the one unsaved draft. Existing conversations may
  // submit a selection only after their own canonical detail has hydrated, so
  // a late response from the previously viewed conversation cannot leak in.
  if (!conversationId || hydratedConversationId === conversationId) {
    return selection
  }
  return undefined
}
