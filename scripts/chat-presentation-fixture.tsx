import * as React from "react"
import { createRoot } from "react-dom/client"
import { MemoryRouter } from "react-router-dom"
import { TooltipProvider } from "../src/components/ui/tooltip"
import { ChatMessageList } from "../src/features/chat/components/chat-message-list"
import { createAssistantEntry } from "../src/features/chat/model/chat-history"
import { applyTextDeltaToPane } from "../src/features/chat/chat-pane-state"
import { parseInputProgress } from "../src/features/chat/model/input-progress"
import type { ChatEntry } from "../src/features/chat/gateway-chat-types"
import { i18n } from "../src/lib/i18n/i18n"
import "../src/index.css"

const instructions = "[Automation Triggered: 每日整理]\n\n原始整理指令：保留来源，勿修改记录。"
const assistant = createAssistantEntry("done", "presentation-run")
assistant.pane = applyTextDeltaToPane(assistant.pane, "整理完成。\n\n```js\nconsole.log('hello')\n```")
Object.assign(assistant, {
  modelProfileId: "fixture-model", agentId: "default", definitionFingerprint: "sha256:1234567890abcdef",
  sandboxEnvironmentId: "sandbox", runDurationMs: 12345, runCompletedAt: "2026-09-20T01:02:00Z",
  capabilityExposure: { mode: "smart", finalExposedCount: 4 },
})
assistant.pane.blocks.artifact = { id: "artifact", type: "tool", toolId: "artifact" }
assistant.pane.blockOrder.push("artifact")
assistant.pane.tools.artifact = { id: "artifact", name: "workspace_write_file", input: "{}", status: "succeeded", output: JSON.stringify({workspace_id:"workspace",object_id:"object",path:"notes/整理.md",mime_type:"text/markdown",version_id:"version-secret-hash",size_bytes:2048}) }
const entries: ChatEntry[] = [
  { id: "message:automated", role: "user", content: instructions, inputProgress: parseInputProgress({ message_id:"automated", conversation_id:"fixture", kind:"pre_input", phase:"accepted", run_state:"completed", automation_source:{automation_id:"automation",occurrence_id:"occurrence",name:"每日整理",summary:"整理昨天的会话"} }) },
  assistant,
  { id: "message:ordinary", role: "user", content: instructions },
]
function Fixture() {
  const viewport = React.useRef<HTMLDivElement>(null)
  return <div style={{height:"100vh"}} className="flex min-w-0 flex-col">
    <button onClick={() => void i18n.changeLanguage("en-US")}>English</button>
    <ChatMessageList entries={entries} modelDisplayNames={{"fixture-model":"Model with a very long display name for mobile"}}
      hasOlderEntries={false} isLoadingOlderEntries={false} olderEntriesError={null} isAwaitingResponse={false}
      isLoadingInitial={false} showScrollToBottom={false} scrollViewportRef={viewport}
      onViewportScroll={() => {}} onLoadOlderConversationMessagesPage={() => {}} onScrollToBottomClick={() => {}}
      onStreamingContentProgress={() => {}} onApproveApproval={() => {}} onRejectApproval={() => {}}
      activeHumanRunId={null} onSubmitUserInput={async () => {}} isFullScreen />
  </div>
}
createRoot(document.getElementById("root")!).render(<MemoryRouter><TooltipProvider><Fixture /></TooltipProvider></MemoryRouter>)
