const run = { id: "refresh-run", status: "streaming", is_streaming: true, is_live: true }
export const conversation = { id: "refresh-conversation", title: "Refresh test", current_run_id: run.id, current_run: run }
const session = {
  accessToken: "fixture", currentWorkspace: null, workspaces: [], conversations: [conversation],
  currentConversationId: conversation.id, refreshConversations: async () => {},
  createConversation: async () => conversation, selectConversation: () => {}, renameConversation: async () => {},
}
export function useAppSession() { return session }
