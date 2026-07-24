import * as React from "react"
import { Badge } from "@/components/ui/badge"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"
import type { ToolCallView } from "@/features/chat/chat-pane-state"
import { objectValue, parseJsonObject, stringValue } from "@/features/chat/model/chat-parsing"
import { i18n } from "@/lib/i18n/i18n"
import { cn } from "@/lib/utils"
import {
  CheckCircle2Icon,
  ChevronDownIcon,
  CircleIcon,
  ListTodoIcon,
  LoaderCircleIcon,
} from "lucide-react"

type PlanStep = {
  step: string
  status: "pending" | "in_progress" | "completed"
}

function parsePlan(tool: ToolCallView) {
  const input = parseJsonObject(tool.input)
  const plan = Array.isArray(input?.plan)
    ? input.plan.flatMap((candidate) => {
        const item = objectValue(candidate)
        const step = stringValue(item?.step).trim()
        const status = stringValue(item?.status)
        if (
          !step ||
          (status !== "pending" && status !== "in_progress" && status !== "completed")
        ) {
          return []
        }
        return [{ step, status } satisfies PlanStep]
      })
    : []
  return {
    explanation: stringValue(input?.explanation).trim(),
    plan,
  }
}

export function AgentPlanPanel({ tool }: { tool: ToolCallView | null }) {
  const parsed = React.useMemo(() => (tool ? parsePlan(tool) : null), [tool])
  const completed = parsed?.plan.filter((item) => item.status === "completed").length ?? 0
  const total = parsed?.plan.length ?? 0
  const [open, setOpen] = React.useState(true)

  if (!tool || !parsed || total === 0) return null

  return (
    <div className="border-t border-sidebar-border/70 bg-sidebar/80 px-3 py-2 backdrop-blur-sm">
      <Collapsible open={open} onOpenChange={setOpen}>
        <CollapsibleTrigger asChild>
          <button
            type="button"
            className="group flex w-full items-center gap-2 rounded-lg px-1 py-1 text-left text-xs text-sidebar-foreground/75 hover:text-sidebar-foreground"
          >
            <ListTodoIcon className="size-3.5" />
            <span className="font-medium">{i18n.t("chat.plan.title")}</span>
            <Badge
              variant="outline"
              className="h-5 rounded-full border-sidebar-border bg-sidebar-accent/60 px-1.5 text-[10px]"
            >
              {i18n.t("chat.plan.progress", { completed, total })}
            </Badge>
            <ChevronDownIcon className="ml-auto size-3.5 -rotate-90 transition-transform group-data-[state=open]:rotate-0" />
          </button>
        </CollapsibleTrigger>
        <CollapsibleContent className="animated-collapsible-content">
          <div className="mt-2 max-h-52 space-y-2 overflow-y-auto rounded-lg border border-sidebar-border/70 bg-background/55 px-3 py-2.5">
            {parsed.explanation ? (
              <p className="text-[11px] leading-5 text-foreground/55">
                {parsed.explanation}
              </p>
            ) : null}
            <ol className="space-y-2">
              {parsed.plan.map((item, index) => (
                <li
                  key={`${index}-${item.step}`}
                  className={cn(
                    "flex items-start gap-2 text-xs leading-5",
                    item.status === "completed"
                      ? "text-foreground/45"
                      : "text-foreground/75"
                  )}
                >
                  {item.status === "completed" ? (
                    <CheckCircle2Icon className="mt-0.5 size-3.5 shrink-0 text-emerald-600 dark:text-emerald-400" />
                  ) : item.status === "in_progress" ? (
                    <LoaderCircleIcon className="mt-0.5 size-3.5 shrink-0 animate-spin text-sky-600 dark:text-sky-400" />
                  ) : (
                    <CircleIcon className="mt-0.5 size-3.5 shrink-0 text-foreground/30" />
                  )}
                  <span className={cn(item.status === "completed" && "line-through")}>
                    {item.step}
                  </span>
                </li>
              ))}
            </ol>
          </div>
        </CollapsibleContent>
      </Collapsible>
    </div>
  )
}
