import * as React from "react"
import { ChevronRightIcon } from "lucide-react"
import { useTranslation } from "react-i18next"
import { cn } from "@/lib/utils"
import type { AssistantProcessGroup } from "../model/assistant-process"

// A bounded UI preference store per mounted panel. No message bodies or business state.
type DisclosureChoice = { expanded: boolean; autoCollapse: boolean }
type DisclosureChoices = Map<string, DisclosureChoice>
const DisclosureContext = React.createContext<DisclosureChoices | null>(null)

function rememberChoice(choices: DisclosureChoices | null, identity: string, choice: DisclosureChoice) {
  if (!choices) return
  choices.delete(identity)
  choices.set(identity, choice)
  if (choices.size > 512) choices.delete(choices.keys().next().value!)
}

export function ChatProcessDisclosureProvider({ children }: { children: React.ReactNode }) {
  const [choices] = React.useState<DisclosureChoices>(() => new Map())
  return <DisclosureContext.Provider value={choices}>{children}</DisclosureContext.Provider>
}

function hasProcessInteraction(root: HTMLElement | null, protectToggle = false) {
  const active = document.activeElement
  const selection = window.getSelection()
  return Boolean(root && ((root.contains(active) && (protectToggle || !(active instanceof Element && active.closest("[data-chat-process-toggle]")))) ||
    (selection && !selection.isCollapsed && selection.containsNode(root, true))))
}

/** Wait before restructuring the window, not just before hiding its rows.
 * Inserting historical tool rows ahead of a selection can otherwise unmount it. */
export function useProcessConsolidation(complete: boolean, rootRef: React.RefObject<HTMLDivElement | null>) {
  const [accepted, setAccepted] = React.useState(complete)
  React.useLayoutEffect(() => {
    if (typeof document === "undefined") return
    const root = rootRef.current
    let disposed = false
    const apply = () => {
      if (!disposed) setAccepted(current => complete && (current || !hasProcessInteraction(root, true)))
    }
    const interactionEnded = () => queueMicrotask(apply)
    root?.addEventListener("focusout", interactionEnded)
    document.addEventListener("selectionchange", interactionEnded)
    apply()
    return () => {
      disposed = true
      root?.removeEventListener("focusout", interactionEnded)
      document.removeEventListener("selectionchange", interactionEnded)
    }
  }, [complete, rootRef])
  return complete && accepted
}

/** One controller for all groups in an assistant entry; tokens do not create
 * timers or per-group virtualizers. Automatic transitions settle before paint. */
export function useChatProcessDisclosures(groups: readonly AssistantProcessGroup[], forceOpen: boolean, rootRef: React.RefObject<HTMLDivElement | null>) {
  const sharedChoices = React.useContext(DisclosureContext)
  const [localChoices] = React.useState<DisclosureChoices>(() => new Map())
  const choices = sharedChoices ?? localChoices
  const previous = React.useRef(new Map(groups.map(group => [group.id, group.autoCollapse])))
  const [deferred, setDeferred] = React.useState<ReadonlySet<string>>(() => new Set())
  const [, rerender] = React.useReducer(value => value + 1, 0)

  React.useLayoutEffect(() => {
    if (typeof document === "undefined") return
    const root = rootRef.current
    let disposed = false
    function applyPolicies() {
      if (disposed) return
      const interacting = hasProcessInteraction(root)
      const nextDeferred = new Set<string>()
      let changed = previous.current.size !== groups.length
      for (const group of groups) {
        const old = previous.current.get(group.id)
        changed ||= old !== group.autoCollapse
        if (group.autoCollapse && (old !== true || deferred.has(group.id)) && interacting) nextDeferred.add(group.id)
      }
      previous.current = new Map(groups.map(group => [group.id, group.autoCollapse]))
      const deferredChanged = nextDeferred.size !== deferred.size || [...nextDeferred].some(id => !deferred.has(id))
      if (deferredChanged) setDeferred(nextDeferred)
      else if (changed) rerender()
    }
    const interactionEnded = () => queueMicrotask(applyPolicies)
    root?.addEventListener("focusout", interactionEnded)
    document.addEventListener("selectionchange", interactionEnded)
    applyPolicies()
    return () => {
      disposed = true
      root?.removeEventListener("focusout", interactionEnded)
      document.removeEventListener("selectionchange", interactionEnded)
    }
  }, [groups, deferred, rootRef])

  const isExpanded = (group: AssistantProcessGroup) => {
    if (forceOpen) return true
    const manual = choices.get(group.id)
    if (manual?.autoCollapse === group.autoCollapse) return manual.expanded
    // Preserve the previous DOM until the layout effect checks focus/selection.
    return !group.autoCollapse || previous.current.get(group.id) !== true || deferred.has(group.id)
  }
  const toggle = (group: AssistantProcessGroup, button: HTMLButtonElement) => {
    if (forceOpen) return
    const expanded = !isExpanded(group)
    if (!expanded) button.focus({ preventScroll: true })
    rememberChoice(choices, group.id, { expanded, autoCollapse: group.autoCollapse })
    rerender()
  }
  return { isExpanded, toggle }
}

export function ChatProcessButton({ expanded, disabled, duration, controls, onToggle }: {
  expanded: boolean
  disabled: boolean
  duration?: string | null
  controls: string
  onToggle: (event: React.MouseEvent<HTMLButtonElement>) => void
}) {
  const { t } = useTranslation()
  return <button type="button" aria-expanded={expanded} aria-controls={controls}
    disabled={disabled} onClick={onToggle} data-chat-process-toggle
    className="mb-3 flex max-w-full items-center gap-1.5 rounded-sm py-1 text-xs text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-default">
    <ChevronRightIcon aria-hidden="true" className={cn("size-3.5 shrink-0 motion-safe:transition-transform", expanded && "rotate-90")} />
    <span>{duration ? t("presentation.processDuration", { duration }) : t("presentation.process")}</span>
  </button>
}
