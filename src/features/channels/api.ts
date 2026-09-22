import { requestApiJson, toApiUrl } from "@/lib/api/base-client"
import type { AutomationRuntimeConfig } from "@/lib/api/api-client"

export type ChannelConnection = {
  id: string
  protocol: string
  webhook_verified_at: string | null
  last_received_at: string | null
  display_name: string
  account_id: string
  enabled: boolean
  connected: boolean
  allowed_private_ids: string[]
  allowed_group_ids: string[]
  runtime_config_json: AutomationRuntimeConfig
}
export type ConnectionDraft = {
  client_secret?: string

  display_name: string
  account_id: string
  allowed_private_ids: string[]
  allowed_group_ids: string[]
  enabled: boolean
  runtime_config: AutomationRuntimeConfig
}
export type IssuedConnection = { connection: ChannelConnection; token: string }
export type ConnectionDetails = {
  contacts: { chat_type: string; external_chat_id: string }[]
  chats: { chat_type: string; external_chat_id: string; conversation_id: string }[]
  deliveries: {
    status: string
    count: number
    error_category: string | null
    retryable: boolean
    recovery_action: string | null
  }[]
}
const root = "/gateway/v1/channel-connections"
export function listConnections(accessToken: string, expectedSessionId: string) {
  return requestApiJson<ChannelConnection[]>(root, { accessToken, expectedSessionId })
}
export function connectionDetails(accessToken: string, expectedSessionId: string, id: string) {
  return requestApiJson<ConnectionDetails>(`${root}/${encodeURIComponent(id)}`, { accessToken, expectedSessionId })
}
export function createConnection(accessToken: string, expectedSessionId: string, draft: ConnectionDraft) {
  const { enabled: _, ...body } = draft
  void _
  return requestApiJson<IssuedConnection>(root, { accessToken, expectedSessionId, method: "POST", body: { ...body, protocol: "qqbot" } })
}
export function updateConnection(accessToken: string, expectedSessionId: string, id: string, draft: ConnectionDraft) {
  const { account_id: _, ...body } = draft
  void _
  return requestApiJson<ChannelConnection>(`${root}/${encodeURIComponent(id)}`, { accessToken, expectedSessionId, method: "PATCH", body })
}
export function rotateConnection(accessToken: string, expectedSessionId: string, id: string) {
  return requestApiJson<IssuedConnection>(`${root}/${encodeURIComponent(id)}/rotate-token`, { accessToken, expectedSessionId, method: "POST" })
}
export function deleteConnection(accessToken: string, expectedSessionId: string, id: string) {
  return requestApiJson(`${root}/${encodeURIComponent(id)}`, { accessToken, expectedSessionId, method: "DELETE" })
}
export function webhookUrl(id: string) {
  const url = new URL(toApiUrl(`${root}/${encodeURIComponent(id)}/qqbot/webhook`), window.location.origin)
  return url.toString()
}
