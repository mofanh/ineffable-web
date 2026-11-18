import {
  appendPluginNodeToPane,
  type AgentPaneState,
} from "../chat-pane-state.ts"
import type { GatewayChatStreamEvent } from "../../../lib/api/chat/gateway-events.ts"
import {
  DEFAULT_WEB_PLUGIN_ID,
  createDefaultWebNode,
  validateWebNodeView,
} from "../web-node.ts"

export function projectDeclaredWebNode(
  pane: AgentPaneState,
  event: GatewayChatStreamEvent
) {
  const declaredNode = event.metadata?.web_view
  if (declaredNode === undefined) return pane
  const validation = validateWebNodeView(declaredNode)
  const reserved = validation.ok && validation.node.pluginId === DEFAULT_WEB_PLUGIN_ID &&
    validation.node.renderer === "agent-report"
  return appendPluginNodeToPane(
    pane,
    validation.ok && !reserved
      ? validation.node
      : createDefaultWebNode({
          renderer: "fallback",
          nodeId: `invalid-web-node-${event.seq ?? "history"}`,
          status: "failed",
          payload: null,
          fallback: {
            title: "Plugin view unavailable",
            localizationKey: "unsupportedPluginView",
            summary: validation.ok ? "reserved_mailbox_report" : validation.reason,
          },
        })
  )
}
