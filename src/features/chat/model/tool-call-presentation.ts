import type { ToolCallView } from "@/features/chat/chat-pane-state"
import {
  parseJsonObject,
  stringValue,
} from "@/features/chat/model/chat-parsing"
import { i18n } from "@/lib/i18n/i18n"

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
