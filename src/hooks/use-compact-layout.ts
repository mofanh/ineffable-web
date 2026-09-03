import * as React from "react"

export const DESKTOP_LAYOUT_BREAKPOINT = 1024

export function isCompactLayoutWidth(viewportWidth: number) {
  return viewportWidth < DESKTOP_LAYOUT_BREAKPOINT
}

export function useIsCompactLayout() {
  const [isCompact, setIsCompact] = React.useState<boolean | undefined>(
    undefined
  )

  React.useEffect(() => {
    const mediaQuery = window.matchMedia(
      `(max-width: ${DESKTOP_LAYOUT_BREAKPOINT - 1}px)`
    )
    const update = () => {
      setIsCompact(isCompactLayoutWidth(window.innerWidth))
    }
    mediaQuery.addEventListener("change", update)
    update()
    return () => mediaQuery.removeEventListener("change", update)
  }, [])

  return !!isCompact
}
