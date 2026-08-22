import {
  appendPluginNodeToPane,
  type AgentPaneState,
} from "../chat-pane-state.ts"
import type { GatewayChatStreamEvent } from "../../../lib/api/chat/gateway-events.ts"
import {
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
  return appendPluginNodeToPane(
    pane,
    validation.ok
      ? validation.node
      : createDefaultWebNode({
          renderer: "fallback",
          nodeId: `invalid-web-node-${event.seq ?? "history"}`,
          status: "failed",
          payload: null,
          fallback: {
            title: "Plugin view unavailable",
            localizationKey: "unsupportedPluginView",
            summary: validation.reason,
          },
        })
  )
}
