import { useCallback, type RefObject } from "react"

export type ChatScrollDirection = "up" | "down"

/**
 * Keep wheel gestures inside the active chat scroll region. A nested region
 * may scroll normally, but reaching either boundary must not scroll its parent.
 */
function canScroll(element: HTMLElement, direction: ChatScrollDirection) {
  return direction === "up" ? element.scrollTop > 0 : element.scrollTop < element.scrollHeight - element.clientHeight - 1
}

function nestedCanScroll(target: EventTarget | null, boundary: HTMLElement, direction: ChatScrollDirection) {
  let element = target instanceof Element ? target : null
  while (element && element !== boundary) {
    if (element instanceof HTMLElement && canScroll(element, direction) &&
      /^(auto|scroll)$/.test(getComputedStyle(element).overflowY)) return true
    element = element.parentElement
  }
  return false
}

function containChatWheel(event: WheelEvent, onScrollIntent?: (direction: ChatScrollDirection) => void) {
  const boundary = event.currentTarget
  if (!(boundary instanceof HTMLElement) || event.ctrlKey) return
  const target = event.target
  const nestedRegion =
    target instanceof Element
      ? target.closest<HTMLElement>("[data-chat-scroll-region]")
      : null
  const scrollRegion =
    nestedRegion && boundary.contains(nestedRegion)
      ? nestedRegion
      : boundary

  if (event.deltaY === 0) {
    event.stopPropagation()
    return
  }

  const maxScrollTop = scrollRegion.scrollHeight - scrollRegion.clientHeight
  const canScrollInDirection =
    (event.deltaY < 0 && scrollRegion.scrollTop > 0) ||
    (event.deltaY > 0 && scrollRegion.scrollTop < maxScrollTop - 1)

  if (canScrollInDirection) {
    const direction = event.deltaY < 0 ? "up" : "down"
    if (scrollRegion === boundary && !nestedCanScroll(target, boundary, direction)) onScrollIntent?.(direction)
    event.stopPropagation()
    return
  }

  if (event.cancelable) event.preventDefault()
  event.stopPropagation()
}

/** Native binding is required: React's delegated wheel listener is passive.
 * A callback ref also handles conditionally mounted scroll regions and portals.
 */
export function useChatScrollBoundary<T extends HTMLElement>(forwardedRef?: RefObject<T | null>, onScrollIntent?: (direction: ChatScrollDirection) => void) {
  return useCallback((node: T | null) => {
    if (forwardedRef) forwardedRef.current = node
    if (!node) return
    const wheel = (event: WheelEvent) => containChatWheel(event, onScrollIntent)
    let touch: { id: number; y: number } | null = null
    let scrollbarTop: number | null = null
    const touchStart = (event: TouchEvent) => {
      touch = event.touches.length === 1 ? { id: event.touches[0].identifier, y: event.touches[0].clientY } : null
    }
    const touchMove = (event: TouchEvent) => {
      const point = touch && Array.from(event.touches).find(point => point.identifier === touch?.id)
      if (!point || event.touches.length !== 1) { touch = null; return }
      const direction = point.clientY > touch!.y ? "up" : "down"
      if (point.clientY !== touch!.y && canScroll(node, direction) && !nestedCanScroll(event.target, node, direction)) onScrollIntent?.(direction)
      touch = { id: point.identifier, y: point.clientY }
    }
    const touchEnd = () => { touch = null }
    const keyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.target instanceof Element && event.target.closest("input,textarea,select,[contenteditable]:not([contenteditable=false]),[role=combobox]")) return
      const up = ["ArrowUp", "PageUp", "Home"].includes(event.key) || (event.key === " " && event.shiftKey)
      const down = ["ArrowDown", "PageDown", "End"].includes(event.key) || (event.key === " " && !event.shiftKey)
      const direction = up ? "up" : "down"
      if ((up || down) && canScroll(node, direction) && !nestedCanScroll(event.target, node, direction)) {
        // React handlers on an inner control run after this native listener.
        // Let them consume navigation before treating it as transcript scrolling.
        queueMicrotask(() => { if (node.isConnected && !event.defaultPrevented) onScrollIntent?.(direction) })
      }
    }
    // Native scrollbar dragging targets the viewport, rather than its contents.
    const pointerDown = (event: PointerEvent) => {
      if (event.target === node && event.button === 0 && event.pointerType !== "touch") scrollbarTop = node.scrollTop
    }
    const pointerEnd = () => { scrollbarTop = null }
    const scroll = () => {
      if (scrollbarTop !== null) {
        if (Math.abs(node.scrollTop - scrollbarTop) > 1) onScrollIntent?.(node.scrollTop < scrollbarTop ? "up" : "down")
        scrollbarTop = node.scrollTop
      }
    }
    node.addEventListener("wheel", wheel, { passive: false })
    // Nested tool regions only need containment, not another intent observer.
    if (onScrollIntent) {
      node.addEventListener("touchstart", touchStart, { passive: true })
      node.addEventListener("touchmove", touchMove, { passive: true })
      node.addEventListener("touchend", touchEnd, { passive: true })
      node.addEventListener("touchcancel", touchEnd, { passive: true })
      node.addEventListener("keydown", keyDown)
      node.addEventListener("pointerdown", pointerDown)
      node.addEventListener("scroll", scroll)
      window.addEventListener("pointerup", pointerEnd)
      window.addEventListener("pointercancel", pointerEnd)
    }
    return () => {
      node.removeEventListener("wheel", wheel)
      node.removeEventListener("touchstart", touchStart)
      node.removeEventListener("touchmove", touchMove)
      node.removeEventListener("touchend", touchEnd)
      node.removeEventListener("touchcancel", touchEnd)
      node.removeEventListener("keydown", keyDown)
      node.removeEventListener("pointerdown", pointerDown)
      node.removeEventListener("scroll", scroll)
      window.removeEventListener("pointerup", pointerEnd)
      window.removeEventListener("pointercancel", pointerEnd)
      if (forwardedRef?.current === node) forwardedRef.current = null
    }
  }, [forwardedRef, onScrollIntent])
}
