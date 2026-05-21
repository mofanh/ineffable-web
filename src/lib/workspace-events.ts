export const WORKSPACE_OBJECTS_CHANGED_EVENT = "ineffable:workspace-objects-changed"

export type WorkspaceObjectsChangedDetail = {
  workspaceId: string
  objectId?: string | null
  path?: string | null
  action:
    | "create_file"
    | "create_folder"
    | "write_file"
    | "restore_file"
    | "rename_move"
    | "delete"
  versionId?: string | null
  source?: "agent" | "user" | "system"
}

export type WorkspaceObjectsChangedEvent = CustomEvent<WorkspaceObjectsChangedDetail>

export function dispatchWorkspaceObjectsChanged(detail: WorkspaceObjectsChangedDetail) {
  if (typeof window === "undefined" || !detail.workspaceId) {
    return
  }

  window.dispatchEvent(
    new CustomEvent(WORKSPACE_OBJECTS_CHANGED_EVENT, {
      detail,
    })
  )
}
