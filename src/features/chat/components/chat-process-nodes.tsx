import * as React from "react"
import type { AssistantEntry } from "../gateway-chat-types"
import type { WebNodeView } from "../web-node"
import { projectAssistantProcessLayout, type AssistantProcessGroup } from "../model/assistant-process"
import { ChatProcessButton, useChatProcessDisclosures, useProcessConsolidation } from "./chat-process"
import { ChatRowWindow } from "./chat-row-window"

type Row = { key: string; node: WebNodeView } | { key: string; group: AssistantProcessGroup }
const rowKey = (row: Row) => row.key
const estimateRow = (row: Row) => "group" in row ? 32 : 120

/** One ordered window for nodes and their disclosure controls. Expanding keeps
 * original node identity/order and never remounts a second renderer hierarchy. */
export function ChatProcessNodes({ entry, nodes, eligible, forceOpen, duration, pinnedKeys, activeNeedId, children }: {
  entry: AssistantEntry
  nodes: WebNodeView[]
  eligible: (node: WebNodeView) => boolean
  forceOpen: boolean
  duration: string | null
  pinnedKeys: string[]
  activeNeedId?: string | null
  children: (node: WebNodeView) => React.ReactNode
}) {
  const requested = React.useMemo(() => projectAssistantProcessLayout(entry, nodes, eligible, activeNeedId), [entry, nodes, eligible, activeNeedId])
  const rootRef = React.useRef<HTMLDivElement>(null)
  const consolidate = useProcessConsolidation(requested.consolidated, rootRef)
  const layout = React.useMemo(() => requested.consolidated && !consolidate
    ? projectAssistantProcessLayout(entry, nodes, eligible, activeNeedId, false) : requested,
  [entry, nodes, eligible, activeNeedId, requested, consolidate])
  const { isExpanded, toggle } = useChatProcessDisclosures(layout.groups, forceOpen, rootRef)
  const [focusedRow, setFocusedRow] = React.useState<string | null>(null)
  const controls = React.useId()
  const inserted = new Set<string>()
  const rows: Row[] = []
  for (const node of nodes) {
    const group = layout.membership.get(node.nodeId)
    if (group && !inserted.has(group.id)) {
      inserted.add(group.id)
      rows.push({ key: group.id, group })
    }
    if (!group || isExpanded(group)) rows.push({ key: node.nodeId, node })
  }
  const pinned = focusedRow ? [...pinnedKeys, focusedRow] : pinnedKeys
  return <div ref={rootRef} className="text-sm"
    data-chat-process-mode={layout.consolidated ? "completed" : "stages"}
    data-chat-process-expanded={layout.groups.length ? layout.groups.some(isExpanded) : undefined}
    onFocusCapture={event => {
      const row = event.target.closest<HTMLElement>("[data-chat-row-key]")
      setFocusedRow(row?.getAttribute("data-chat-row-key") ?? null)
    }}
    onBlurCapture={event => { if (!event.currentTarget.contains(event.relatedTarget)) setFocusedRow(null) }}>
    <div id={controls}>
      <ChatRowWindow nested items={rows} getKey={rowKey} estimateSize={estimateRow} gap={12} pinnedKeys={pinned}>
        {row => "node" in row ? children(row.node) : <div data-chat-row-key={row.key} data-process-group={row.key}>
          <ChatProcessButton expanded={isExpanded(row.group)} disabled={forceOpen} controls={controls}
            duration={layout.consolidated ? duration : null} onToggle={event => toggle(row.group, event.currentTarget)} />
        </div>}
      </ChatRowWindow>
    </div>
  </div>
}
