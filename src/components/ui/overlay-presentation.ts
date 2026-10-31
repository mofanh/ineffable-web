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
  const presentationRef = React.useRef(presentation)
  const [uncontrolledOpen, setUncontrolledOpen] = React.useState(defaultOpen)
  const [openingPresentation, setOpeningPresentation] = React.useState(presentation)
  const requestedOpen = open ?? uncontrolledOpen

  React.useLayoutEffect(() => { presentationRef.current = presentation }, [presentation])
  React.useLayoutEffect(() => {
    if (presentation === undefined) return
    if (!requestedOpen) {
      // Keep controlled/programmatic opens attached to the current container.
      // The memoized closed Radix root does not need to render for this stamp.
      setOpeningPresentation(presentation)
    } else if (openingPresentation !== presentation) {
      setUncontrolledOpen(false)
      onOpenChange?.(false)
    }
  }, [onOpenChange, openingPresentation, presentation, requestedOpen])

  const handleOpenChange = React.useCallback((nextOpen: boolean) => {
    setOpeningPresentation(presentationRef.current)
    if (open === undefined) setUncontrolledOpen(nextOpen)
    onOpenChange?.(nextOpen)
  }, [onOpenChange, open])

  // Leave unscoped primitives under their original Radix state ownership.
  if (presentation === undefined) return { open, onOpenChange }

  return {
    // Close in the same commit that replaces the parent modal, before a stale
    // child can outlive its FocusScope or regain the new modal's stack position.
    open: requestedOpen && openingPresentation === presentation,
    onOpenChange: handleOpenChange,
  }
}
