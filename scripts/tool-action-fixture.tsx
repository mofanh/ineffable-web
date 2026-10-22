import * as React from "react"
import { createRoot } from "react-dom/client"
import { MemoryRouter } from "react-router-dom"
import { TooltipProvider } from "../src/components/ui/tooltip"
import { WebNodeList } from "../src/features/chat/components/agent-pane"
import { projectConversationOutputEvent } from "../src/features/chat/runtime/conversation-event-projector"
import { mapConversationMessagesToEntries } from "../src/features/chat/model/chat-history"
import type { AssistantEntry } from "../src/features/chat/gateway-chat-types"
import { i18n } from "../src/lib/i18n/i18n"
import "../src/index.css"

const samples = [
  { id: "command", name: "exec_command", args: { command: "npm run build", cwd: "/project" }, result: { session_id: "build-session", command: "npm run build", cwd: "/project", status: "exited", exit_code: 0, stdout: '<a href="x">RAW_HTML_OUTPUT</a>\nBUILD COMPLETE', truncated: true } },
  { id: "poll", name: "terminal", args: { command: "read", session_id: "build-session" }, result: { session_id: "build-session", command: "cargo test", cwd: "/project", status: "running", exit_code: null, stdout: "PARTIAL_OUTPUT" } },
  { id: "input", name: "terminal", args: { command: "input", session_id: "build-session", chars: "hello\n" }, result: { session_id: "build-session", command: "cat", status: "running" } },
  { id: "stop", name: "terminal", args: { command: "stop", session_id: "build-session" }, result: { session_id: "build-session", command: "sleep 100", status: "interrupted", exit_code: null } },
  { id: "read", name: "workspace", args: { command: "read", path: "system/memory/project.md" }, result: { window: { start_line: 1, end_line: 100, next_offset: 101 }, content: "PRIVATE_FILE_BODY" } },
  { id: "search", name: "workspace", args: { command: "search", query: "transform", path: "src" }, result: { matches: ["a", "b"], next_cursor: "page-two" } },
  { id: "edit", name: "workspace", args: { command: "edit", path: "notes/very-long-file-name-that-should-stay-inside-the-mobile-tool-row.md", old_text: "old", new_text: "new" }, result: { version_no: 3 } },
  { id: "patch", name: "apply_patch", args: { input: "*** Begin Patch\n*** Update File: src/app.ts\n@@\n-old\n+new\n*** End Patch" }, result: "Updated src/app.ts" },
  { id: "navigation", name: "tools", args: { command: "call", name: "terminal.read", arguments: { session_id: "build-session" } }, result: { name: "terminal.read", result: { session_id: "build-session", command: "npm test", cwd: "/project", status: "exited", exit_code: 2, failure_reason: "TEST_FAILURE", stdout: "FAILURE_DETAILS" } } },
  { id: "unknown", name: "plugin.inspect", args: { query: "find docs" }, result: "UNKNOWN_RAW_OUTPUT" },
  { id: "failure", name: "exec_command", args: { command: "cat private.txt" }, result: { error: "PERMISSION_DENIED" }, failed: true },
]

function liveEntry(settled: boolean, base?: AssistantEntry) {
  let entry = base
  let seq = base ? 100 : 0
  for (const sample of samples) {
    const metadata = { tool_call_id: sample.id, tool_name: sample.name, full_arguments: JSON.stringify(sample.args) }
    const event = (kind: string, content: string | null, extra = {}) => ({ event: kind, version: 1, seq: ++seq, conversation_id: "tool-fixture", run_id: "tool-run", content, metadata: { ...metadata, ...extra } })
    if (!base) entry = projectConversationOutputEvent(entry, event("tool.call.completed", null), "tool-run")
    if (settled) entry = projectConversationOutputEvent(entry, event("tool.result", typeof sample.result === "string" ? sample.result : JSON.stringify(sample.result), { status: sample.failed ? "failed" : "succeeded" }), "tool-run")
  }
  return entry!
}

function historyEntry() {
  const records = samples.flatMap((sample, index) => {
    const base = { conversation_id: "tool-fixture", run_id: "tool-run", created_at: `2026-10-22T00:00:${String(index).padStart(2, "0")}Z`, updated_at: "2026-10-22T00:00:20Z" }
    const metadata = { scope: "main", tool_call_id: sample.id, tool_name: sample.name, full_arguments: JSON.stringify(sample.args) }
    return [
      { ...base, id: `${sample.id}-call`, role: "assistant", message_type: "tool_call", content: "", metadata_json: metadata },
      { ...base, id: `${sample.id}-result`, role: "tool", message_type: "tool_result", content: typeof sample.result === "string" ? sample.result : JSON.stringify(sample.result), metadata_json: { ...metadata, status: sample.failed ? "failed" : "succeeded" } },
    ]
  })
  return mapConversationMessagesToEntries(records).find(entry => entry.role === "assistant") as AssistantEntry
}

function Fixture() {
  const [mode, setMode] = React.useState("running")
  const [initial] = React.useState(() => liveEntry(false))
  const entry = React.useMemo(() => mode === "history" ? historyEntry() : mode === "settled" ? liveEntry(true, initial) : initial, [mode, initial])
  return <div className="mx-auto max-w-4xl p-4">
    <div className="mb-6 flex flex-wrap gap-3">
      {["running", "settled", "history"].map(value => <button key={value} onClick={() => setMode(value)}>{value}</button>)}
      <button onClick={() => void i18n.changeLanguage("en-US")}>English</button>
      <button onClick={() => void i18n.changeLanguage("zh-CN")}>中文</button>
      <button onClick={() => document.documentElement.classList.toggle("dark")}>theme</button>
    </div>
    <WebNodeList pane={entry.pane} isStreaming={mode === "running"} />
  </div>
}
createRoot(document.getElementById("root")!).render(<MemoryRouter><TooltipProvider><Fixture /></TooltipProvider></MemoryRouter>)
