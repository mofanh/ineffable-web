import type { GatewayChatStreamEvent } from "@/lib/api/chat/gateway-events"
import type { WebNodeView } from "@/features/chat/web-node"

// Pane invariants:
// 1. A think block may only contain contiguous reasoning or tagged-think content.
// 2. Any structural block boundary such as tool/update must terminate the active
//    think block before the structural block is appended.
// 3. Once a think block is terminated, later reasoning must open a fresh think block
//    instead of mutating the previous one.

export type ToolCallStatus =
  | "pending"
  | "running"
  | "waiting"
  | "succeeded"
  | "failed"
  | "cancelled"

export type ToolCallView = {
  id: string
  name: string
  input: string
  output: string
  status: ToolCallStatus
  runId?: string | null
  sessionKey?: string | null
  answer?: string | null
}

export type TextBlock = {
  id: string
  type: "text"
  content: string
}

export type ThinkBlock = {
  id: string
  type: "think"
  content: string
  open: boolean
}

export type UpdateBlock = {
  id: string
  type: "update"
  content: string
}

export type ToolBlock = {
  id: string
  type: "tool"
  toolId: string
}

export type PluginBlock = {
  id: string
  type: "plugin"
  node: WebNodeView
}

export type PaneBlock = TextBlock | ThinkBlock | UpdateBlock | ToolBlock | PluginBlock

export type AgentPaneState = {
  activeThinkBlockId: string | null
  activeThinkMode: "reasoning" | "tagged" | null
  pendingTagBuffer: string
  blockOrder: string[]
  blocks: Record<string, PaneBlock>
  tools: Record<string, ToolCallView>
  receivedTextDelta: boolean
}

function createBlockId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

function appendChunk(current: string, next: string) {
  if (!next) {
    return current
  }

  return `${current}${next}`
}

function getMetadataValue(
  metadata: Record<string, unknown> | null | undefined,
  key: string
) {
  const value = metadata?.[key]
  return typeof value === "string" ? value : ""
}

function getMetadataBoolean(
  metadata: Record<string, unknown> | null | undefined,
  key: string
) {
  const value = metadata?.[key]
  return typeof value === "boolean" ? value : null
}

function statusFromToolResult(event: GatewayChatStreamEvent): ToolCallStatus {
  const metadataStatus =
    getMetadataValue(event.metadata, "status") ||
    getMetadataValue(event.metadata, "tool_status") ||
    getMetadataValue(event.metadata, "result_status")
  const normalizedStatus = metadataStatus.toLowerCase()
  if (normalizedStatus === "waiting" || normalizedStatus === "awaiting_human") {
    return "waiting"
  }
  if (normalizedStatus === "cancelled" || normalizedStatus === "canceled") {
    return "cancelled"
  }
  if (
    normalizedStatus === "failed" ||
    normalizedStatus === "error" ||
    normalizedStatus === "denied" ||
    normalizedStatus === "unsupported"
  ) {
    return "failed"
  }
  if (
    normalizedStatus === "succeeded" ||
    normalizedStatus === "success" ||
    normalizedStatus === "completed"
  ) {
    return "succeeded"
  }

  const success = getMetadataBoolean(event.metadata, "success")
  if (success === true) {
    return "succeeded"
  }
  if (success === false) {
    return "failed"
  }

  return "succeeded"
}

function getLastBlock(pane: AgentPaneState) {
  const lastBlockId = pane.blockOrder[pane.blockOrder.length - 1]
  return lastBlockId ? pane.blocks[lastBlockId] : undefined
}

function getTrailingPartialTagLength(source: string, tag: string) {
  const maxLength = Math.min(source.length, tag.length - 1)

  for (let length = maxLength; length > 0; length -= 1) {
    if (source.slice(-length) === tag.slice(0, length)) {
      return length
    }
  }

  return 0
}

function appendTextBlock(pane: AgentPaneState, content: string) {
  if (!content) {
    return pane
  }

  const lastBlock = getLastBlock(pane)
  if (lastBlock?.type === "text") {
    return {
      ...pane,
      blocks: {
        ...pane.blocks,
        [lastBlock.id]: {
          ...lastBlock,
          content: appendChunk(lastBlock.content, content),
        },
      },
    }
  }

  const blockId = createBlockId("text")
  return {
    ...pane,
    blockOrder: [...pane.blockOrder, blockId],
    blocks: {
      ...pane.blocks,
      [blockId]: {
        id: blockId,
        type: "text",
        content,
      } satisfies TextBlock,
    },
  }
}

export function appendUpdateToPane(pane: AgentPaneState, content: string) {
  const next = content.trim()
  if (!next) {
    return pane
  }

  const basePane = endThinkSegmentBeforeStructuralBlock(pane)
  const lastBlock = getLastBlock(basePane)
  if (lastBlock?.type === "update" && lastBlock.content === next) {
    return basePane
  }

  const blockId = createBlockId("update")
  return {
    ...basePane,
    blockOrder: [...basePane.blockOrder, blockId],
    blocks: {
      ...basePane.blocks,
      [blockId]: {
        id: blockId,
        type: "update",
        content: next,
      } satisfies UpdateBlock,
    },
  }
}

export function appendPluginNodeToPane(
  pane: AgentPaneState,
  node: WebNodeView
) {
  const basePane = endThinkSegmentBeforeStructuralBlock(pane)
  const existing = basePane.blocks[node.nodeId]
  return {
    ...basePane,
    blockOrder: existing
      ? basePane.blockOrder
      : [...basePane.blockOrder, node.nodeId],
    blocks: {
      ...basePane.blocks,
      [node.nodeId]: {
        id: node.nodeId,
        type: "plugin",
        node,
      } satisfies PluginBlock,
    },
  }
}

function ensureOpenThinkBlock(
  pane: AgentPaneState,
  mode: AgentPaneState["activeThinkMode"]
) {
  if (pane.activeThinkBlockId) {
    const activeBlock = pane.blocks[pane.activeThinkBlockId]
    if (activeBlock?.type === "think") {
      if (pane.activeThinkMode === mode) {
        return pane
      }

      return {
        ...pane,
        activeThinkMode: mode,
      }
    }
  }

  const blockId = createBlockId("think")
  return {
    ...pane,
    activeThinkBlockId: blockId,
    activeThinkMode: mode,
    blockOrder: [...pane.blockOrder, blockId],
    blocks: {
      ...pane.blocks,
      [blockId]: {
        id: blockId,
        type: "think",
        content: "",
        open: true,
      } satisfies ThinkBlock,
    },
  }
}

function appendThinkBlockContent(
  pane: AgentPaneState,
  content: string,
  mode: AgentPaneState["activeThinkMode"]
) {
  const nextPane = ensureOpenThinkBlock(pane, mode)
  const blockId = nextPane.activeThinkBlockId
  if (!blockId) {
    return nextPane
  }

  const activeBlock = nextPane.blocks[blockId]
  if (!activeBlock || activeBlock.type !== "think") {
    return nextPane
  }

  return {
    ...nextPane,
    blocks: {
      ...nextPane.blocks,
      [blockId]: {
        ...activeBlock,
        content: appendChunk(activeBlock.content, content),
        open: true,
      },
    },
  }
}

function closeActiveThinkBlock(pane: AgentPaneState) {
  const blockId = pane.activeThinkBlockId
  if (!blockId) {
    return pane
  }

  const activeBlock = pane.blocks[blockId]
  if (!activeBlock || activeBlock.type !== "think") {
    return {
      ...pane,
      activeThinkBlockId: null,
      activeThinkMode: null,
    }
  }

  return {
    ...pane,
    activeThinkBlockId: null,
    activeThinkMode: null,
    blocks: {
      ...pane.blocks,
      [blockId]: {
        ...activeBlock,
        open: false,
      },
    },
  }
}

function endThinkSegmentBeforeStructuralBlock(pane: AgentPaneState) {
  const nextPane = pane.activeThinkBlockId ? closeActiveThinkBlock(pane) : pane

  if (!nextPane.pendingTagBuffer) {
    return nextPane
  }

  return {
    ...nextPane,
    pendingTagBuffer: "",
  }
}

function consumeTaggedText(pane: AgentPaneState, chunk: string) {
  const openTag = "<think>"
  const closeTag = "</think>"

  let nextPane: AgentPaneState = {
    ...pane,
    pendingTagBuffer: "",
  }
  let rest = `${pane.pendingTagBuffer}${chunk}`

  while (rest.length > 0) {
    if (nextPane.activeThinkBlockId) {
      const closeIndex = rest.indexOf(closeTag)

      if (closeIndex < 0) {
        const trailingLength = getTrailingPartialTagLength(rest, closeTag)
        nextPane = appendThinkBlockContent(
          nextPane,
          rest.slice(0, rest.length - trailingLength),
          "tagged"
        )
        return {
          ...nextPane,
          pendingTagBuffer: rest.slice(rest.length - trailingLength),
        }
      }

      nextPane = appendThinkBlockContent(nextPane, rest.slice(0, closeIndex), "tagged")
      nextPane = closeActiveThinkBlock(nextPane)
      rest = rest.slice(closeIndex + closeTag.length)
      continue
    }

    const openIndex = rest.indexOf(openTag)
    if (openIndex < 0) {
      const trailingLength = getTrailingPartialTagLength(rest, openTag)
      nextPane = appendTextBlock(nextPane, rest.slice(0, rest.length - trailingLength))
      return {
        ...nextPane,
        pendingTagBuffer: rest.slice(rest.length - trailingLength),
      }
    }

    nextPane = appendTextBlock(nextPane, rest.slice(0, openIndex))
    nextPane = ensureOpenThinkBlock(nextPane, "tagged")
    rest = rest.slice(openIndex + openTag.length)
  }

  return nextPane
}

function consumeReasoningText(pane: AgentPaneState, chunk: string) {
  const openTag = "<think>"
  const closeTag = "</think>"

  let nextPane: AgentPaneState = {
    ...pane,
    pendingTagBuffer: "",
  }
  let rest = `${pane.pendingTagBuffer}${chunk}`

  while (rest.length > 0) {
    const openIndex = rest.indexOf(openTag)
    const closeIndex = rest.indexOf(closeTag)

    if (openIndex === 0) {
      nextPane = ensureOpenThinkBlock(nextPane, "tagged")
      rest = rest.slice(openTag.length)
      continue
    }

    if (closeIndex === 0) {
      nextPane = closeActiveThinkBlock(nextPane)
      rest = rest.slice(closeTag.length)
      continue
    }

    const hasOpenTag = openIndex >= 0
    const hasCloseTag = closeIndex >= 0
    const nextTagIndex =
      hasOpenTag && hasCloseTag
        ? Math.min(openIndex, closeIndex)
        : hasOpenTag
          ? openIndex
          : hasCloseTag
            ? closeIndex
            : -1

    if (nextTagIndex < 0) {
      const trailingLength = Math.max(
        getTrailingPartialTagLength(rest, openTag),
        getTrailingPartialTagLength(rest, closeTag)
      )

      nextPane = appendThinkBlockContent(
        nextPane,
        rest.slice(0, rest.length - trailingLength),
        "reasoning"
      )

      return {
        ...nextPane,
        pendingTagBuffer: rest.slice(rest.length - trailingLength),
      }
    }

    nextPane = appendThinkBlockContent(nextPane, rest.slice(0, nextTagIndex), "reasoning")
    rest = rest.slice(nextTagIndex)
  }

  return nextPane
}

export function createEmptyAgentPane(): AgentPaneState {
  return {
    activeThinkBlockId: null,
    activeThinkMode: null,
    pendingTagBuffer: "",
    blockOrder: [],
    blocks: {},
    tools: {},
    receivedTextDelta: false,
  }
}

export function getPaneBlocks(pane: AgentPaneState) {
  return pane.blockOrder.map((blockId) => pane.blocks[blockId]).filter(Boolean)
}

export function getLatestToolByName(pane: AgentPaneState, name: string) {
  for (let index = pane.blockOrder.length - 1; index >= 0; index -= 1) {
    const block = pane.blocks[pane.blockOrder[index]]
    if (block?.type !== "tool") continue
    const tool = pane.tools[block.toolId]
    if (tool?.name === name) return tool
  }
  return null
}

export function hasAgentPaneContent(pane: AgentPaneState) {
  return Boolean(pane.blockOrder.length)
}

export function applyTextDeltaToPane(pane: AgentPaneState, chunk: string) {
  const basePane =
    pane.activeThinkBlockId && pane.activeThinkMode === "reasoning"
      ? closeActiveThinkBlock(pane)
      : pane

  return consumeTaggedText(
    {
      ...basePane,
      receivedTextDelta: true,
    },
    chunk
  )
}

export function applyMessageToPane(pane: AgentPaneState, content: string) {
  if (pane.receivedTextDelta) {
    return pane
  }

  const basePane =
    pane.activeThinkBlockId && pane.activeThinkMode === "reasoning"
      ? closeActiveThinkBlock(pane)
      : pane

  return consumeTaggedText(basePane, content)
}

export function applyReasoningDeltaToPane(pane: AgentPaneState, chunk: string) {
  const nextPane = ensureOpenThinkBlock(pane, "reasoning")

  return consumeReasoningText(nextPane, chunk)
}

/**
 * Re-arm only a trailing history think block when the same live run reconnects.
 * History hydration closes every block because it cannot itself prove liveness;
 * the live event projector calls this at the first continued reasoning/text delta.
 */
export function resumeTrailingThinkBlock(pane: AgentPaneState) {
  if (pane.activeThinkBlockId || pane.activeThinkMode) {
    return pane
  }

  const trailingBlock = getLastBlock(pane)
  if (!trailingBlock || trailingBlock.type !== "think" || trailingBlock.open) {
    return pane
  }

  return {
    ...pane,
    activeThinkBlockId: trailingBlock.id,
    activeThinkMode: "tagged" as const,
    blocks: {
      ...pane.blocks,
      [trailingBlock.id]: {
        ...trailingBlock,
        open: true,
      },
    },
  }
}

export function finalizePane(pane: AgentPaneState, fallback?: string) {
  const basePane =
    fallback && !pane.receivedTextDelta ? consumeTaggedText(pane, fallback) : pane

  return {
    ...closeActiveThinkBlock({
      ...basePane,
      pendingTagBuffer: "",
    }),
    pendingTagBuffer: "",
  }
}

export function buildToolView(
  pane: AgentPaneState,
  event: GatewayChatStreamEvent,
  getToolId: (event: GatewayChatStreamEvent) => string,
  getToolName: (event: GatewayChatStreamEvent) => string
) {
  const toolId = getToolId(event)
  const existing =
    pane.tools[toolId] ??
    ({
      id: toolId,
      name: getToolName(event),
      input: "",
      output: "",
      status: "pending",
    } satisfies ToolCallView)

  const nextTool: ToolCallView = {
    ...existing,
    name: getToolName(event) || existing.name,
    runId: event.run_id ?? existing.runId ?? null,
    sessionKey:
      getMetadataValue(event.metadata, "session_key") ||
      existing.sessionKey ||
      null,
  }

  if (event.event === "tool.call.started") {
    nextTool.status = "running"
  } else if (event.event === "tool.call.delta") {
    nextTool.status = "running"
    nextTool.input = appendChunk(
      nextTool.input,
      getMetadataValue(event.metadata, "arguments_delta") || event.content || ""
    )
  } else if (event.event === "tool.call.completed") {
    nextTool.status = "running"
    nextTool.input =
      getMetadataValue(event.metadata, "full_arguments") || nextTool.input || event.content || ""
  } else if (event.event === "tool.result") {
    nextTool.status = statusFromToolResult(event)
    nextTool.output = appendChunk(nextTool.output, event.content ?? "")
  }

  return { toolId, tool: nextTool }
}

export function upsertToolInPane(
  pane: AgentPaneState,
  toolId: string,
  tool: ToolCallView
) {
  const basePane = endThinkSegmentBeforeStructuralBlock(pane)
  const hasToolBlock = basePane.blockOrder.some((blockId) => {
    const block = basePane.blocks[blockId]
    return block?.type === "tool" && block.toolId === toolId
  })

  if (hasToolBlock) {
    return {
      ...basePane,
      tools: {
        ...basePane.tools,
        [toolId]: tool,
      },
    }
  }

  const blockId = createBlockId("tool")
  return {
    ...basePane,
    blockOrder: [...basePane.blockOrder, blockId],
    blocks: {
      ...basePane.blocks,
      [blockId]: {
        id: blockId,
        type: "tool",
        toolId,
      } satisfies ToolBlock,
    },
    tools: {
      ...basePane.tools,
      [toolId]: tool,
    },
  }
}
