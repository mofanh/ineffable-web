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
  private readonly renderers = new Map<
    string,
    { component: WebNodeRenderer; validate?: (payload: unknown) => boolean }
  >()

  register<TPayload>(
    pluginId: string,
    renderer: string,
    component: WebNodeRenderer<TPayload>,
    validate?: (payload: unknown) => payload is TPayload
  ) {
    const key = `${pluginId}:${renderer}`
    if (this.renderers.has(key)) {
      throw new Error(`duplicate_web_node_renderer:${key}`)
    }
    this.renderers.set(key, {
      component: component as WebNodeRenderer,
      validate,
    })
    return this
  }

  resolve(node: WebNodeView) {
    const registration = this.renderers.get(webNodeRendererKey(node))
    if (!registration || (registration.validate && !registration.validate(node.payload))) {
      return null
    }
    return registration.component
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

class WebNodeErrorBoundary extends React.Component<
  { children: React.ReactNode; fallback: React.ReactNode; resetKey: string },
  { failed: boolean }
> {
  state = { failed: false }

  static getDerivedStateFromError() {
    return { failed: true }
  }

  componentDidUpdate(previous: Readonly<{ resetKey: string }>) {
    if (this.state.failed && previous.resetKey !== this.props.resetKey) {
      this.setState({ failed: false })
    }
  }

  render() {
    return this.state.failed ? this.props.fallback : this.props.children
  }
}

export const WebNodeSeat = React.memo(function WebNodeSeat({
  node,
  registry,
  context,
  fallbackRenderer,
}: WebNodeSeatProps) {
  const fallback = React.createElement(fallbackRenderer, { node, context })
  return (
    <WebNodeErrorBoundary
      fallback={fallback}
      resetKey={`${node.nodeId}:${node.status}`}
    >
      {registry.render(node, context, fallbackRenderer)}
    </WebNodeErrorBoundary>
  )
})

export function registerDefaultWebNodeRenderer<TPayload>(
  registry: WebNodeRendererRegistry,
  renderer: string,
  component: WebNodeRenderer<TPayload>
) {
  registry.register(DEFAULT_WEB_PLUGIN_ID, renderer, component)
}
