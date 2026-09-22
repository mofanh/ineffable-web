import * as React from "react"
import { createRoot } from "react-dom/client"
import { TooltipProvider } from "../src/components/ui/tooltip"
import { ChatMessageList } from "../src/features/chat/components/chat-message-list"
import type { ChatRowWindowHandle } from "../src/features/chat/components/chat-row-window"
import { createAssistantEntry } from "../src/features/chat/model/chat-history"
import type { ChatEntry } from "../src/features/chat/gateway-chat-types"
import "../src/lib/i18n/i18n"
import "../src/index.css"

const noop = () => {}
function messages(count: number): ChatEntry[] {
  return Array.from({ length: count }, (_, index) => ({ id: `input-${index}`, role: "user", content: `Message ${index}\n${"variable height line\n".repeat(index % 4)}` }))
}
function humanQuestion() {
  const entry = createAssistantEntry("done", "human-run")
  entry.id = "human-entry"
  entry.canonicalMessageSeqEnd = 1000
  entry.pane.blockOrder = Array.from({ length: 1000 }, (_, index) => `node-${index}`)
  entry.pane.blocks = Object.fromEntries(entry.pane.blockOrder.map((id, index) => [id, index === 500
    ? { id, type: "tool", toolId: "question" }
    : { id, type: "text", content: `Nested text ${index}\n${"line\n".repeat(index % 4)}` }]))
  entry.pane.tools = { question: { id: "question", protocolId: "question", needId: "need", runId: "human-run", name: "request_user_input", status: "waiting", input: JSON.stringify({ questions: [{ id: "q", question: "Keep this draft?", options: [{ label: "Keep", description: "retain" }] }] }), output: "" } }
  return entry
}
function Fixture() {
  const viewport = React.useRef<HTMLDivElement>(null)
  const windowRef = React.useRef<ChatRowWindowHandle>(null)
  const [entries, setEntries] = React.useState<ChatEntry[]>(messages(1000))
  const [human, setHuman] = React.useState(false)
  React.useEffect(() => {
    Object.assign(window, { chatWindowFixture: {
      resize(count: number) { setHuman(false); setEntries(messages(count)) },
      prepend() { setEntries((current) => [{ id: "older", role: "user", content: "Older\n".repeat(15) }, ...current]) },
      grow(key: string) { setEntries((current) => current.map((entry) => entry.id === key && entry.role === "user" ? { ...entry, content: `${entry.content}\n${"image-sized late content\n".repeat(20)}` } : entry)) },
      restore(key: string, top: number, child?: { key: string; top: number }) { windowRef.current?.restoreAnchor(key, top, child) },
      human() { setHuman(true); setEntries([...messages(80), humanQuestion(), ...messages(80).map((entry) => ({ ...entry, id: `after-${entry.id}` }))]) },
    } })
  }, [])
  return <div style={{ height: 700, width: 850 }}>
    <ChatMessageList entries={entries} rowWindowRef={windowRef} hasOlderEntries={false} isLoadingOlderEntries={false}
      olderEntriesError={null} isAwaitingResponse={false} isLoadingInitial={false} showScrollToBottom={false}
      scrollViewportRef={viewport} onViewportScroll={noop} onLoadOlderConversationMessagesPage={noop}
      onScrollToBottomClick={noop} onStreamingContentProgress={noop} onApproveApproval={noop} onRejectApproval={noop}
      activeHumanRunId={human ? "human-run" : null} activeHumanNeedId={human ? "need" : null}
      onSubmitUserInput={async () => {}} isFullScreen />
  </div>
}
createRoot(document.getElementById("root")!).render(<TooltipProvider><Fixture /></TooltipProvider>)
