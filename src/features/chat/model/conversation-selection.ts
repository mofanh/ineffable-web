export type ConversationSelectionRef = {
  current: string | null
}

export function commitConversationSelection(
  selectionRef: ConversationSelectionRef,
  selectConversation: (conversationId: string | null) => void,
  conversationId: string | null
) {
  selectionRef.current = conversationId
  selectConversation(conversationId)
}
