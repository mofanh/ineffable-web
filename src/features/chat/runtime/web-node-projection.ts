import type {
  AgentPaneState,
  PaneBlock,
  ThinkBlock,
  ToolCallView,
} from "../chat-pane-state.ts"
import { hasAgentPaneContent } from "../chat-pane-state.ts"
import type { SubagentView } from "../gateway-chat-types.ts"
import {
  WEB_NODE_SCHEMA_VERSION,
  createDefaultWebNode,
  type WebNodeStatus,
  type WebNodeView,
} from "../web-node.ts"
import {
  extractWorkspaceArtifact,
  WORKSPACE_WEB_PLUGIN_ID,
  type WorkspaceArtifactReference,
} from "./workspace-artifacts.ts"

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

export type WorkspaceArtifactsWebNodePayload = {
  artifacts: WorkspaceArtifactReference[]
}

export type SubagentWebNodePayload = {
  subagent: SubagentView
}

export type SubagentProjection = {
  order: string[]
  records: Record<string, SubagentView>
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
  private artifactSignature = ""
  private artifactNode: WebNodeView<WorkspaceArtifactsWebNodePayload> | null = null
  private readonly subagentNodes = new Map<
    string,
    { subagent: SubagentView; node: WebNodeView<SubagentWebNodePayload> }
  >()

  project(
    pane: AgentPaneState,
    options: ProjectPaneOptions,
    subagents?: SubagentProjection
  ) {
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
    const artifacts = pane.blockOrder.flatMap((blockId) => {
      const block = pane.blocks[blockId]
      if (block?.type !== "tool") return []
      const tool = pane.tools[block.toolId]
      const artifact = tool ? extractWorkspaceArtifact(tool) : null
      return artifact ? [artifact] : []
    })
    const artifactSignature = JSON.stringify(artifacts)
    if (artifactSignature !== this.artifactSignature) {
      this.artifactSignature = artifactSignature
      this.artifactNode = artifacts.length
        ? {
            schemaVersion: WEB_NODE_SCHEMA_VERSION,
            pluginId: WORKSPACE_WEB_PLUGIN_ID,
            renderer: "artifact-stack",
            nodeId: `workspace-artifacts-${artifacts[0].artifactId}`,
            status: "settled",
            payload: { artifacts },
            fallback: {
              title: "Workspace artifacts",
              localizationKey: "workspaceArtifacts",
              summary: artifacts.map((artifact) => artifact.path).join(", "),
            },
          }
        : null
    }
    const projectedSubagents = (subagents?.order ?? []).flatMap((subagentId) => {
      const subagent = subagents?.records[subagentId]
      if (!subagent || !hasAgentPaneContent(subagent)) return []
      const cached = this.subagentNodes.get(subagentId)
      if (cached?.subagent === subagent) return [cached.node]
      const node = createDefaultWebNode<SubagentWebNodePayload>({
        renderer: "subagent",
        nodeId: `subagent-${subagentId}`,
        status: subagent.status === "streaming" ? "running" : "settled",
        payload: { subagent },
        fallback: { title: subagent.name },
      })
      this.subagentNodes.set(subagentId, { subagent, node })
      return [node]
    })
    const liveSubagentIds = new Set(subagents?.order ?? [])
    for (const subagentId of this.subagentNodes.keys()) {
      if (!liveSubagentIds.has(subagentId)) this.subagentNodes.delete(subagentId)
    }
    return [
      ...nodes,
      ...(this.artifactNode ? [this.artifactNode] : []),
      ...projectedSubagents,
    ]
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
  if (block.type === "plugin") {
    return block.node
  }
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
