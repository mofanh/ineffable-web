import type { Workspace, WorkspaceObject } from "@/lib/api/gateway-client"

export type SidebarEntry = {
  id: string
  title: string
  kind: "folder" | "markdown" | "html" | "text"
  workspaceId?: string
  object?: WorkspaceObject
  isWorkspaceRoot?: boolean
  depth?: number
  expanded?: boolean
  accent?: "team" | "file" | "html"
}

export type WorkspaceTreeMap = Record<string, WorkspaceObject[]>

export function getWorkspaceType(workspace: Workspace) {
  return workspace.workspace_type || "team"
}

function getObjectEntryKind(object: WorkspaceObject): SidebarEntry["kind"] {
  if (object.kind === "folder") {
    return "folder"
  }

  const lowerName = object.name.toLowerCase()
  if (lowerName.endsWith(".html") || lowerName.endsWith(".htm")) {
    return "html"
  }
  if (lowerName.endsWith(".md") || lowerName.endsWith(".markdown")) {
    return "markdown"
  }

  return "text"
}

function buildObjectEntries(
  workspaceId: string,
  objects: WorkspaceObject[],
  baseDepth = 0
) {
  const byParent = new Map<string, WorkspaceObject[]>()

  for (const object of objects) {
    const parentKey = object.parent_id || "root"
    const siblings = byParent.get(parentKey) ?? []
    siblings.push(object)
    byParent.set(parentKey, siblings)
  }

  for (const siblings of byParent.values()) {
    siblings.sort((left, right) => {
      if (left.kind !== right.kind) {
        return left.kind === "folder" ? -1 : 1
      }

      return left.name.localeCompare(right.name)
    })
  }

  const entries: SidebarEntry[] = []
  const visit = (parentKey: string, depth: number) => {
    const children = byParent.get(parentKey) ?? []

    for (const child of children) {
      entries.push({
        id: child.id,
        title: child.name,
        kind: getObjectEntryKind(child),
        workspaceId,
        object: child,
        depth,
        expanded: child.kind === "folder",
      })

      if (child.kind === "folder") {
        visit(child.id, depth + 1)
      }
    }
  }

  visit("root", baseDepth)
  return entries
}

export function buildWorkspaceEntries(
  workspace: Workspace,
  objects: WorkspaceObject[],
  options?: { includeRoot?: boolean; rootAccent?: SidebarEntry["accent"] }
) {
  const objectEntries = buildObjectEntries(
    workspace.id,
    objects,
    options?.includeRoot ? 1 : 0
  )

  if (!options?.includeRoot) {
    return objectEntries
  }

  return [
    {
      id: `workspace:${workspace.id}`,
      title: workspace.name,
      kind: "folder" as const,
      workspaceId: workspace.id,
      isWorkspaceRoot: true,
      expanded: true,
      accent: options.rootAccent,
    },
    ...objectEntries,
  ]
}

export function getCopyName(name: string) {
  const dotIndex = name.lastIndexOf(".")
  if (dotIndex > 0) {
    return `${name.slice(0, dotIndex)} copy${name.slice(dotIndex)}`
  }

  return `${name} copy`
}

export function getUniqueName(
  objects: WorkspaceObject[],
  parentId: string | null | undefined,
  preferredName: string
) {
  const siblings = new Set(
    objects
      .filter((object) => (object.parent_id || null) === (parentId || null))
      .map((object) => object.name.toLowerCase())
  )

  if (!siblings.has(preferredName.toLowerCase())) {
    return preferredName
  }

  const dotIndex = preferredName.lastIndexOf(".")
  const stem = dotIndex > 0 ? preferredName.slice(0, dotIndex) : preferredName
  const ext = dotIndex > 0 ? preferredName.slice(dotIndex) : ""

  for (let index = 2; index < 1000; index += 1) {
    const candidate = `${stem} ${index}${ext}`
    if (!siblings.has(candidate.toLowerCase())) {
      return candidate
    }
  }

  return `${stem} ${Date.now()}${ext}`
}
