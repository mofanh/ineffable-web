import * as React from "react"

import type { AgentUserInputResponse } from "@/features/chat/components/agent-tool-renderers"
import {
  DEFAULT_WEB_PLUGIN_ID,
  webNodeRendererKey,
  type WebNodeView,
} from "@/features/chat/web-node"

export type WebNodeRenderContext = {
  prefersReducedMotion: boolean
  onSubmitUserInput?: (response: AgentUserInputResponse) => Promise<void>
}

export type WebNodeRendererProps<TPayload = unknown> = {
  node: WebNodeView<TPayload>
  context: WebNodeRenderContext
}

export type WebNodeRenderer<TPayload = unknown> = React.ComponentType<
  WebNodeRendererProps<TPayload>
>

export class WebNodeRendererRegistry {
  private readonly renderers = new Map<string, WebNodeRenderer>()

  register<TPayload>(
    pluginId: string,
    renderer: string,
    component: WebNodeRenderer<TPayload>
  ) {
    const key = `${pluginId}:${renderer}`
    if (this.renderers.has(key)) {
      throw new Error(`duplicate_web_node_renderer:${key}`)
    }
    this.renderers.set(key, component as WebNodeRenderer)
    return this
  }

  resolve(node: WebNodeView) {
    return this.renderers.get(webNodeRendererKey(node)) ?? null
  }

  render(
    node: WebNodeView,
    context: WebNodeRenderContext,
    fallbackRenderer: WebNodeRenderer
  ) {
    const renderer = this.resolve(node) ?? fallbackRenderer
    return React.createElement(renderer, { node, context })
  }
}

type WebNodeSeatProps = {
  node: WebNodeView
  registry: WebNodeRendererRegistry
  context: WebNodeRenderContext
  fallbackRenderer: WebNodeRenderer
}

export const WebNodeSeat = React.memo(function WebNodeSeat({
  node,
  registry,
  context,
  fallbackRenderer,
}: WebNodeSeatProps) {
  return registry.render(node, context, fallbackRenderer)
})

export function registerDefaultWebNodeRenderer<TPayload>(
  registry: WebNodeRendererRegistry,
  renderer: string,
  component: WebNodeRenderer<TPayload>
) {
  registry.register(DEFAULT_WEB_PLUGIN_ID, renderer, component)
}
