import * as React from "react"
import { Search } from "lucide-react"

import { useAppHeader } from "@/app/shell/app-header-context"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"

export type MetricCard = {
  label: string
  value: string
  detail: string
  icon: React.ComponentType<{ className?: string }>
  tone?: "green" | "amber" | "blue" | "indigo"
}

export function AgentProductPage({
  eyebrow,
  title,
  subtitle,
  metrics,
  headerActions,
  children,
}: {
  eyebrow: string
  title: string
  subtitle: string
  metrics: MetricCard[]
  headerActions?: React.ReactNode
  children: React.ReactNode
}) {
  const { setHeaderContent } = useAppHeader()

  React.useEffect(() => {
    setHeaderContent(headerActions ? { trailing: headerActions } : null)
    return () => setHeaderContent(null)
  }, [headerActions, setHeaderContent])

  return (
    <div className="space-y-6">
      <section className="space-y-2">
        <p className="text-muted-foreground text-xs font-semibold tracking-[0.18em] uppercase">
          {eyebrow}
        </p>
        <h1 className="text-3xl font-semibold tracking-tight">{title}</h1>
        <p className="text-muted-foreground max-w-3xl text-sm leading-6">{subtitle}</p>
      </section>

      <section className="grid gap-4 md:grid-cols-3">
        {metrics.map((metric) => (
          <MetricPanel key={metric.label} metric={metric} />
        ))}
      </section>

      {children}
    </div>
  )
}

function MetricPanel({ metric }: { metric: MetricCard }) {
  const Icon = metric.icon
  return (
    <Card className="border-border/80 bg-muted/40 shadow-none transition-colors hover:bg-muted/60">
      <CardContent className="p-5">
        <div className="text-muted-foreground flex items-center justify-between text-xs font-semibold tracking-wider uppercase">
          <span>{metric.label}</span>
          <Icon
            className={cn(
              "size-4",
              metric.tone === "green" && "text-emerald-500",
              metric.tone === "amber" && "text-amber-500",
              metric.tone === "blue" && "text-sky-500",
              metric.tone === "indigo" && "text-indigo-500"
            )}
          />
        </div>
        <p className="mt-3 text-3xl font-semibold">{metric.value}</p>
        <p className="text-muted-foreground mt-1 text-xs">{metric.detail}</p>
      </CardContent>
    </Card>
  )
}

export function WorkbenchCard({
  title,
  description,
  icon: Icon,
  actions,
  children,
  className,
}: {
  title: string
  description?: string
  icon?: React.ComponentType<{ className?: string }>
  actions?: React.ReactNode
  children: React.ReactNode
  className?: string
}) {
  return (
    <Card className={cn("border-border/80 bg-muted/35 shadow-none", className)}>
      <CardHeader className="flex flex-row items-start justify-between gap-4 border-b border-border/70">
        <div className="flex min-w-0 items-start gap-3">
          {Icon ? (
            <div className="bg-background flex size-9 shrink-0 items-center justify-center rounded-md border border-border">
              <Icon className="text-muted-foreground size-4" />
            </div>
          ) : null}
          <div className="min-w-0">
            <CardTitle className="text-base">{title}</CardTitle>
            {description ? <CardDescription className="mt-1">{description}</CardDescription> : null}
          </div>
        </div>
        {actions}
      </CardHeader>
      <CardContent className="p-4">{children}</CardContent>
    </Card>
  )
}

export function ErrorNotice({ message }: { message: string | null }) {
  if (!message) return null
  return (
    <div className="border-destructive/40 bg-destructive/10 text-destructive rounded-md border px-4 py-3 text-sm">
      {message}
    </div>
  )
}

export function EmptyState({ title, detail }: { title: string; detail: string }) {
  return (
    <div className="text-muted-foreground rounded-md border border-dashed border-border bg-background/60 p-6 text-sm">
      <p className="text-foreground font-medium">{title}</p>
      <p className="mt-1">{detail}</p>
    </div>
  )
}

export function StatusBadge({ status }: { status: string }) {
  const active = status === "active" || status === "triggered" || status === "enabled"
  return (
    <Badge
      variant="outline"
      className={cn("bg-background/70 text-xs", active ? "text-emerald-500" : "text-muted-foreground")}
    >
      <span className={cn("mr-1 size-1.5 rounded-full", active ? "bg-emerald-500" : "bg-muted-foreground")} />
      {status}
    </Badge>
  )
}

export function SearchBar({
  value,
  onChange,
  placeholder,
}: {
  value: string
  onChange: (value: string) => void
  placeholder: string
}) {
  return (
    <div className="relative">
      <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2" />
      <Input
        className="bg-background/70 pl-9"
        placeholder={placeholder}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </div>
  )
}

export function toggleSet(current: Set<string>, id: string, checked: boolean) {
  const next = new Set(current)
  if (checked) next.add(id)
  else next.delete(id)
  return next
}
