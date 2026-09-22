import * as React from "react"
import { defaultRangeExtractor, observeElementOffset, useVirtualizer, type Range } from "@tanstack/react-virtual"

type RowAnchor = { key: string; top: number }
type RestoreRow = (key: string, top: number) => boolean
type NestedWindow = { root: React.RefObject<HTMLDivElement | null>; restore: RestoreRow }
const NestedWindows = React.createContext<Set<NestedWindow> | null>(null)
export type ChatRowWindowHandle = { restoreAnchor: (key: string, top: number, child?: RowAnchor) => void }

/** A measured window in the existing conversation scroller. Spacers stay in normal
 * flow, so nested tool content and canonical handoffs cannot overlap other entries. */
export function ChatRowWindow<T>({ items, getKey, estimateSize, gap, pinnedKeys = [], children, windowRef, nested = false }: {
  items: T[]
  getKey: (item: T) => string
  estimateSize: (item: T) => number
  nested?: boolean
  gap: number
  pinnedKeys?: string[]
  children: (item: T, index: number) => React.ReactNode
  windowRef?: React.Ref<ChatRowWindowHandle>
}) {
  const rootRef = React.useRef<HTMLDivElement>(null)
  const parentWindows = React.useContext(NestedWindows)
  const [ownWindows] = React.useState(() => new Set<NestedWindow>())
  const nestedWindows = parentWindows ?? ownWindows
  const restoreGeneration = React.useRef(0)
  const measuredMargin = React.useRef<number | null>(null)
  const [scrollMargin, setScrollMargin] = React.useState(0)
  const keys = React.useMemo(() => items.map(getKey), [items, getKey])
  const getItemKey = React.useCallback((index: number) => keys[index], [keys])
  const rangeExtractor = React.useCallback((range: Range) => {
    if (items.length <= 40) return items.map((_, index) => index)
    const indexes = new Set(defaultRangeExtractor(range))
    for (const key of pinnedKeys) {
      const index = keys.indexOf(key)
      if (index >= 0) indexes.add(index)
    }
    return [...indexes].sort((a, b) => a - b)
  }, [items, keys, pinnedKeys])
  // The installed TanStack hook returns a mutable measurement engine; render its
  // current range here instead of passing the engine through memoized consumers.
  const virtualizer = useVirtualizer<HTMLDivElement, HTMLDivElement>({
    count: items.length,
    enabled: !nested || items.length > 40,
    getScrollElement: () => rootRef.current?.closest<HTMLDivElement>("[data-chat-scroll-region]") ?? null,
    getItemKey,
    observeElementOffset: (instance, onOffset) => observeElementOffset(instance, (offset, scrolling) => {
      // Idle notifications may be debounced across a measurement correction.
      // Read the scroller at delivery time instead of restoring a captured offset.
      onOffset(!scrolling && instance.scrollElement ? instance.scrollElement.scrollTop : offset, scrolling)
    }),
    estimateSize: (index) => estimateSize(items[index]),
    // Seed a bounded first row before the viewport mounts (also supports SSR).
    initialRect: { width: 0, height: 1 },
    overscan: 5,
    gap,
    scrollMargin,
    rangeExtractor,
    anchorTo: "end",
    followOnAppend: false,
    // The Sidebar owns following the conversation tail. Disable the engine's
    // independent resize-to-end behavior, especially inside an assistant row.
    scrollEndThreshold: -1,
  })
  React.useLayoutEffect(() => {
    const root = rootRef.current
    const scroller = virtualizer.scrollElement
    if (!root || !scroller) return
    const measure = () => {
      const next = root.getBoundingClientRect().top - scroller.getBoundingClientRect().top + scroller.scrollTop
      const previous = measuredMargin.current
      measuredMargin.current = next
      // Older-page controls can disappear when the first canonical page arrives.
      // Only the outer window owns that offset; nested windows share its scroller.
      if (!nested && previous !== null && scroller.scrollTop > previous && Math.abs(next - previous) > 0.5) {
        scroller.scrollTop += next - previous
      }
      setScrollMargin(next)
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(scroller)
    if (root.parentElement) observer.observe(root.parentElement)
    return () => observer.disconnect()
  }, [virtualizer, items.length, nested])

  const restoreOwnAnchor = React.useCallback((key: string, top: number, child?: RowAnchor) => {
    const index = keys.indexOf(key)
    if (index < 0) return false
    const generation = ++restoreGeneration.current
    // One bounded restoration owns the shared scroller. Independent scrollToIndex
    // reconcilers in nested virtualizers would keep pulling it to competing targets.
    const scroller = rootRef.current?.closest<HTMLDivElement>("[data-chat-scroll-region]")
    const target = virtualizer.options.enabled ? virtualizer.getOffsetForIndex(index, "start")?.[0] : undefined
    if (scroller && target !== undefined) scroller.scrollTop = target
    let remaining = 12
    let stableFrames = 0
    const correct = () => {
      const root = rootRef.current
      const scroller = root?.closest<HTMLDivElement>("[data-chat-scroll-region]")
      if (!root || !scroller || generation !== restoreGeneration.current) return
      if (child) {
        for (const window of nestedWindows) {
          if (window.root.current?.closest("[data-chat-entry-role]")?.getAttribute("data-chat-row-key") === key && window.restore(child.key, child.top)) return
        }
      }
      const row = Array.from(root.children).find((element) => element.getAttribute("data-window-key") === key)
      if (row && !child) {
        const offset = scroller.scrollTop + row.getBoundingClientRect().top - scroller.getBoundingClientRect().top - top
        if (Math.abs(scroller.scrollTop - offset) > 0.5) {
          stableFrames = 0
          scroller.scrollTop = offset
        } else if (++stableFrames >= 2) return
      }
      if (!row && !child && virtualizer.options.enabled) {
        const retryOffset = virtualizer.getOffsetForIndex(index, "start")?.[0]
        if (retryOffset !== undefined) scroller.scrollTop = retryOffset
      }
      if (--remaining > 0) requestAnimationFrame(correct)
    }
    requestAnimationFrame(correct)
    return true
  }, [keys, nestedWindows, virtualizer])
  React.useEffect(() => {
    const registration = { root: rootRef, restore: restoreOwnAnchor }
    if (nested) nestedWindows.add(registration)
    return () => { nestedWindows.delete(registration) }
  }, [nested, nestedWindows, restoreOwnAnchor])
  React.useEffect(() => {
    const scroller = rootRef.current?.closest<HTMLDivElement>("[data-chat-scroll-region]")
    const cancel = () => { restoreGeneration.current += 1 }
    scroller?.addEventListener("wheel", cancel, { passive: true })
    scroller?.addEventListener("touchstart", cancel, { passive: true })
    return () => {
      cancel()
      scroller?.removeEventListener("wheel", cancel)
      scroller?.removeEventListener("touchstart", cancel)
    }
  }, [])
  React.useImperativeHandle(windowRef, () => ({ restoreAnchor: restoreOwnAnchor }), [restoreOwnAnchor])

  const windowed = !nested || items.length > 40
  // A nested list corrects changes within the visible assistant. Its parent owns
  // changes to assistants wholly above the viewport, preventing double adjustment.
  virtualizer.shouldAdjustScrollPositionOnItemSizeChange = (item) => {
    const root = rootRef.current
    const scroller = virtualizer.scrollElement
    if (!root || !scroller) return false
    // A fresh scroll write can precede its native event. The engine applies deltas
    // to its own sampled offset, so it must not overwrite the newer DOM position.
    if (virtualizer.scrollOffset === null || Math.abs(virtualizer.scrollOffset - scroller.scrollTop) > 1.5) return false
    const fold = scroller.getBoundingClientRect().top
    const bounds = root.getBoundingClientRect()
    return (!nested || (bounds.top < fold && bounds.bottom > fold)) && item.end <= scroller.scrollTop
  }
  const rows = windowed ? virtualizer.getVirtualItems() : keys.map((key, index) => ({ key, index, start: 0, end: 0 }))
  let previousEnd = 0
  // Preserve the provider, keyed fragment and row hierarchy across the size
  // threshold, so a pinned question retains its selection, draft and focus.
  return <NestedWindows.Provider value={nestedWindows}><div ref={rootRef} data-chat-row-window
    className={windowed ? undefined : "flex flex-col"} style={{ overflowAnchor: "none", gap: windowed ? undefined : gap }}>
    {rows.map((row) => {
      const start = windowed ? row.start - scrollMargin : 0
      const space = Math.max(0, start - previousEnd)
      previousEnd = windowed ? row.end - scrollMargin : 0
      return <React.Fragment key={row.key}>
        {space > 0 && <div aria-hidden style={{ height: space }} />}
        <div ref={windowed ? virtualizer.measureElement : undefined} data-index={row.index} data-window-key={row.key} style={{ display: "flow-root" }}>
          {children(items[row.index], row.index)}
        </div>
      </React.Fragment>
    })}
    {windowed && <div aria-hidden style={{ height: Math.max(0, virtualizer.getTotalSize() - previousEnd) }} />}
  </div></NestedWindows.Provider>
}
