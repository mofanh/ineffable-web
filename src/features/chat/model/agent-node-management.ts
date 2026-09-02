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

export function agentNodeManagementTargetKey(
  conversationId: string,
  workspaceId: string | undefined
) {
  return conversationId ? `${conversationId}:${workspaceId ?? "user"}` : ""
}

export function matchesAgentNodeProjectionTarget(
  projection: {
    conversation_id: string
    workspace_id?: string | null
  } | null,
  conversationId: string,
  workspaceId: string | undefined
) {
  return Boolean(
    projection &&
      projection.conversation_id === conversationId &&
      (projection.workspace_id ?? null) === (workspaceId ?? null)
  )
}
