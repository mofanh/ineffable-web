export function shouldApplyConversationProjection(input: {
  conversationId: string
  selectedConversationId: string | null
  requestId: number | null
  latestRequestId: number
}) {
  return (
    input.requestId != null &&
    input.conversationId === input.selectedConversationId &&
    input.requestId === input.latestRequestId
  )
}
