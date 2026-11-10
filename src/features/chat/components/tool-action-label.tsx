import { FilePenLineIcon, FileSearchIcon, FileTextIcon, ListTreeIcon, SearchIcon, TerminalSquareIcon, WrenchIcon } from "lucide-react"
import type { ToolCallAction } from "../model/tool-call-presentation"

const icons = {
  read: FileTextIcon,
  write: FilePenLineIcon,
  list: ListTreeIcon,
  search: SearchIcon,
  stat: FileSearchIcon,
  terminal: TerminalSquareIcon,
  tool: WrenchIcon,
}

export function ToolActionIcon({ kind }: { kind: ToolCallAction["kind"] }) {
  const Icon = icons[kind]
  return <Icon aria-hidden="true" className="size-3.5 shrink-0" />
}

/** A label inside the existing disclosure button, never an unverified file link. */
export function ToolActionLabel({ action }: { action: ToolCallAction }) {
  return <span className="inline-flex w-full max-w-full min-w-0 items-center gap-1.5 align-middle">
    <span data-tool-action title={action.label} className="max-w-[65%] shrink-0 truncate">{action.label}</span>
    {action.target ? <>{" "}<span data-tool-target data-target-kind={action.kind} title={action.target}
      className="min-w-0 truncate rounded border border-border/65 bg-muted/35 px-1.5 py-0.5 text-[12px] leading-4 text-foreground/75">
      {action.kind === "terminal" ? <code className="font-mono">{action.target}</code> : action.target}
    </span></> : null}
  </span>
}
