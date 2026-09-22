import { normalizeAppError } from "@/lib/app/api-errors"
import { i18n } from "@/lib/i18n/i18n"

const configurationErrors: Record<string, string> = {
  "model_profile_id is required": "model",
  "selected model is unavailable or no longer authorized": "model",
  "selected workspace is unavailable or unauthorized": "workspace",
  "sandbox environment_id is required": "sandbox",
  "selected sandbox is unavailable or unauthorized for this workspace": "sandbox",
  "selected sandbox is currently unavailable": "sandboxOffline",
  "selected capabilities are not allowed by your plan": "capabilities",
  "runtime owner is not active": "owner",
  "invalid capability selection; reselect the capability mode and tools": "capabilitySelection",
}
export function normalizeChannelError(error: unknown) {
  const normalized = normalizeAppError(error, { fallbackMessage: i18n.t("channels.error") })
  const key = configurationErrors[normalized.message]
  return key ? { ...normalized, message: i18n.t(`channels.validation.${key}`) } : normalized
}

// Only a definite rejection permits resubmission; timeouts and lost responses
// can follow a successful mutation and still require inspection first.
export function channelSaveOutcomeUncertain(status?: number) {
  return !status || status === 408 || status >= 500
}
