export const WEB_NODE_SCHEMA_VERSION = 1 as const
export const DEFAULT_WEB_PLUGIN_ID = "ineffable.web.default"

export type WebNodeStatus =
  | "pending"
  | "running"
  | "waiting"
  | "succeeded"
  | "failed"
  | "cancelled"
  | "settled"

export type WebNodeFallback = {
  title: string
  summary?: string
}

export type WebNodeView<TPayload = unknown> = {
  schemaVersion: typeof WEB_NODE_SCHEMA_VERSION
  pluginId: string
  renderer: string
  nodeId: string
  status: WebNodeStatus
  payload: TPayload
  fallback: WebNodeFallback
}

export function webNodeRendererKey(
  node: Pick<WebNodeView, "pluginId" | "renderer">
) {
  return `${node.pluginId}:${node.renderer}`
}

export function createDefaultWebNode<TPayload>(input: {
  renderer: string
  nodeId: string
  status: WebNodeStatus
  payload: TPayload
  fallback: WebNodeFallback
}): WebNodeView<TPayload> {
  return {
    schemaVersion: WEB_NODE_SCHEMA_VERSION,
    pluginId: DEFAULT_WEB_PLUGIN_ID,
    ...input,
  }
}

export function isWebNodeView(value: unknown): value is WebNodeView {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false
  const candidate = value as Partial<WebNodeView>
  return (
    candidate.schemaVersion === WEB_NODE_SCHEMA_VERSION &&
    typeof candidate.pluginId === "string" &&
    candidate.pluginId.trim().length > 0 &&
    typeof candidate.renderer === "string" &&
    candidate.renderer.trim().length > 0 &&
    typeof candidate.nodeId === "string" &&
    candidate.nodeId.trim().length > 0 &&
    typeof candidate.status === "string" &&
    Boolean(candidate.fallback) &&
    typeof candidate.fallback?.title === "string"
  )
}
