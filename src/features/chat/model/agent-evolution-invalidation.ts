export const AGENT_EVOLUTION_CHANGED_EVENT = "ineffable:agent-evolution:changed"

export type AgentEvolutionChangedDetail = {
  conversationId: string
  workspaceId: string | null
}

export function publishAgentEvolutionChanged(
  detail: AgentEvolutionChangedDetail
) {
  if (typeof window === "undefined") return
  window.dispatchEvent(
    new CustomEvent<AgentEvolutionChangedDetail>(
      AGENT_EVOLUTION_CHANGED_EVENT,
      { detail }
    )
  )
}

export function subscribeAgentEvolutionChanged(
  listener: (detail: AgentEvolutionChangedDetail) => void
) {
  if (typeof window === "undefined") return () => {}

  const handleEvent = (event: Event) => {
    const detail = (event as CustomEvent<AgentEvolutionChangedDetail>).detail
    if (detail?.conversationId) listener(detail)
  }
  window.addEventListener(AGENT_EVOLUTION_CHANGED_EVENT, handleEvent)
  return () => {
    window.removeEventListener(AGENT_EVOLUTION_CHANGED_EVENT, handleEvent)
  }
}
