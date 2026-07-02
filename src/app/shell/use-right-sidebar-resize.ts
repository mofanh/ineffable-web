import * as React from "react"

export const RIGHT_SIDEBAR_DEFAULT_WIDTH = 384
export const RIGHT_SIDEBAR_MIN_WIDTH = 300
export const RIGHT_SIDEBAR_MAX_WIDTH = 640

const RIGHT_SIDEBAR_OPEN_STORAGE_KEY = "ineffable.ui.right-sidebar.open"
const RIGHT_SIDEBAR_WIDTH_STORAGE_KEY = "ineffable.ui.right-sidebar.width"
const RIGHT_SIDEBAR_MIN_REMAINING_WIDTH = 320

function getRightSidebarReservedWidth(viewportWidth: number) {
  return Math.max(
    RIGHT_SIDEBAR_MIN_WIDTH,
    Math.min(
      RIGHT_SIDEBAR_MAX_WIDTH,
      viewportWidth - RIGHT_SIDEBAR_MIN_REMAINING_WIDTH
    )
  )
}

function getRightSidebarMaxWidth(viewportWidth: number, leftBoundaryX: number) {
  return Math.max(RIGHT_SIDEBAR_MIN_WIDTH, viewportWidth - leftBoundaryX)
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

export function useRightSidebarResize(leftBoundaryX = 0) {
  const [viewportWidth, setViewportWidth] = React.useState(() => {
    if (typeof window === "undefined") {
      return RIGHT_SIDEBAR_DEFAULT_WIDTH + RIGHT_SIDEBAR_MIN_REMAINING_WIDTH
    }

    return window.innerWidth
  })
  const [isRightSidebarOpen, setIsRightSidebarOpen] = React.useState(() => {
    if (typeof window === "undefined") {
      return true
    }

    if (window.innerWidth < 768) {
      return false
    }

    return window.localStorage.getItem(RIGHT_SIDEBAR_OPEN_STORAGE_KEY) !== "false"
  })
  const [rightSidebarWidth, setRightSidebarWidthState] = React.useState(() => {
    if (typeof window === "undefined") {
      return RIGHT_SIDEBAR_DEFAULT_WIDTH
    }

    return clampRightSidebarWidth(readStoredWidth(), window.innerWidth, leftBoundaryX)
  })
  const resizingPointerIdRef = React.useRef<number | null>(null)

  const setRightSidebarWidth = React.useCallback(
    (value: React.SetStateAction<number>) => {
      setRightSidebarWidthState((currentWidth) => {
        const requestedWidth =
          typeof value === "function" ? value(currentWidth) : value
        return clampRightSidebarWidth(
          requestedWidth,
          window.innerWidth,
          leftBoundaryX
        )
      })
    },
    [leftBoundaryX]
  )

  const setRightSidebarOpen = React.useCallback(
    (value: React.SetStateAction<boolean>) => {
      setIsRightSidebarOpen((currentOpen) => {
        const nextOpen = typeof value === "function" ? value(currentOpen) : value
        window.localStorage.setItem(
          RIGHT_SIDEBAR_OPEN_STORAGE_KEY,
          String(nextOpen)
        )
        return nextOpen
      })
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
        setRightSidebarWidth(nextWidth)
      }
    },
    [rightSidebarWidth, setRightSidebarWidth, viewportWidth, leftBoundaryX]
  )

  React.useEffect(() => {
    const persistTimer = window.setTimeout(() => {
      window.localStorage.setItem(
        RIGHT_SIDEBAR_WIDTH_STORAGE_KEY,
        String(rightSidebarWidth)
      )
    }, 150)

    return () => window.clearTimeout(persistTimer)
  }, [rightSidebarWidth])

  React.useEffect(() => {
    const handleWindowResize = () => {
      setViewportWidth(window.innerWidth)
      setRightSidebarWidthState((currentWidth) =>
        clampRightSidebarWidth(currentWidth, window.innerWidth, leftBoundaryX)
      )
    }

    window.addEventListener("resize", handleWindowResize)
    return () => window.removeEventListener("resize", handleWindowResize)
  }, [leftBoundaryX])

  React.useEffect(() => {
    setRightSidebarWidthState((currentWidth) =>
      clampRightSidebarWidth(currentWidth, viewportWidth, leftBoundaryX)
    )
  }, [leftBoundaryX, viewportWidth])

  React.useEffect(() => {
    const handlePointerMove = (event: PointerEvent) => {
      if (resizingPointerIdRef.current !== event.pointerId) {
        return
      }

      setRightSidebarWidth(window.innerWidth - event.clientX)
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
  }, [setRightSidebarWidth])

  const rightSidebarMaxWidth = getRightSidebarMaxWidth(
    viewportWidth,
    leftBoundaryX
  )
  const rightSidebarReservedWidth = Math.min(
    rightSidebarWidth,
    getRightSidebarReservedWidth(viewportWidth)
  )

  return {
    isRightSidebarOpen,
    rightSidebarWidth,
    rightSidebarMaxWidth,
    rightSidebarReservedWidth,
    setIsRightSidebarOpen: setRightSidebarOpen,
    setRightSidebarWidth,
    startRightSidebarResize,
    handleRightSidebarResizeKeyDown,
  }
}
