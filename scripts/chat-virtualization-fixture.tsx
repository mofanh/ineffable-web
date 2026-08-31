import * as React from "react"
import { createRoot } from "react-dom/client"

import { WebNodeList } from "../src/features/chat/components/agent-pane"
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

declare global {
  interface Window {
    chatVirtualizationFixture: {
      scrollTo: (offset: number) => Promise<void>
      prepend: () => Promise<void>
      visibleAnchor: () => { key: string; top: number } | null
      materializedRows: () => number
      hasAbsoluteRows: () => boolean
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
  const pendingPrependRef = React.useRef<{
    scrollHeight: number
    scrollTop: number
    resolve: () => void
  } | null>(null)
  const [prependEpoch, setPrependEpoch] = React.useState(0)

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
    }
  }, [])

  return (
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
  )
}

createRoot(document.getElementById("root")!).render(<Fixture />)
