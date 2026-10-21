import * as React from "react"
import { ChevronRightIcon } from "lucide-react"
import { useTranslation } from "react-i18next"
import { cn } from "@/lib/utils"

// Per mounted chat panel, independent of business/run state. The parent survives
// row virtualization; no message content or credentials enter this bounded store.
type DisclosureChoices = Map<string, boolean>
const DisclosureContext = React.createContext<DisclosureChoices | null>(null)

function rememberChoice(choices: DisclosureChoices | null, identity: string | undefined, expanded: boolean) {
  if (!identity || !choices) return
  choices.delete(identity)
  choices.set(identity, expanded)
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
  const [manual, setManual] = React.useState<boolean | undefined>(() => identity ? choices?.get(identity) : undefined)
  const [automaticOpen, setAutomaticOpen] = React.useState(!autoCollapse)
  const previousAutoCollapse = React.useRef(autoCollapse)
  const expanded = forceOpen || (manual ?? automaticOpen)
  React.useLayoutEffect(() => {
    if (previousAutoCollapse.current === autoCollapse) return
    previousAutoCollapse.current = autoCollapse
    if (!autoCollapse) { setAutomaticOpen(true); return }
    const root = rootRef.current
    const scroller = root?.closest<HTMLElement>("[data-chat-scroll-region]")
    const selection = window.getSelection()
    const interacting = root?.contains(document.activeElement) && document.activeElement !== buttonRef.current
    const selecting = selection && !selection.isCollapsed &&
      (root?.contains(selection.anchorNode) || root?.contains(selection.focusNode))
    const readingAboveTail = scroller && scroller.scrollHeight - scroller.clientHeight - scroller.scrollTop > 80
    setAutomaticOpen(Boolean(interacting || selecting || readingAboveTail))
  }, [autoCollapse])
  React.useLayoutEffect(() => {
    // A provisional row may acquire its canonical identity before remounting.
    if (manual !== undefined) rememberChoice(choices, identity, manual)
  }, [choices, identity, manual])
  const toggle = () => {
    const next = !expanded
    if (!next) buttonRef.current?.focus({ preventScroll: true })
    setManual(next)
    rememberChoice(choices, identity, next)
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
