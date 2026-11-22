import * as React from "react"

// DSH ui-sidebar scroll-handoff: down hides global entries before scrolling the
// browser; up restores the browser's top before revealing global entries.
// Adapted to DOM scrollports only (no Cordis services or runtime state).
export function SidebarNavigationScroll({ global, children }: { global: React.ReactNode; children: React.ReactNode }) {
  const outerRef = React.useRef<HTMLDivElement>(null)
  const browserRef = React.useRef<HTMLDivElement>(null)
  React.useEffect(() => {
    const outer = outerRef.current, browser = browserRef.current
    if (!outer || !browser) return
    let lastHandled = -Infinity
    const move = (element: HTMLElement, delta: number) => {
      const before = element.scrollTop
      element.scrollTop = Math.max(0, Math.min(element.scrollHeight - element.clientHeight, before + delta))
      return element.scrollTop - before
    }
    const onWheel = (event: WheelEvent) => {
      if (event.defaultPrevented || event.ctrlKey || Math.abs(event.deltaX) > Math.abs(event.deltaY)) return
      const delta = event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? browser.clientHeight : 1)
      if (!delta) return
      const atOuterEnd = outer.scrollHeight - outer.clientHeight - outer.scrollTop < 1
      const inside = browser.contains(event.target as Node)
      // Keep native list scrolling where no handoff is needed. A JS-controlled
      // gesture stays controlled through its momentum tail (100ms event gap).
      const native = atOuterEnd && inside
      const continuing = event.cancelable && event.timeStamp - lastHandled < 100
      if (!continuing) {
        if (native && (delta > 0 || browser.scrollTop + delta >= 0)) return
        if (!event.cancelable) {
          // Native momentum latched to the inner list cannot cross its top.
          // Let the outer viewport consume only the unconsumed remainder.
          if (native) move(outer, delta + browser.scrollTop)
          return
        }
      }
      event.preventDefault()
      lastHandled = event.timeStamp
      if (delta > 0) move(browser, delta - move(outer, delta))
      else move(outer, delta - move(browser, delta))
    }
    outer.addEventListener("wheel", onWheel, { passive: false })
    return () => outer.removeEventListener("wheel", onWheel)
  }, [])
  return <div ref={outerRef} data-slot="sidebar-navigation-scroll" className="h-full min-h-0 overflow-y-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
    {global}
    <div ref={browserRef} data-slot="sidebar-browser-scroll" tabIndex={0} className="h-[100cqh] overflow-y-auto overscroll-contain outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-sidebar-ring group-data-[collapsible=icon]:hidden">
      {children}
    </div>
  </div>
}
