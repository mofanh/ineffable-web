export const WEB_NODE_SCHEMA_VERSION = 1 as const
export const DEFAULT_WEB_PLUGIN_ID = "ineffable.web.default"
export const FRONTEND_WEB_PLUGIN_ID = "ineffable.web.frontend"
export const MAX_WEB_NODE_PAYLOAD_BYTES = 64 * 1024

const WEB_NODE_STATUSES = new Set<WebNodeStatus>([
  "pending",
  "running",
  "waiting",
  "succeeded",
  "failed",
  "cancelled",
  "settled",
])
const SAFE_IDENTITY = /^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,127}$/
const FORBIDDEN_PAYLOAD_KEYS = new Set([
  "code",
  "css",
  "html",
  "iframe",
  "module",
  "moduleUrl",
  "script",
  "srcdoc",
])

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

export type WebNodeValidation =
  | { ok: true; node: WebNodeView }
  | { ok: false; reason: string }

function hasForbiddenPayloadKey(value: unknown, depth = 0): boolean {
  if (depth > 20 || !value || typeof value !== "object") return depth > 20
  if (Array.isArray(value)) {
    return value.some((item) => hasForbiddenPayloadKey(item, depth + 1))
  }
  return Object.entries(value).some(
    ([key, item]) =>
      FORBIDDEN_PAYLOAD_KEYS.has(key) || hasForbiddenPayloadKey(item, depth + 1)
  )
}

export function validateWebNodeView(value: unknown): WebNodeValidation {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { ok: false, reason: "web_node_not_object" }
  }
  const candidate = value as Partial<WebNodeView>
  if (candidate.schemaVersion !== WEB_NODE_SCHEMA_VERSION) {
    return { ok: false, reason: "web_node_schema_version" }
  }
  if (!SAFE_IDENTITY.test(candidate.pluginId ?? "")) {
    return { ok: false, reason: "web_node_plugin_id" }
  }
  if (!SAFE_IDENTITY.test(candidate.renderer ?? "")) {
    return { ok: false, reason: "web_node_renderer" }
  }
  if (!SAFE_IDENTITY.test(candidate.nodeId ?? "")) {
    return { ok: false, reason: "web_node_node_id" }
  }
  if (!WEB_NODE_STATUSES.has(candidate.status as WebNodeStatus)) {
    return { ok: false, reason: "web_node_status" }
  }
  if (
    !candidate.fallback ||
    typeof candidate.fallback !== "object" ||
    typeof candidate.fallback.title !== "string" ||
    !candidate.fallback.title.trim() ||
    candidate.fallback.title.length > 160 ||
    (candidate.fallback.summary !== undefined &&
      (typeof candidate.fallback.summary !== "string" ||
        candidate.fallback.summary.length > 1000))
  ) {
    return { ok: false, reason: "web_node_fallback" }
  }
  if (hasForbiddenPayloadKey(candidate.payload)) {
    return { ok: false, reason: "web_node_executable_payload" }
  }
  try {
    const payloadBytes = new TextEncoder().encode(
      JSON.stringify(candidate.payload ?? null)
    ).byteLength
    if (payloadBytes > MAX_WEB_NODE_PAYLOAD_BYTES) {
      return { ok: false, reason: "web_node_payload_too_large" }
    }
  } catch {
    return { ok: false, reason: "web_node_payload_not_serializable" }
  }
  return { ok: true, node: candidate as WebNodeView }
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
  return validateWebNodeView(value).ok
}
