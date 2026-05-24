import * as React from "react"

export const RIGHT_SIDEBAR_DEFAULT_WIDTH = 384
const RIGHT_SIDEBAR_MIN_WIDTH = 300
const RIGHT_SIDEBAR_MAX_WIDTH = 640

export function useRightSidebarResize() {
  const [isRightSidebarOpen, setIsRightSidebarOpen] = React.useState(() => {
    if (typeof window === "undefined") {
      return true
    }

    return window.innerWidth >= 768
  })
  const [rightSidebarWidth, setRightSidebarWidth] = React.useState(
    RIGHT_SIDEBAR_DEFAULT_WIDTH
  )
  const isResizingRightSidebarRef = React.useRef(false)

  const clampRightSidebarWidth = React.useCallback((rawWidth: number) => {
    const dynamicMax = Math.max(
      RIGHT_SIDEBAR_MIN_WIDTH,
      Math.min(RIGHT_SIDEBAR_MAX_WIDTH, window.innerWidth - 320)
    )
    return Math.min(dynamicMax, Math.max(RIGHT_SIDEBAR_MIN_WIDTH, rawWidth))
  }, [])

  const startRightSidebarResize = React.useCallback(
    (event: React.MouseEvent<HTMLDivElement>) => {
      if (!isRightSidebarOpen) {
        return
      }

      isResizingRightSidebarRef.current = true
      document.body.style.cursor = "col-resize"
      document.body.style.userSelect = "none"
      event.preventDefault()
    },
    [isRightSidebarOpen]
  )

  React.useEffect(() => {
    const handleMouseMove = (event: MouseEvent) => {
      if (!isResizingRightSidebarRef.current) {
        return
      }

      const nextWidth = clampRightSidebarWidth(window.innerWidth - event.clientX)
      setRightSidebarWidth(nextWidth)
    }

    const stopResize = () => {
      if (!isResizingRightSidebarRef.current) {
        return
      }

      isResizingRightSidebarRef.current = false
      document.body.style.removeProperty("cursor")
      document.body.style.removeProperty("user-select")
    }

    window.addEventListener("mousemove", handleMouseMove)
    window.addEventListener("mouseup", stopResize)

    return () => {
      window.removeEventListener("mousemove", handleMouseMove)
      window.removeEventListener("mouseup", stopResize)
      stopResize()
    }
  }, [clampRightSidebarWidth])

  return {
    isRightSidebarOpen,
    rightSidebarWidth,
    setIsRightSidebarOpen,
    setRightSidebarWidth,
    startRightSidebarResize,
  }
}
