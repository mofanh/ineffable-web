import type { AgentDescriptorOption } from "../components/chat-composer"

type Workspace = { id: string; name: string }
type SearchPage = {
  matches: { object: { path: string; name: string; kind: string } }[]
  next_cursor?: string | null
}

/** Instance-scoped to authentication and the workspace catalog. Missing optional
 * folders are cached briefly, but transport/permission failures remain failures. */
export class AgentDescriptorDirectory {
  private cache = new Map<string, { expires: number; value: AgentDescriptorOption[] }>()
  private flights = new Map<string, Promise<AgentDescriptorOption[]>>()

  private activeSearches = 0
  private searchWaiters: (() => void)[] = []

  private search: (workspaceId: string, cursor?: string) => Promise<SearchPage>
  private isMissing: (error: unknown) => boolean
  private now: () => number

  constructor(
    search: (workspaceId: string, cursor?: string) => Promise<SearchPage>,
    isMissing: (error: unknown) => boolean,
    now: () => number = Date.now,
  ) {
    this.search = search
    this.isMissing = isMissing
    this.now = now
  }

  invalidate(workspaceId: string) {
    this.cache.delete(workspaceId)
    this.flights.delete(workspaceId)
  }

  async load(workspaces: Workspace[]) {
    const results: AgentDescriptorOption[][] = new Array(workspaces.length)
    let next = 0
    await Promise.all(Array.from({ length: Math.min(4, workspaces.length) }, async () => {
      while (next < workspaces.length) {
        const index = next++
        results[index] = await this.loadWorkspace(workspaces[index])
      }
    }))
    return results.flat()
  }

  private loadWorkspace(workspace: Workspace): Promise<AgentDescriptorOption[]> {
    const cached = this.cache.get(workspace.id)
    if (cached && cached.expires > this.now()) return Promise.resolve(cached.value)
    const previous = this.flights.get(workspace.id)
    if (previous) return previous
    const flight = this.searchAll(workspace)
    this.flights.set(workspace.id, flight)
    void flight.then(value => {
      if (this.flights.get(workspace.id) === flight) {
        this.cache.set(workspace.id, { expires: this.now() + 30_000, value })
      }
    }).catch(() => undefined).finally(() => {
      if (this.flights.get(workspace.id) === flight) this.flights.delete(workspace.id)
    })
    return flight
  }

  private async searchPage(workspaceId: string, cursor?: string) {
    if (this.activeSearches >= 4) {
      await new Promise<void>(resolve => this.searchWaiters.push(resolve))
    } else {
      this.activeSearches++
    }
    try {
      return await this.search(workspaceId, cursor)
    } finally {
      const next = this.searchWaiters.shift()
      if (next) next() // Transfer the occupied slot to the next request.
      else this.activeSearches--
    }
  }

  private async searchAll(workspace: Workspace) {
    const options: AgentDescriptorOption[] = []
    let cursor: string | undefined
    do {
      let page: SearchPage
      try {
        page = await this.searchPage(workspace.id, cursor)
      } catch (error) {
        if (this.isMissing(error)) return []
        throw error
      }
      for (const { object } of page.matches) {
        if (object.kind === "file" && object.path.startsWith("system/agents/") &&
          object.path.endsWith(".md") && !object.path.includes("..") && !object.path.includes("\\")) {
          options.push({ workspaceId: workspace.id, workspaceName: workspace.name,
            path: object.path, label: object.name || object.path })
        }
      }
      cursor = page.next_cursor ?? undefined
    } while (cursor)
    return options
  }
}
