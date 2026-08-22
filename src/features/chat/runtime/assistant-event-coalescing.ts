import type { GatewayChatStreamEvent } from "../../../lib/api/chat/gateway-events.ts"

function objectValue(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

function stringValue(value: unknown) {
  return typeof value === "string" ? value : ""
}

function visualEventLane(event: GatewayChatStreamEvent) {
  const metadata = objectValue(event.metadata)
  return [
    event.event,
    event.scope ?? stringValue(metadata?.scope),
    stringValue(metadata?.subagent_id),
    stringValue(metadata?.tool_call_id),
  ].join(":")
}

export function mergeAssistantDeltaEvents(
  previous: GatewayChatStreamEvent,
  next: GatewayChatStreamEvent
): GatewayChatStreamEvent | null {
  if (
    visualEventLane(previous) !== visualEventLane(next) ||
    previous.metadata?.web_view !== undefined ||
    next.metadata?.web_view !== undefined ||
    ![
      "model.text.delta",
      "model.reasoning.delta",
      "tool.call.delta",
    ].includes(next.event)
  ) {
    return null
  }
  const previousMetadata = objectValue(previous.metadata)
  const nextMetadata = objectValue(next.metadata)
  const argumentsDelta = `${stringValue(previousMetadata?.arguments_delta)}${stringValue(nextMetadata?.arguments_delta)}`
  return {
    ...next,
    content: `${previous.content ?? ""}${next.content ?? ""}`,
    metadata: {
      ...(previous.metadata ?? {}),
      ...(next.metadata ?? {}),
      ...(argumentsDelta ? { arguments_delta: argumentsDelta } : {}),
    },
  }
}
