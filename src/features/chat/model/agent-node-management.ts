type AgentEvolutionWorkspace = {
  id: string
  workspace_type?: string | null
}

export function resolveAgentEvolutionWorkspaceId(
  workspace: AgentEvolutionWorkspace | null | undefined
) {
  return workspace?.workspace_type === "team" ? workspace.id : undefined
}

export function resolveAgentNodeTargetConversationId(
  selectedConversationId: string,
  currentConversationId: string | null,
  conversationIds: string[]
) {
  if (selectedConversationId && conversationIds.includes(selectedConversationId)) {
    return selectedConversationId
  }
  if (currentConversationId && conversationIds.includes(currentConversationId)) {
    return currentConversationId
  }
  return conversationIds[0] ?? ""
}
