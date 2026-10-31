import * as React from "react"

// A preserved content subtree can move between modal and docked containers.
// Its temporary portals belong to the presentation in which they were opened.
export const OverlayPresentationContext = React.createContext<string | undefined>(undefined)

type OverlayOpenProps = {
  open?: boolean
  defaultOpen?: boolean
  onOpenChange?: (open: boolean) => void
}

export function useOverlayOpen({ open, defaultOpen = false, onOpenChange }: OverlayOpenProps) {
  const presentation = React.useContext(OverlayPresentationContext)
  const [uncontrolledOpen, setUncontrolledOpen] = React.useState(defaultOpen)
  const [openingPresentation, setOpeningPresentation] = React.useState(presentation)
  const requestedOpen = open ?? uncontrolledOpen

  React.useLayoutEffect(() => {
    if (presentation === undefined) return
    if (!requestedOpen) {
      setOpeningPresentation(presentation)
    } else if (openingPresentation !== presentation) {
      setUncontrolledOpen(false)
      onOpenChange?.(false)
    }
  }, [onOpenChange, openingPresentation, presentation, requestedOpen])

  const handleOpenChange = React.useCallback((nextOpen: boolean) => {
    setOpeningPresentation(presentation)
    if (open === undefined) setUncontrolledOpen(nextOpen)
    onOpenChange?.(nextOpen)
  }, [onOpenChange, open, presentation])

  // Leave unscoped primitives under their original Radix state ownership.
  if (presentation === undefined) return { open, onOpenChange }

  return {
    // Close in the same commit that replaces the parent modal, before a stale
    // child can outlive its FocusScope or regain the new modal's stack position.
    open: requestedOpen && openingPresentation === presentation,
    onOpenChange: handleOpenChange,
  }
}
