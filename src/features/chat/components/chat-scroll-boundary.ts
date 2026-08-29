import type { WheelEvent } from "react"

/**
 * Keep wheel gestures inside the active chat scroll region. A nested region
 * may scroll normally, but reaching either boundary must not scroll its parent.
 */
export function containChatWheel(event: WheelEvent<HTMLElement>) {
  const target = event.target
  const nestedRegion =
    target instanceof Element
      ? target.closest<HTMLElement>("[data-chat-scroll-region]")
      : null
  const scrollRegion =
    nestedRegion && event.currentTarget.contains(nestedRegion)
      ? nestedRegion
      : event.currentTarget

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

  event.preventDefault()
  event.stopPropagation()
}
