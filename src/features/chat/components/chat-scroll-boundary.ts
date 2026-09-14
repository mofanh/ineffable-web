import { useCallback, type RefObject } from "react"

/**
 * Keep wheel gestures inside the active chat scroll region. A nested region
 * may scroll normally, but reaching either boundary must not scroll its parent.
 */
function containChatWheel(event: WheelEvent) {
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
    event.stopPropagation()
    return
  }

  if (event.cancelable) event.preventDefault()
  event.stopPropagation()
}

/** Native binding is required: React's delegated wheel listener is passive.
 * A callback ref also handles conditionally mounted scroll regions and portals.
 */
export function useChatScrollBoundary<T extends HTMLElement>(forwardedRef?: RefObject<T | null>) {
  return useCallback((node: T | null) => {
    if (forwardedRef) forwardedRef.current = node
    if (!node) return
    node.addEventListener("wheel", containChatWheel, { passive: false })
    return () => {
      node.removeEventListener("wheel", containChatWheel)
      if (forwardedRef?.current === node) forwardedRef.current = null
    }
  }, [forwardedRef])
}
