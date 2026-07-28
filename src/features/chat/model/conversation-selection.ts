export type ConversationSelectionRef = {
  current: string | null
}

export function reconcileConversationSelection(input: {
  currentConversationId: string | null
  availableConversationIds: string[]
  preserveNewConversationDraft: boolean
}) {
  if (
    input.currentConversationId &&
    input.availableConversationIds.includes(input.currentConversationId)
  ) {
    return input.currentConversationId
  }

  if (
    input.currentConversationId == null &&
    input.preserveNewConversationDraft
  ) {
    return null
  }

  return input.availableConversationIds[0] ?? null
}

export function shouldApplyConversationListRefresh(input: {
  requestId: number
  latestRequestId: number
  selectionVersionAtRequest: number
  currentSelectionVersion: number
}) {
  return (
    input.requestId === input.latestRequestId &&
    input.selectionVersionAtRequest === input.currentSelectionVersion
  )
}

export function commitConversationSelection(
  selectionRef: ConversationSelectionRef,
  selectConversation: (conversationId: string | null) => void,
  conversationId: string | null
) {
  selectionRef.current = conversationId
  selectConversation(conversationId)
}
