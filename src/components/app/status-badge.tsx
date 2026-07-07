import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"

const statusToneStyles = {
  success: {
    text: "text-emerald-600 dark:text-emerald-400",
    dot: "bg-emerald-500",
  },
  warning: {
    text: "text-amber-600 dark:text-amber-400",
    dot: "bg-amber-500",
  },
  danger: {
    text: "text-destructive",
    dot: "bg-destructive",
  },
  neutral: {
    text: "text-muted-foreground",
    dot: "bg-muted-foreground",
  },
} as const

export type StatusBadgeTone = keyof typeof statusToneStyles

function inferStatusTone(status: string): StatusBadgeTone {
  const normalized = status.trim().toLowerCase()
  if (
    [
      "active",
      "accepted",
      "approved",
      "bound",
      "completed",
      "done",
      "enabled",
      "ready",
      "success",
      "succeeded",
      "triggered",
      "usable",
    ].includes(normalized)
  ) {
    return "success"
  }

  if (
    [
      "pending",
      "queued",
      "running",
      "processing",
      "busy",
      "invited",
      "draft",
    ].includes(normalized)
  ) {
    return "warning"
  }

  if (
    [
      "cancelled",
      "disabled",
      "error",
      "expired",
      "failed",
      "inactive",
      "rejected",
      "removed",
      "revoked",
    ].includes(normalized)
  ) {
    return "danger"
  }

  return "neutral"
}

export function StatusBadge({
  status,
  tone,
  className,
}: {
  status: string
  tone?: StatusBadgeTone
  className?: string
}) {
  const resolvedTone = tone ?? inferStatusTone(status)
  const styles = statusToneStyles[resolvedTone]

  return (
    <Badge
      variant="outline"
      className={cn("bg-background/70 text-xs", styles.text, className)}
    >
      <span className={cn("mr-1 size-1.5 rounded-full", styles.dot)} />
      {status}
    </Badge>
  )
}
