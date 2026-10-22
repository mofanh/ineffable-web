import * as React from "react"
import { ChevronRightIcon } from "lucide-react"
import { useTranslation } from "react-i18next"
import { cn } from "@/lib/utils"

// Per mounted chat panel, independent of business/run state. The parent survives
// row virtualization; no message content or credentials enter this bounded store.
type DisclosureChoice = { expanded: boolean; autoCollapse: boolean }
type DisclosureChoices = Map<string, DisclosureChoice>
const DisclosureContext = React.createContext<DisclosureChoices | null>(null)

function rememberChoice(choices: DisclosureChoices | null, identity: string | undefined, choice: DisclosureChoice) {
  if (!identity || !choices) return
  choices.delete(identity)
  choices.set(identity, choice)
  if (choices.size > 512) choices.delete(choices.keys().next().value!)
}

export function ChatProcessDisclosureProvider({ children }: { children: React.ReactNode }) {
  const [choices] = React.useState<DisclosureChoices>(() => new Map())
  return <DisclosureContext.Provider value={choices}>{children}</DisclosureContext.Provider>
}

export function useChatProcessDisclosure({ identity, autoCollapse, forceOpen }: {
  identity?: string
  autoCollapse: boolean
  forceOpen: boolean
}) {
  const choices = React.useContext(DisclosureContext)
  const rootRef = React.useRef<HTMLDivElement>(null)
  const buttonRef = React.useRef<HTMLButtonElement>(null)
  const [manual, setManual] = React.useState<DisclosureChoice | undefined>(() => identity ? choices?.get(identity) : undefined)
  const [automaticOpen, setAutomaticOpen] = React.useState(!autoCollapse)
  const previousAutoCollapse = React.useRef(autoCollapse)
  const manualExpanded = manual && manual.autoCollapse === autoCollapse ? manual.expanded : undefined
  const expanded = forceOpen || (manualExpanded ?? automaticOpen)
  React.useLayoutEffect(() => {
    if (previousAutoCollapse.current === autoCollapse) return
    previousAutoCollapse.current = autoCollapse
    if (!autoCollapse) { setAutomaticOpen(true); return }
    const root = rootRef.current
    let disposed = false
    const onInteractionEnd = () => queueMicrotask(attemptCollapse)
    function cleanup() {
      disposed = true
      root?.removeEventListener("focusout", onInteractionEnd)
      document.removeEventListener("selectionchange", onInteractionEnd)
    }
    function attemptCollapse() {
      if (disposed) return
      const selection = window.getSelection()
      const interacting = root?.contains(document.activeElement) && document.activeElement !== buttonRef.current
      const selecting = root && selection && !selection.isCollapsed && selection.containsNode(root, true)
      if (interacting || selecting) { setAutomaticOpen(true); return }
      setAutomaticOpen(false)
      cleanup()
    }
    root?.addEventListener("focusout", onInteractionEnd)
    document.addEventListener("selectionchange", onInteractionEnd)
    attemptCollapse()
    return cleanup
  }, [autoCollapse])
  React.useLayoutEffect(() => {
    // A provisional row may acquire its canonical identity before remounting.
    if (manual?.autoCollapse === autoCollapse) rememberChoice(choices, identity, manual)
  }, [autoCollapse, choices, identity, manual])
  const toggle = () => {
    const next = !expanded
    if (!next) buttonRef.current?.focus({ preventScroll: true })
    const choice = { expanded: next, autoCollapse }
    setManual(choice)
    rememberChoice(choices, identity, choice)
  }
  return { rootRef, buttonRef, expanded, toggle }
}

export function ChatProcessButton({ expanded, disabled, duration, buttonRef, controls, onToggle }: {
  expanded: boolean
  disabled: boolean
  duration?: string | null
  buttonRef: React.Ref<HTMLButtonElement>
  controls: string
  onToggle: () => void
}) {
  const { t } = useTranslation()
  return <button ref={buttonRef} type="button" aria-expanded={expanded} aria-controls={controls}
    disabled={disabled} onClick={onToggle} data-chat-process-toggle
    className="mb-3 flex max-w-full items-center gap-1.5 rounded-sm py-1 text-xs text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-default">
    <ChevronRightIcon aria-hidden="true" className={cn("size-3.5 shrink-0 motion-safe:transition-transform", expanded && "rotate-90")} />
    <span>{duration ? t("presentation.processDuration", { duration }) : t("presentation.process")}</span>
  </button>
}
