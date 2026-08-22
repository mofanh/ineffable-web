import type {
  AgentPaneState,
  PaneBlock,
  ThinkBlock,
  ToolCallView,
} from "../chat-pane-state.ts"
import {
  createDefaultWebNode,
  type WebNodeStatus,
  type WebNodeView,
} from "../web-node.ts"

export type TextWebNodePayload = {
  content: string
  streaming: boolean
}

export type ReasoningWebNodePayload = {
  block: ThinkBlock
  streaming: boolean
}

export type UpdateWebNodePayload = {
  content: string
}

export type ToolWebNodePayload = {
  tool: ToolCallView
  canRespondToUserInput: boolean
}

export type ProjectPaneOptions = {
  streaming: boolean
  canRespondToUserInput: boolean
}

type CachedProjection = {
  block: PaneBlock
  tool: ToolCallView | undefined
  streaming: boolean
  canRespondToUserInput: boolean
  node: WebNodeView
}

export class WebNodeProjectionCache {
  private readonly cache = new Map<string, CachedProjection>()

  project(pane: AgentPaneState, options: ProjectPaneOptions) {
    const lastBlockId = pane.blockOrder.at(-1)
    const liveNodeIds = new Set(pane.blockOrder)
    const nodes = pane.blockOrder.flatMap((blockId) => {
      const block = pane.blocks[blockId]
      if (!block) return []
      const tool = block.type === "tool" ? pane.tools[block.toolId] : undefined
      const streaming = options.streaming && block.id === lastBlockId
      const cached = this.cache.get(block.id)
      if (
        cached?.block === block &&
        cached.tool === tool &&
        cached.streaming === streaming &&
        cached.canRespondToUserInput === options.canRespondToUserInput
      ) {
        return [cached.node]
      }

      const node = projectPaneBlockToWebNode(pane, block, {
        ...options,
        streaming,
      })
      this.cache.set(block.id, {
        block,
        tool,
        streaming,
        canRespondToUserInput: options.canRespondToUserInput,
        node,
      })
      return [node]
    })

    for (const nodeId of this.cache.keys()) {
      if (!liveNodeIds.has(nodeId)) this.cache.delete(nodeId)
    }
    return nodes
  }
}

function nodeStatus(streaming: boolean): WebNodeStatus {
  return streaming ? "running" : "settled"
}

export function projectPaneBlockToWebNode(
  pane: AgentPaneState,
  block: PaneBlock,
  options: ProjectPaneOptions
): WebNodeView {
  if (block.type === "text") {
    return createDefaultWebNode<TextWebNodePayload>({
      renderer: "text",
      nodeId: block.id,
      status: nodeStatus(options.streaming),
      payload: { content: block.content, streaming: options.streaming },
      fallback: { title: "Text", summary: block.content.slice(0, 160) },
    })
  }

  if (block.type === "think") {
    return createDefaultWebNode<ReasoningWebNodePayload>({
      renderer: "reasoning",
      nodeId: block.id,
      status: block.open ? "running" : "settled",
      payload: { block, streaming: options.streaming && block.open },
      fallback: { title: "Reasoning", summary: block.content.slice(-160) },
    })
  }

  if (block.type === "update") {
    return createDefaultWebNode<UpdateWebNodePayload>({
      renderer: "update",
      nodeId: block.id,
      status: nodeStatus(options.streaming),
      payload: { content: block.content },
      fallback: { title: "Update", summary: block.content.slice(0, 160) },
    })
  }

  const tool = pane.tools[block.toolId]
  return createDefaultWebNode<ToolWebNodePayload | null>({
    renderer: "tool",
    nodeId: block.id,
    status: tool?.status ?? "failed",
    payload: tool
      ? { tool, canRespondToUserInput: options.canRespondToUserInput }
      : null,
    fallback: { title: tool?.name || "Tool" },
  })
}
