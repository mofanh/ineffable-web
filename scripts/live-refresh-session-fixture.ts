import { useSyncExternalStore } from "react"
const run = { id: "refresh-run", status: "streaming", is_streaming: true, is_live: true, execution_epoch: 1, accepts_guided_input: true }
export const conversation = { id: "refresh-conversation", title: "Refresh test", current_run_id: run.id, current_run: run }
let pollingList = false
const fixture = window as typeof window & { fixtureRefreshCount: number }
fixture.fixtureRefreshCount = 0
const publish = () => listeners.forEach(listener => listener())
const select = (id: string | null) => { session = { ...session, currentConversationId: id }; publish() }
const refresh = async () => {
  fixture.fixtureRefreshCount++
  if (!pollingList) return
  const { items } = await (await fetch("/gateway/conversations/list")).json()
  session = { ...session, conversations: items }
  publish()
}
let session = {
  accessToken: "fixture", currentWorkspace: null, workspaces: [], conversations: [conversation],
  currentConversationId: conversation.id as string | null, refreshConversations: refresh,
  getConversationSelectionIdentity: () => ({sessionId: undefined, version: 0}),
  createConversation: async () => conversation, selectConversation: select, renameConversation: async () => {},
}
const listeners = new Set<() => void>()
window.addEventListener("fixture:select", event => {
  select((event as CustomEvent<string | null>).detail)
})
window.addEventListener("fixture:conversations", event => {
  session = { ...session, conversations: (event as CustomEvent<typeof conversation[]>).detail }
  publish()
})
window.addEventListener("fixture:poll-list", () => { pollingList = true })
export function useAppSession() {
  return useSyncExternalStore(listener => { listeners.add(listener); return () => { listeners.delete(listener) } }, () => session)
}
