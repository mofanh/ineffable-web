import type { ToolCallView } from "@/features/chat/chat-pane-state"
import {
  parseJsonObject,
  stringValue,
} from "@/features/chat/model/chat-parsing"
import { i18n } from "@/lib/i18n/i18n"

const TOOL_SUMMARY_MAX_LENGTH = 140

function numberValue(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null
}

function inlineSummary(value: string) {
  const normalized = value
    .replace(/\u001b\[[0-?]*[ -/]*[@-~]/g, "")
    .replace(/\s+/g, " ")
    .trim()
  if (!normalized) return null
  return normalized.length <= TOOL_SUMMARY_MAX_LENGTH
    ? normalized
    : `${normalized.slice(0, TOOL_SUMMARY_MAX_LENGTH - 1).trimEnd()}…`
}

function firstString(
  object: Record<string, unknown> | null,
  keys: readonly string[]
) {
  for (const key of keys) {
    const value = stringValue(object?.[key])
    if (value.trim()) return value
  }
  return ""
}

function toolInputSummary(tool: ToolCallView) {
  const input = parseJsonObject(tool.input)
  const structured = firstString(input, [
    "command",
    "cmd",
    "query",
    "q",
    "url",
    "path",
    "source_path",
    "environment_id",
  ])
  if (structured) return inlineSummary(structured)

  const raw = tool.input.trim()
  return raw && !raw.startsWith("{") ? inlineSummary(raw) : null
}

function toolOutputSummary(tool: ToolCallView) {
  const output = parseJsonObject(tool.output)
  const nestedResult = output?.result
  const result =
    nestedResult && typeof nestedResult === "object" && !Array.isArray(nestedResult)
      ? (nestedResult as Record<string, unknown>)
      : output
  const exitCode =
    numberValue(result?.exit_code) ?? numberValue(result?.exitCode)
  const startLine =
    numberValue(result?.start_line) ?? numberValue(result?.startLine)
  const endLine = numberValue(result?.end_line) ?? numberValue(result?.endLine)

  const statusSummary =
    exitCode !== null
      ? `${i18n.t("chat.agent.exitCode")} ${exitCode}`
      : startLine !== null && endLine !== null
        ? `${i18n.t("chat.agent.lineRange")} ${startLine}–${endLine}`
        : null
  const preferredText = firstString(
    result,
    tool.status === "failed"
      ? ["error", "failure", "reason", "message", "stderr", "output", "content"]
      : ["summary", "message", "output", "content", "stdout", "stderr"]
  )
  const textSummary = inlineSummary(
    preferredText || (output === null ? tool.output : "")
  )

  return inlineSummary(
    [statusSummary, textSummary].filter(Boolean).join(" · ")
  )
}

export function getToolCallSummary(tool: ToolCallView) {
  if (
    tool.status === "succeeded" ||
    tool.status === "failed" ||
    tool.status === "cancelled"
  ) {
    return toolOutputSummary(tool) ?? toolInputSummary(tool)
  }

  return toolInputSummary(tool)
}

function titleWithTarget(
  key: "readFile" | "writeFile" | "createFolder" | "deleteObject" | "listDirectory",
  target: string
) {
  return target
    ? i18n.t(`chat.agent.toolTitles.${key}Target`, { target })
    : i18n.t(`chat.agent.toolTitles.${key}`)
}

export function getToolCallTitle(tool: ToolCallView) {
  const input = parseJsonObject(tool.input)
  const path = stringValue(input?.path).trim()

  switch (tool.name) {
    case "read_file":
    case "workspace_read_file":
      return titleWithTarget("readFile", path)
    case "workspace_read_artifact":
      return path
        ? i18n.t("chat.agent.toolTitles.readArtifactTarget", { target: path })
        : i18n.t("chat.agent.toolTitles.readArtifact")
    case "write_file":
    case "workspace_write_file":
      return titleWithTarget("writeFile", path)
    case "workspace_create_folder":
      return titleWithTarget("createFolder", path)
    case "workspace_move_object": {
      const source = stringValue(input?.source_path).trim()
      const destination = stringValue(input?.destination_path).trim()
      return source && destination
        ? i18n.t("chat.agent.toolTitles.moveObjectTarget", {
            source,
            destination,
          })
        : i18n.t("chat.agent.toolTitles.moveObject")
    }
    case "workspace_delete_object":
      return titleWithTarget("deleteObject", path)
    case "workspace_list_spaces":
      return i18n.t("chat.agent.toolTitles.listSpaces")
    case "workspace_list_tree":
      return i18n.t("chat.agent.toolTitles.listWorkspace")
    case "workspace_list_artifacts":
      return i18n.t("chat.agent.toolTitles.listArtifacts")
    case "list_dir":
      return titleWithTarget("listDirectory", path || ".")
    case "file_exists":
      return path
        ? i18n.t("chat.agent.toolTitles.checkFileTarget", { target: path })
        : i18n.t("chat.agent.toolTitles.checkFile")
    case "apply_patch":
      return i18n.t("chat.agent.toolTitles.editFiles")
    default:
      return null
  }
}
