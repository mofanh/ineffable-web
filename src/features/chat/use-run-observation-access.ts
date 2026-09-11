import * as React from "react"
import { getRunObservationAccess } from "@/features/chat/api/chat-api"
import { useApiResource } from "@/lib/app/use-api-resource"

/** Viewing observations never requires the full evolution management projection. */
export function useRunObservationAccess(accessToken: string | null | undefined, conversationId: string | null | undefined) {
  const identity = JSON.stringify([accessToken,conversationId])
  const load = React.useCallback(async () => ({identity, value: await getRunObservationAccess(accessToken!,conversationId!)}),[accessToken,conversationId,identity])
  const resource=useApiResource({enabled:Boolean(accessToken && conversationId),load})
  return !resource.error && resource.data?.identity===identity && resource.data.value.allowed
}
