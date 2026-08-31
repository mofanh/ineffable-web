import * as React from "react"
import { createRoot } from "react-dom/client"

import { WebNodeList } from "../src/features/chat/components/agent-pane"
import { ChatMessageList } from "../src/features/chat/components/chat-message-list"
import { reduceConversationTimeline } from "../src/features/chat/model/conversation-entry-reconciliation"
import "../src/index.css"

const pane = {
  blockOrder: Array.from({ length: 1_000 }, (_, index) => `row-${index}`),
  blocks: Object.fromEntries(
    Array.from({ length: 1_000 }, (_, index) => [
      `row-${index}`,
      {
        id: `row-${index}`,
        type: "text",
        content: Array.from(
          { length: (index % 7) + 1 },
          (_, line) => `row ${index} line ${line}`
        ).join("\n"),
      },
    ])
  ),
  tools: {},
  activeThinkBlockId: null,
  activeThinkMode: null,
  pendingTagBuffer: "",
  receivedTextDelta: false,
}

const terminalRunId = "terminal-layout-run"
const terminalPane = {
  blockOrder: ["terminal-reasoning", "terminal-tool", "terminal-text"],
  blocks: {
    "terminal-reasoning": {
      id: "terminal-reasoning",
      type: "think" as const,
      content: "checking the directory",
      open: false,
    },
    "terminal-tool": {
      id: "terminal-tool",
      type: "tool" as const,
      toolId: "terminal-tool-call",
    },
    "terminal-text": {
      id: "terminal-text",
      type: "text" as const,
      content: "final answer",
    },
  },
  tools: {
    "terminal-tool-call": {
      id: "terminal-tool-call",
      name: "read_file",
      input: "{}",
      output: "ok",
      status: "succeeded" as const,
    },
  },
  activeThinkBlockId: null,
  activeThinkMode: null,
  pendingTagBuffer: "",
  receivedTextDelta: true,
}

declare global {
  interface Window {
    chatVirtualizationFixture: {
      scrollTo: (offset: number) => Promise<void>
      prepend: () => Promise<void>
      visibleAnchor: () => { key: string; top: number } | null
      materializedRows: () => number
      hasAbsoluteRows: () => boolean
      settleTerminal: () => Promise<void>
      terminalLayout: () => Array<{ role: string; top: number; bottom: number }>
    }
  }
}

function afterLayout() {
  return new Promise<void>((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
  })
}

function Fixture() {
  const viewportRef = React.useRef<HTMLDivElement | null>(null)
  const terminalViewportRef = React.useRef<HTMLDivElement | null>(null)
  const pendingPrependRef = React.useRef<{
    scrollHeight: number
    scrollTop: number
    resolve: () => void
  } | null>(null)
  const [prependEpoch, setPrependEpoch] = React.useState(0)
  const [terminalEntries, setTerminalEntries] = React.useState(() => [
    {
      id: "message:terminal-trigger",
      role: "user" as const,
      content: "查看当前目录",
      timelineUnitId: "message:terminal-trigger",
    },
    {
      id: "assistant-terminal-live",
      role: "assistant" as const,
      runId: terminalRunId,
      status: "streaming" as const,
      pane: terminalPane,
      subagentOrder: [],
      subagents: {},
    },
  ])

  React.useLayoutEffect(() => {
    const viewport = viewportRef.current
    const pending = pendingPrependRef.current
    if (!viewport || !pending) return
    viewport.scrollTop =
      pending.scrollTop + Math.max(0, viewport.scrollHeight - pending.scrollHeight)
    pendingPrependRef.current = null
    void afterLayout().then(pending.resolve)
  }, [prependEpoch])

  React.useEffect(() => {
    window.chatVirtualizationFixture = {
      async scrollTo(offset) {
        const viewport = viewportRef.current
        if (!viewport) return
        viewport.scrollTop = offset
        viewport.dispatchEvent(new Event("scroll"))
        await afterLayout()
      },
      prepend() {
        const viewport = viewportRef.current
        if (!viewport) return Promise.resolve()
        return new Promise<void>((resolve) => {
          pendingPrependRef.current = {
            scrollHeight: viewport.scrollHeight,
            scrollTop: viewport.scrollTop,
            resolve,
          }
          setPrependEpoch((current) => current + 1)
        })
      },
      visibleAnchor() {
        const viewport = viewportRef.current
        if (!viewport) return null
        const viewportRect = viewport.getBoundingClientRect()
        const row = Array.from(
          viewport.querySelectorAll<HTMLElement>("[data-web-node-row]")
        )
          .filter((candidate) => {
            const rect = candidate.getBoundingClientRect()
            return rect.bottom > viewportRect.top && rect.top < viewportRect.bottom
          })
          .sort(
            (left, right) =>
              left.getBoundingClientRect().top - right.getBoundingClientRect().top
          )[0]
        return row
          ? {
              key: row.dataset.chatRowKey ?? "",
              top: row.getBoundingClientRect().top - viewportRect.top,
            }
          : null
      },
      materializedRows() {
        return (
          viewportRef.current?.querySelectorAll(
            "[data-web-node-row]"
          ).length ?? 0
        )
      },
      hasAbsoluteRows() {
        return Array.from(
          viewportRef.current?.querySelectorAll<HTMLElement>("[data-web-node-row]") ?? []
        ).some((row) => window.getComputedStyle(row).position === "absolute")
      },
      async settleTerminal() {
        setTerminalEntries((current) =>
          reduceConversationTimeline(current, {
            type: "canonical-patch",
            handoff: { runId: terminalRunId, messageSeqEnd: 3 },
            // Deliberately reversed: protocol ordering must win over array order.
            entries: [
              {
                id: `run:${terminalRunId}:anchor:2`,
                role: "assistant",
                runId: terminalRunId,
                status: "done",
                pane: terminalPane,
                subagentOrder: [],
                subagents: {},
                timelineSeq: 2,
                timelineUnitId: `run:${terminalRunId}:anchor:2`,
                canonicalMessageSeqEnd: 3,
              },
              {
                id: "message:terminal-trigger",
                role: "user",
                content: "查看当前目录",
                timelineSeq: 1,
                timelineUnitId: "message:terminal-trigger",
              },
            ],
          })
        )
        await afterLayout()
      },
      terminalLayout() {
        return Array.from(
          document.querySelectorAll<HTMLElement>(
            "[data-terminal-chat] [data-chat-entry-role]"
          )
        ).map((entry) => {
          const rect = entry.getBoundingClientRect()
          return {
            role: entry.dataset.chatEntryRole ?? "",
            top: rect.top,
            bottom: rect.bottom,
          }
        })
      },
    }
  }, [])

  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
      <div
        ref={viewportRef}
        data-chat-scroll-region
        style={{ height: 600, overflowY: "auto", padding: 8 }}
      >
        <div data-chat-scroll-content>
          <div style={{ height: prependEpoch * 700 }} />
          <WebNodeList pane={pane} />
        </div>
      </div>
      <div data-terminal-chat style={{ height: 600 }}>
        <ChatMessageList
          entries={terminalEntries}
          hasOlderEntries={false}
          isLoadingOlderEntries={false}
          olderEntriesError={null}
          isAwaitingResponse={false}
          isLoadingInitial={false}
          showScrollToBottom={false}
          scrollViewportRef={terminalViewportRef}
          onViewportScroll={() => {}}
          onLoadOlderConversationMessagesPage={() => {}}
          onScrollToBottomClick={() => {}}
          onStreamingContentProgress={() => {}}
          onApproveApproval={() => {}}
          onRejectApproval={() => {}}
          activeHumanRunId={null}
          onSubmitUserInput={async () => {}}
          isFullScreen
        />
      </div>
    </div>
  )
}

createRoot(document.getElementById("root")!).render(<Fixture />)
