import { useSyncExternalStore } from "react"
const run = { id: "refresh-run", status: "streaming", is_streaming: true, is_live: true }
export const conversation = { id: "refresh-conversation", title: "Refresh test", current_run_id: run.id, current_run: run }
let session = {
  accessToken: "fixture", currentWorkspace: null, workspaces: [], conversations: [conversation],
  currentConversationId: conversation.id, refreshConversations: async () => {},
  createConversation: async () => conversation, selectConversation: () => {}, renameConversation: async () => {},
}
const listeners = new Set<() => void>()
window.addEventListener("fixture:select", event => {
  session = { ...session, currentConversationId: (event as CustomEvent<string>).detail }
  listeners.forEach(listener => listener())
})
export function useAppSession() {
  return useSyncExternalStore(listener => { listeners.add(listener); return () => { listeners.delete(listener) } }, () => session)
}
