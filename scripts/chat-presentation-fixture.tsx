import * as React from "react"
import { createRoot } from "react-dom/client"
import { MemoryRouter } from "react-router-dom"
import { TooltipProvider } from "../src/components/ui/tooltip"
import { ChatMessageList } from "../src/features/chat/components/chat-message-list"
import { ChatScrollBody } from "../src/features/chat/components/chat-scroll-body"
import { createAssistantEntry } from "../src/features/chat/model/chat-history"
import { applyTextDeltaToPane } from "../src/features/chat/chat-pane-state"
import { parseInputProgress } from "../src/features/chat/model/input-progress"
import type { ApprovalEntry, ChatEntry } from "../src/features/chat/gateway-chat-types"
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
const params = new URLSearchParams(location.search)
const approvalMode = params.has("approval")
const approval: ApprovalEntry = {
  id: "approval-entry", role: "approval", needId: "approval-need", runId: "approval-run",
  action: "Review this sensitive action.\n" + "long-command-".repeat(25),
  executionSessionId: "session-".repeat(30),
  status: (params.get("approval") || "pending") as ApprovalEntry["status"],
  error: params.get("approval") === "error" ? "Explicit approval failure" : null,
}
const recordApproval = (action: string, id: string) => window.dispatchEvent(new CustomEvent("fixture:approval", { detail: { action, id } }))
function Fixture() {
  const viewport = React.useRef<HTMLDivElement>(null)
  return <div style={{height:"100vh"}} className="flex min-w-0 flex-col">
    <button onClick={() => void i18n.changeLanguage("en-US")}>English</button>
    <div className="chat-conversation flex h-full min-h-0 flex-1 flex-col">
      <ChatScrollBody empty={false} composer={null} scrollViewportRef={viewport}
        hasOlderEntries={false} isLoadingOlderEntries={false} olderEntriesError={null}
        showScrollToBottom={false} onViewportScroll={() => {}} onViewportScrollIntent={() => {}}
        onLoadOlderConversationMessagesPage={() => {}} onScrollToBottomClick={() => {}}
        onStreamingContentProgress={() => {}}>
        <ChatMessageList entries={approvalMode ? [approval] : entries} modelDisplayNames={{"fixture-model":"Model with a very long display name for mobile"}}
      hasOlderEntries={false} isLoadingOlderEntries={false} olderEntriesError={null} isAwaitingResponse={false}
      isLoadingInitial={false}
      onStreamingContentProgress={() => {}} onApproveApproval={id => recordApproval("approve", id)} onRejectApproval={id => recordApproval("reject", id)}
      activeHumanRunId={approvalMode && params.get("scope") !== "run" ? "approval-run" : null}
      activeHumanNeedId={params.get("scope") !== "need" ? "approval-need" : "other-need"}
      activeHumanNeedKind={params.get("scope") !== "kind" ? "approval" : "user_input"} onSubmitUserInput={async () => {}} />
      </ChatScrollBody>
    </div>
  </div>
}
createRoot(document.getElementById("root")!).render(<MemoryRouter><TooltipProvider><Fixture /></TooltipProvider></MemoryRouter>)
