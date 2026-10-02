import { createWorkspaceFile, createWorkspaceFolder, statWorkspacePath } from "@/lib/api/api-client"
import { dispatchWorkspaceObjectsChanged } from "@/lib/workspace-events"

// Only called by the user's explicit template action. Existing rules are reused,
// never overwritten; notes remain ordinary files created on demand by the agent.
export async function prepareWorkspaceRule(token: string, workspaceId: string, content: string) {
  let parentId: string | undefined
  let path = ""
  for (const name of ["system", "rules"]) {
    path = path ? `${path}/${name}` : name
    let { object } = await statWorkspacePath(token, workspaceId, path)
    if (!object) {
      try { object = (await createWorkspaceFolder(token, workspaceId, { name, parent_id: parentId })).object }
      catch (error) {
        // A concurrent create or lost response can leave the canonical object present.
        object = (await statWorkspacePath(token, workspaceId, path)).object
        if (!object) throw error
      }
    }
    if (object.kind !== "folder") throw new Error(`Expected a folder: ${path}`)
    parentId = object.id
  }
  const rulePath = `${path}/default.md`
  let { object } = await statWorkspacePath(token, workspaceId, rulePath)
  if (!object) {
    try { object = (await createWorkspaceFile(token, workspaceId, { name: "default.md", parent_id: parentId, mime_type: "text/markdown", content })).object }
    catch (error) {
      object = (await statWorkspacePath(token, workspaceId, rulePath)).object
      if (!object) throw error
    }
  }
  if (object.kind !== "file" || !object.current_version_id) throw new Error(`Expected a file: ${rulePath}`)
  dispatchWorkspaceObjectsChanged({ workspaceId, objectId: object.id, path: object.path, action: "create_file", source: "user" })
  return object
}
