import type { ToolCallView } from "@/features/chat/chat-pane-state"
import { objectValue, parseJsonObject, stringValue } from "./chat-parsing"
import { parseLeadingJsonObject } from "./leading-json-object"
import { i18n } from "@/lib/i18n/i18n"

type JsonObject = Record<string, unknown>
type ResultKind = "terminal" | "read" | "write" | "list" | "search" | "stat"
type Action = { title: string; target?: string; resultKind?: ResultKind }

const TOOL_SUMMARY_MAX_LENGTH = 140
const ANSI_ESCAPE_SEQUENCE = new RegExp(
  `${String.fromCharCode(27)}\\[[0-?]*[ -/]*[@-~]`, "g"
)

function inlineSummary(value: string) {
  const normalized = value.replace(ANSI_ESCAPE_SEQUENCE, "").replace(/\s+/g, " ").trim()
  if (!normalized) return null
  return normalized.length <= TOOL_SUMMARY_MAX_LENGTH
    ? normalized
    : `${normalized.slice(0, TOOL_SUMMARY_MAX_LENGTH - 1).trimEnd()}…`
}

function firstString(object: JsonObject | null, keys: readonly string[]) {
  for (const key of keys) {
    const value = stringValue(object?.[key])
    if (value.trim()) return value
  }
  return ""
}

function integer(value: unknown) {
  return typeof value === "number" && Number.isSafeInteger(value) ? value : null
}

function unwrapResult(output: string): { result: unknown; text: string } {
  const parsed = parseLeadingJsonObject(output)
  if (!parsed) {
    // Workspace spaces is an array, unlike other operation result objects.
    try { return { result: JSON.parse(output), text: "" } }
    catch { return { result: null, text: output } }
  }
  const nested = parsed.result
  if (typeof nested === "string") {
    return { result: parseLeadingJsonObject(nested), text: nested }
  }
  return { result: nested ?? parsed, text: "" }
}

// Display projection only: this never resolves aliases or executes a tool.
// Current qualified operations work in direct and tools.call records alike.
function invocation(tool: ToolCallView) {
  let name = tool.name
  let input = parseJsonObject(tool.input)
  if (name === "tools" && input?.command === "call" && stringValue(input.name)) {
    name = stringValue(input.name)
    input = objectValue(input.arguments)
  }
  const command = stringValue(input?.command).trim()
  const key = ["workspace", "terminal", "tools"].includes(name) && command
    ? `${name}.${command}` : name
  return { name, key, input, ...unwrapResult(tool.output) }
}

function actionFor(key: string, input: JsonObject | null): Action | null {
  const target = firstString(input, ["path", "reference"])
  const session = stringValue(input?.session_id)
  const searchTarget = [firstString(input, ["query", "pattern"]), target].filter(Boolean).join(" · ")
  switch (key) {
    case "read_file":
    case "workspace.read":
      return { title: i18n.t("chat.agent.toolTitles.readFile"), target, resultKind: "read" }
    case "write_file":
    case "workspace.write":
      return { title: i18n.t("chat.agent.toolTitles.writeFile"), target, resultKind: "write" }
    case "workspace.edit":
      return { title: i18n.t("chat.agent.toolTitles.editFiles"), target, resultKind: "write" }
    case "workspace.mkdir":
      return { title: i18n.t("chat.agent.toolTitles.createFolder"), target }
    case "workspace.remove":
      return { title: i18n.t("chat.agent.toolTitles.deleteObject"), target }
    case "workspace.move":
      return {
        title: i18n.t("chat.agent.toolTitles.moveObject"),
        target: [stringValue(input?.source_path), stringValue(input?.destination_path)].filter(Boolean).join(" → "),
      }
    case "workspace.spaces":
      return { title: i18n.t("chat.agent.toolTitles.listSpaces"), resultKind: "list" }
    case "workspace.list":
    case "list_dir":
      return { title: i18n.t("chat.agent.toolTitles.listDirectory"), target: target || (key === "list_dir" ? "." : "/"), resultKind: "list" }
    case "workspace.stat":
    case "file_exists":
      return { title: i18n.t("chat.agent.toolTitles.checkFile"), target, resultKind: "stat" }
    case "workspace.search":
    case "grep":
      return { title: i18n.t("chat.agent.toolTitles.searchFiles"), target: searchTarget, resultKind: "search" }
    case "apply_patch":
      return {
        title: i18n.t("chat.agent.toolTitles.editFiles"),
        target: Array.from(stringValue(input?.input).matchAll(/^\*\*\* (?:Add|Update|Delete) File: (.+)$/gm), match => match[1]).join(", "),
      }
    case "exec_command":
      return { title: i18n.t("chat.agent.toolTitles.executeCommand"), target: stringValue(input?.command), resultKind: "terminal" }
    case "terminal.read":
      return { title: i18n.t("chat.agent.toolTitles.readTerminal"), target: session, resultKind: "terminal" }
    case "terminal.input":
      return {
        title: typeof input?.chars === "string" && input.chars.length === 0
          ? i18n.t("chat.agent.toolTitles.waitTerminal") : i18n.t("chat.agent.toolTitles.inputTerminal"),
        target: session, resultKind: "terminal",
      }
    case "terminal.stop":
      return { title: i18n.t("chat.agent.toolTitles.stopTerminal"), target: session, resultKind: "terminal" }
    case "terminal.list":
      return { title: i18n.t("chat.agent.toolTitles.listTerminals"), resultKind: "list" }
    case "tools.list":
    case "tools.providers":
      return { title: i18n.t("chat.agent.toolTitles.listTools"), target: firstString(input, ["group", "provider_id"]), resultKind: "list" }
    case "tools.search":
      return { title: i18n.t("chat.agent.toolTitles.searchTools"), target: stringValue(input?.query), resultKind: "search" }
    case "tools.help":
      return { title: i18n.t("chat.agent.toolTitles.toolHelp"), target: stringValue(input?.name) }
    case "tools.remove":
      return { title: i18n.t("chat.agent.toolTitles.removeTools"), target: Array.isArray(input?.names) ? input.names.filter(name => typeof name === "string").join(", ") : "" }
    default:
      return null
  }
}

function genericInputSummary(tool: ToolCallView, input: JsonObject | null) {
  const operation = firstString(input, ["command", "cmd"])
  const target = firstString(input, ["query", "pattern", "url", "path", "source_path", "name", "environment_id", "target", "conversation_id"])
  const structured = [operation, target === operation ? "" : target].filter(Boolean).join(" · ")
  if (structured) return inlineSummary(structured)
  const raw = tool.input.trim()
  return !input && raw && !raw.startsWith("{") ? inlineSummary(raw) : null
}

function resultSummary(kind: ResultKind | undefined, result: JsonObject | null, rawResult: unknown) {
  const parts: string[] = []
  if (kind === "terminal") {
    const exitCode = integer(result?.exit_code)
    const status = stringValue(result?.status)
    if (status === "running") parts.push(i18n.t("chat.agent.terminalRunning"))
    else if (exitCode !== null) parts.push(`${i18n.t("chat.agent.exitCode")} ${exitCode}`)
    else if (status === "exited") parts.push(i18n.t("chat.agent.toolResults.missingExitCode"))
    if (status === "failed") parts.push(i18n.t("chat.agent.failed"))
    if (status === "timed_out") parts.push(i18n.t("chat.agent.terminalTimedOut"))
    if (status === "interrupted") parts.push(i18n.t("chat.agent.terminalInterrupted"))
    const failure = firstString(result, ["failure_reason", "error"])
    if (failure) parts.push(failure)
  }
  if (kind === "read") {
    const window = objectValue(result?.window) ?? result
    const start = integer(window?.start_line)
    const end = integer(window?.end_line)
    if (start !== null && end !== null && start >= 1 && end >= start) {
      parts.push(`${i18n.t("chat.agent.lineRange")} ${start}–${end}`)
    }
  }
  if (kind === "write") {
    const version = integer(result?.version_no)
    if (version !== null && version >= 1) parts.push(i18n.t("chat.agent.toolResults.version", { version }))
  }
  if (kind === "stat" && typeof result?.exists === "boolean") {
    parts.push(i18n.t(result.exists ? "chat.agent.toolResults.exists" : "chat.agent.toolResults.absent"))
  }
  if (kind === "list" || kind === "search") {
    const items = Array.isArray(rawResult) ? rawResult : result?.matches ?? result?.entries ?? result?.sessions
    if (Array.isArray(items)) parts.push(i18n.t("chat.agent.toolResults.returnedItems", { count: items.length }))
  }
  const window = objectValue(result?.window)
  if (result?.truncated === true || window?.truncated === true) parts.push(i18n.t("chat.agent.toolResults.truncated"))
  if (result?.next_cursor || window?.next_offset) parts.push(i18n.t("chat.agent.toolResults.more"))
  return inlineSummary(parts.join(" · "))
}

export function getToolCallPresentation(tool: ToolCallView) {
  const { name, key, input, result: rawResult, text } = invocation(tool)
  const result = objectValue(rawResult)
  const action = actionFor(key, input)
  // Polls have only a handle in args. The returned command enriches the target;
  // captured stdout never replaces either the target or the original action.
  const target = inlineSummary(
    action?.resultKind === "terminal" && key !== "exec_command"
      ? stringValue(result?.command) || action.target || "" : action?.target || ""
  )
  const title = action
    ? target ? i18n.t("chat.agent.toolTitles.actionTarget", { action: action.title, target }) : action.title
    : name
  const settled = ["succeeded", "failed", "cancelled"].includes(tool.status)
  const failed = tool.status === "failed" || tool.status === "cancelled"
  const error = failed
    ? inlineSummary(firstString(result, ["error", "failure_reason", "failure", "reason", "message"]) || text) : null
  const outcome = settled ? resultSummary(action?.resultKind, result, rawResult) : null
  const fallback = action ? null : genericInputSummary(tool, input)
  const summary = inlineSummary([fallback, error || outcome].filter(Boolean).join(" · "))
  const commandFailed = action?.resultKind === "terminal" && settled && (
    ["failed", "timed_out", "interrupted"].includes(stringValue(result?.status)) ||
    (integer(result?.exit_code) !== null && result?.exit_code !== 0)
  )
  return {
    title,
    summary,
    summaryTone: failed || commandFailed ? "error" as const : undefined,
    // A successful observation is not a successful process exit.
    statusLabel: tool.status === "succeeded" && action?.resultKind === "terminal"
      ? i18n.t("chat.agent.toolResults.returned") : undefined,
    terminalResult: action?.resultKind === "terminal" || key === "terminal.list" ? result : null,
  }
}

export function getToolCallSummary(tool: ToolCallView) {
  return getToolCallPresentation(tool).summary
}

export function getToolCallTitle(tool: ToolCallView) {
  return getToolCallPresentation(tool).title
}
