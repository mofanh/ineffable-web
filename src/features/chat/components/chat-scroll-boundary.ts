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
    const document = node.ownerDocument
    const ownsEvent = (event: Event) => event.target instanceof Node && node.contains(event.target)
    const wheel = (event: WheelEvent) => containChatWheel(event, onScrollIntent)
    let touch: { id: number; x: number; y: number; startX: number; startY: number } | null = null
    let pointer: { id: number; startY: number; y: number; top: number; gutter: boolean; dragging: boolean; direction: ChatScrollDirection | null } | null = null
    const touchStart = (event: TouchEvent) => {
      const point = event.touches[0]
      touch = ownsEvent(event) && !event.defaultPrevented && event.touches.length === 1
        ? { id: point.identifier, x: point.clientX, y: point.clientY, startX: point.clientX, startY: point.clientY } : null
    }
    const touchMove = (event: TouchEvent) => {
      const point = touch && Array.from(event.touches).find(point => point.identifier === touch?.id)
      if (!point || event.touches.length !== 1) { touch = null; return }
      const dx = point.clientX - touch!.startX, dy = point.clientY - touch!.startY
      const direction = point.clientY > touch!.y ? "up" : "down"
      // A horizontal code swipe or a finger's small jitter is not an up-scroll.
      if (!event.defaultPrevented && Math.abs(dy) >= 8 && Math.abs(dy) > Math.abs(dx) &&
        point.clientY !== touch!.y && canScroll(node, direction) && !nestedCanScroll(event.target, node, direction)) onScrollIntent?.(direction)
      touch = { ...touch!, x: point.clientX, y: point.clientY }
    }
    const touchEnd = () => { touch = null }
    const keyDown = (event: KeyboardEvent) => {
      if (!ownsEvent(event) || event.defaultPrevented || event.target instanceof Element && event.target.closest("input,textarea,select,[contenteditable]:not([contenteditable=false]),[role=combobox]")) return
      // Native buttons/summary activate on Space without preventing the event.
      if (event.key === " " && event.target instanceof Element && event.target.closest("button,[role=button],summary")) return
      const up = ["ArrowUp", "PageUp", "Home"].includes(event.key) || (event.key === " " && event.shiftKey)
      const down = ["ArrowDown", "PageDown", "End"].includes(event.key) || (event.key === " " && !event.shiftKey)
      const direction = up ? "up" : "down"
      if ((up || down) && canScroll(node, direction) && !nestedCanScroll(event.target, node, direction)) {
        onScrollIntent?.(direction)
      }
    }
    const pointerDown = (event: PointerEvent) => {
      if (event.target !== node || event.button !== 0 || event.pointerType === "touch") return
      const rect = node.getBoundingClientRect(), style = getComputedStyle(node)
      const gutterWidth = node.offsetWidth - node.clientWidth - parseFloat(style.borderLeftWidth) - parseFloat(style.borderRightWidth)
      const clientLeft = rect.left + node.clientLeft
      const gutter = gutterWidth > 0 && (event.clientX < clientLeft || event.clientX >= clientLeft + node.clientWidth)
      pointer = { id: event.pointerId, startY: event.clientY, y: event.clientY, top: node.scrollTop, gutter, dragging: false, direction: null }
      window.addEventListener("pointermove", pointerMove)
      window.addEventListener("pointerrawupdate", rawPointerMove)
    }
    const pointerEnd = () => {
      pointer = null
      window.removeEventListener("pointermove", pointerMove)
      window.removeEventListener("pointerrawupdate", rawPointerMove)
    }
    const scroll = () => {
      if (pointer) {
        const direction = node.scrollTop < pointer.top ? "up" : "down"
        if (Math.abs(node.scrollTop - pointer.top) > 1 &&
          (pointer.gutter || pointer.dragging && pointer.direction === direction)) onScrollIntent?.(direction)
        pointer.top = node.scrollTop
      }
    }
    const pointerMove = (event: PointerEvent) => {
      if (!pointer || event.pointerId !== pointer.id) return
      if (!(event.buttons & 1)) { pointerEnd(); return }
      // Overlay scrollbars have no reserved gutter. Require an actual drag and
      // matching scroll movement, so merely holding empty padding cannot pause.
      if (event.clientY !== pointer.y) pointer.direction = event.clientY < pointer.y ? "up" : "down"
      pointer.dragging ||= Math.abs(event.clientY - pointer.startY) >= 3
      pointer.y = event.clientY
      scroll()
    }
    // Chromium's native overlay drag may suppress pointermove while still
    // delivering raw updates. Observe them only for an armed viewport gesture.
    const rawPointerMove = (event: Event) => { if (event instanceof PointerEvent) pointerMove(event) }
    node.addEventListener("wheel", wheel, { passive: false })
    // Nested tool regions only need containment, not another intent observer.
    if (onScrollIntent) {
      // Document bubbling follows React root/Portal handlers, including for
      // trusted browser input. Microtasks can run between native listeners.
      document.addEventListener("touchstart", touchStart, { passive: true })
      document.addEventListener("touchmove", touchMove, { passive: true })
      document.addEventListener("touchend", touchEnd, { passive: true })
      document.addEventListener("touchcancel", touchEnd, { passive: true })
      document.addEventListener("keydown", keyDown)
      node.addEventListener("pointerdown", pointerDown)
      node.addEventListener("scroll", scroll)
      window.addEventListener("pointerup", pointerEnd, true)
      window.addEventListener("pointercancel", pointerEnd, true)
      window.addEventListener("mouseup", pointerEnd, true)
      window.addEventListener("blur", pointerEnd)
    }
    return () => {
      node.removeEventListener("wheel", wheel)
      document.removeEventListener("touchstart", touchStart)
      document.removeEventListener("touchmove", touchMove)
      document.removeEventListener("touchend", touchEnd)
      document.removeEventListener("touchcancel", touchEnd)
      document.removeEventListener("keydown", keyDown)
      node.removeEventListener("pointerdown", pointerDown)
      node.removeEventListener("scroll", scroll)
      window.removeEventListener("pointerup", pointerEnd, true)
      window.removeEventListener("pointercancel", pointerEnd, true)
      window.removeEventListener("mouseup", pointerEnd, true)
      window.removeEventListener("blur", pointerEnd)
      pointerEnd()
      if (forwardedRef?.current === node) forwardedRef.current = null
    }
  }, [forwardedRef, onScrollIntent])
}
