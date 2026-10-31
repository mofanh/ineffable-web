import * as React from "react"

import { isCompactLayoutWidth } from "@/hooks/use-compact-layout"

export const RIGHT_SIDEBAR_DEFAULT_WIDTH = 384
export const RIGHT_SIDEBAR_MIN_WIDTH = 300
export const WORKSPACE_MIN_WIDTH = 480

// Allow for the inset shell's margins in both left-sidebar states.
const SHELL_GUTTER_WIDTH = 16
export const THREE_COLUMN_MIN_WIDTH =
  256 + WORKSPACE_MIN_WIDTH + RIGHT_SIDEBAR_MIN_WIDTH + SHELL_GUTTER_WIDTH

const RIGHT_SIDEBAR_OPEN_STORAGE_KEY = "ineffable.ui.right-sidebar.open"
const RIGHT_SIDEBAR_WIDTH_STORAGE_KEY = "ineffable.ui.right-sidebar.width"

function getRightSidebarMaxWidth(viewportWidth: number, leftBoundaryX: number) {
  return Math.max(
    RIGHT_SIDEBAR_MIN_WIDTH,
    viewportWidth - leftBoundaryX - WORKSPACE_MIN_WIDTH - SHELL_GUTTER_WIDTH
  )
}

function clampRightSidebarWidth(
  rawWidth: number,
  viewportWidth: number,
  leftBoundaryX: number
) {
  return Math.min(
    getRightSidebarMaxWidth(viewportWidth, leftBoundaryX),
    Math.max(RIGHT_SIDEBAR_MIN_WIDTH, rawWidth)
  )
}

function readStoredWidth() {
  const storedWidth = Number(
    window.localStorage.getItem(RIGHT_SIDEBAR_WIDTH_STORAGE_KEY)
  )
  return Number.isFinite(storedWidth) && storedWidth > 0
    ? storedWidth
    : RIGHT_SIDEBAR_DEFAULT_WIDTH
}

function readAvailableWidth() {
  // The app's layout width excludes classic scrollbars and body compensation
  // while a modal is open; innerWidth alone can over-allocate that space.
  return document.getElementById("root")?.getBoundingClientRect().width ||
    document.documentElement.clientWidth || window.innerWidth
}

export function useRightSidebarResize(leftBoundaryX = 0) {
  const [viewportWidth, setViewportWidth] = React.useState(() => {
    if (typeof window === "undefined") {
      return RIGHT_SIDEBAR_DEFAULT_WIDTH + WORKSPACE_MIN_WIDTH + SHELL_GUTTER_WIDTH
    }

    return readAvailableWidth()
  })
  const [isRightSidebarOpen, setIsRightSidebarOpen] = React.useState(() => {
    if (typeof window === "undefined") {
      return true
    }

    if (isCompactLayoutWidth(window.innerWidth)) {
      return false
    }

    return window.localStorage.getItem(RIGHT_SIDEBAR_OPEN_STORAGE_KEY) !== "false"
  })
  const [preferredWidth, setPreferredWidth] = React.useState(() =>
    typeof window === "undefined" ? RIGHT_SIDEBAR_DEFAULT_WIDTH : readStoredWidth()
  )
  const rightSidebarWidth = clampRightSidebarWidth(preferredWidth, viewportWidth, leftBoundaryX)
  const widthRef = React.useRef(rightSidebarWidth)
  const openRef = React.useRef(isRightSidebarOpen)
  const availableWidthRef = React.useRef(viewportWidth)
  const resizingPointerIdRef = React.useRef<number | null>(null)

  React.useLayoutEffect(() => {
    widthRef.current = rightSidebarWidth
    openRef.current = isRightSidebarOpen
  }, [rightSidebarWidth, isRightSidebarOpen])

  const setRightSidebarWidth = React.useCallback(
    (value: React.SetStateAction<number>) => {
      const requestedWidth = typeof value === "function" ? value(widthRef.current) : value
      const nextWidth = Math.max(RIGHT_SIDEBAR_MIN_WIDTH, requestedWidth)
      widthRef.current = clampRightSidebarWidth(nextWidth, readAvailableWidth(), leftBoundaryX)
      setPreferredWidth(nextWidth)
    },
    [leftBoundaryX]
  )

  const setRightSidebarOpen = React.useCallback(
    (value: React.SetStateAction<boolean>) => {
      const nextOpen = typeof value === "function" ? value(openRef.current) : value
      openRef.current = nextOpen
      setIsRightSidebarOpen(nextOpen)
      window.localStorage.setItem(RIGHT_SIDEBAR_OPEN_STORAGE_KEY, String(nextOpen))
    },
    []
  )

  const startRightSidebarResize = React.useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (!isRightSidebarOpen || event.button !== 0) {
        return
      }

      resizingPointerIdRef.current = event.pointerId
      event.currentTarget.setPointerCapture(event.pointerId)
      document.body.style.cursor = "col-resize"
      document.body.style.userSelect = "none"
      event.preventDefault()
    },
    [isRightSidebarOpen]
  )

  const handleRightSidebarResizeKeyDown = React.useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      const step = event.shiftKey ? 48 : 16
      let nextWidth: number | null = null

      if (event.key === "ArrowLeft") {
        nextWidth = rightSidebarWidth + step
      } else if (event.key === "ArrowRight") {
        nextWidth = rightSidebarWidth - step
      } else if (event.key === "Home") {
        nextWidth = RIGHT_SIDEBAR_MIN_WIDTH
      } else if (event.key === "End") {
        nextWidth = getRightSidebarMaxWidth(viewportWidth, leftBoundaryX)
      }

      if (nextWidth !== null) {
        event.preventDefault()
        setRightSidebarWidth(clampRightSidebarWidth(nextWidth, viewportWidth, leftBoundaryX))
      }
    },
    [rightSidebarWidth, setRightSidebarWidth, viewportWidth, leftBoundaryX]
  )

  React.useEffect(() => {
    const persistTimer = window.setTimeout(() => {
      window.localStorage.setItem(
        RIGHT_SIDEBAR_WIDTH_STORAGE_KEY,
        String(preferredWidth)
      )
    }, 150)

    return () => window.clearTimeout(persistTimer)
  }, [preferredWidth])

  React.useLayoutEffect(() => {
    const handleWindowResize = () => {
      const nextWidth = readAvailableWidth()
      if (nextWidth !== availableWidthRef.current) {
        availableWidthRef.current = nextWidth
        setViewportWidth(nextWidth)
      }
    }
    handleWindowResize()
    const root = document.getElementById("root")
    const observer = root && new ResizeObserver(handleWindowResize)
    if (root) observer?.observe(root)
    window.addEventListener("resize", handleWindowResize)
    return () => {
      observer?.disconnect()
      window.removeEventListener("resize", handleWindowResize)
    }
  }, [])

  React.useEffect(() => {
    const handlePointerMove = (event: PointerEvent) => {
      if (resizingPointerIdRef.current !== event.pointerId) {
        return
      }

      const availableWidth = readAvailableWidth()
      const rightBoundary = document.getElementById("root")?.getBoundingClientRect().right ?? availableWidth
      setRightSidebarWidth(clampRightSidebarWidth(rightBoundary - event.clientX, availableWidth, leftBoundaryX))
    }

    const stopResize = (event?: PointerEvent) => {
      if (
        resizingPointerIdRef.current === null ||
        (event && resizingPointerIdRef.current !== event.pointerId)
      ) {
        return
      }

      resizingPointerIdRef.current = null
      document.body.style.removeProperty("cursor")
      document.body.style.removeProperty("user-select")
    }

    window.addEventListener("pointermove", handlePointerMove)
    window.addEventListener("pointerup", stopResize)
    window.addEventListener("pointercancel", stopResize)

    return () => {
      window.removeEventListener("pointermove", handlePointerMove)
      window.removeEventListener("pointerup", stopResize)
      window.removeEventListener("pointercancel", stopResize)
      stopResize()
    }
  }, [setRightSidebarWidth, leftBoundaryX])

  const rightSidebarMaxWidth = getRightSidebarMaxWidth(
    viewportWidth,
    leftBoundaryX
  )
  return {
    isRightSidebarOpen,
    rightSidebarWidth,
    rightSidebarMaxWidth,
    rightSidebarReservedWidth: rightSidebarWidth,
    viewportWidth,
    setIsRightSidebarOpen: setRightSidebarOpen,
    setRightSidebarWidth,
    startRightSidebarResize,
    handleRightSidebarResizeKeyDown,
  }
}
