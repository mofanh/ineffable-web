import * as React from "react"
import { CheckCircle2Icon, InfoIcon, TriangleAlertIcon, XCircleIcon } from "lucide-react"

import { cn } from "@/lib/utils"

export type NoticeTone = "success" | "error" | "warning" | "info"

const noticeStyles: Record<NoticeTone, string> = {
  success: "border-emerald-500/25 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  error: "border-destructive/30 bg-destructive/10 text-destructive",
  warning: "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300",
  info: "border-sky-500/25 bg-sky-500/10 text-sky-700 dark:text-sky-300",
}

const noticeIcons = {
  success: CheckCircle2Icon,
  error: XCircleIcon,
  warning: TriangleAlertIcon,
  info: InfoIcon,
} satisfies Record<NoticeTone, React.ComponentType<{ className?: string }>>

export function Notice({
  tone = "info",
  title,
  children,
  className,
}: {
  tone?: NoticeTone
  title?: string
  children: React.ReactNode
  className?: string
}) {
  const Icon = noticeIcons[tone]

  return (
    <div
      role={tone === "error" ? "alert" : "status"}
      className={cn(
        "flex gap-3 rounded-md border px-3 py-2 text-sm",
        noticeStyles[tone],
        className
      )}
    >
      <Icon className="mt-0.5 size-4 shrink-0" />
      <div className="min-w-0">
        {title ? <p className="font-medium">{title}</p> : null}
        <div className={cn(title && "mt-0.5")}>{children}</div>
      </div>
    </div>
  )
}
