import * as React from "react"
import { searchWorkspacePaths } from "@/features/workspace/api/workspace-api"
import { normalizeAppError } from "@/lib/app/api-errors"
import { WORKSPACE_OBJECTS_CHANGED_EVENT, type WorkspaceObjectsChangedEvent } from "@/lib/workspace-events"
import { AgentDescriptorDirectory, AgentDescriptorSearchBudget } from "./agent-descriptor-directory"
import type { AgentDescriptorOption } from "../components/chat-composer"

export function useAgentDescriptors(accessToken: string | null | undefined, workspaces: { id: string; name: string }[]) {
  const [budget] = React.useState(() => new AgentDescriptorSearchBudget())
  const [open, setOpen] = React.useState(false)
  const [revision, refresh] = React.useReducer(value => value + 1, 0)
  const workspaceKey = JSON.stringify(workspaces.map(({ id, name }) => ({ id, name })).sort((a, b) => a.id.localeCompare(b.id)))
  const { catalog, directory } = React.useMemo(() => ({
    catalog: JSON.parse(workspaceKey) as { id: string; name: string }[],
    directory: new AgentDescriptorDirectory(
      (id, cursor) => searchWorkspacePaths(accessToken!, id, "system/agents", ".md", cursor),
      error => normalizeAppError(error).kind === "not_found",
      Date.now, budget,
    ),
  }), [accessToken, workspaceKey, budget])
  const [result, setResult] = React.useState<{
    directory: AgentDescriptorDirectory; catalog: typeof catalog;
    options: AgentDescriptorOption[]; loading: boolean; error: string | null
  } | null>(null)

  React.useEffect(() => {
    const changed = (event: Event) => {
      directory.invalidate((event as WorkspaceObjectsChangedEvent).detail.workspaceId)
      refresh()
    }
    window.addEventListener(WORKSPACE_OBJECTS_CHANGED_EVENT, changed)
    return () => window.removeEventListener(WORKSPACE_OBJECTS_CHANGED_EVENT, changed)
  }, [directory])

  React.useEffect(() => {
    if (!open || !accessToken) return
    let cancelled = false
    setResult({ directory, catalog, options: [], loading: true, error: null })
    void directory.load(catalog).then(options => {
      if (!cancelled) setResult({ directory, catalog, options, loading: false, error: null })
    }).catch(error => {
      if (!cancelled) setResult({ directory, catalog, options: [], loading: false, error: normalizeAppError(error).message })
    })
    return () => { cancelled = true }
  }, [open, accessToken, directory, catalog, revision])

  const current = result?.directory === directory && result.catalog === catalog ? result : null
  return { options: current?.options ?? [], loading: open && (!current || current.loading),
    error: current?.error ?? null, setOpen, refresh }
}
