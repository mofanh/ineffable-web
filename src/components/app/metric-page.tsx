import * as React from "react"
import { Search } from "lucide-react"

import { useAppHeader } from "@/app/shell/app-header-context"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"

export type AppMetricCard = {
  label: string
  value: string
  detail?: string
  icon: React.ComponentType<{ className?: string }>
  tone?: "green" | "amber" | "blue" | "indigo"
}

export function AppMetricPage({
  title,
  subtitle,
  metrics,
  headerActions,
  children,
}: {
  title: string
  subtitle: string
  metrics: AppMetricCard[]
  headerActions?: React.ReactNode
  children: React.ReactNode
}) {
  const { setHeaderContent } = useAppHeader()

  React.useEffect(() => {
    setHeaderContent(headerActions ? { trailing: headerActions } : null)
    return () => setHeaderContent(null)
  }, [headerActions, setHeaderContent])

  return (
    <div data-slot="metric-page" className="@container/metric-page min-w-0 space-y-4">
      <section className="space-y-1">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">{title}</h1>
        <p className="text-muted-foreground max-w-3xl text-sm leading-6">
          {subtitle}
        </p>
      </section>

      <section data-slot="metric-page-metrics" className={cn("grid grid-cols-1 gap-2", metrics.length === 2 ? "@min-[40rem]/metric-page:grid-cols-2" : metrics.length === 1 ? "grid-cols-1" : "@min-[40rem]/metric-page:grid-cols-3")}>
        {metrics.map((metric) => (
          <MetricPanel key={metric.label} metric={metric} />
        ))}
      </section>

      {children}
    </div>
  )
}

function MetricPanel({ metric }: { metric: AppMetricCard }) {
  const Icon = metric.icon
  return (
    <Card className="min-w-0 border-border/80 bg-card py-0 shadow-none">
      <CardContent className="grid grid-cols-2 items-center gap-x-3 gap-y-1 p-3">
        <div className="flex min-w-0 items-center gap-2 text-xs font-medium text-muted-foreground">
          <Icon
            className={cn(
              "size-4 shrink-0",
              metric.tone === "green" && "text-emerald-500",
              metric.tone === "amber" && "text-amber-500",
              metric.tone === "blue" && "text-sky-500",
              metric.tone === "indigo" && "text-indigo-500"
            )}
          />
          <span className="min-w-0 wrap-anywhere">{metric.label}</span>
        </div>
        <p className="min-w-0 wrap-anywhere text-right text-xl leading-6 font-semibold tabular-nums text-foreground">
          {metric.value}
        </p>
        {metric.detail ? <p className="col-span-2 wrap-anywhere text-xs leading-4 text-muted-foreground">
          {metric.detail}
        </p> : null}
      </CardContent>
    </Card>
  )
}

export function AppSectionCard({
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
      <CardHeader className="flex flex-col items-start justify-between gap-4 border-b border-border/70 sm:flex-row">
        <div className="flex min-w-0 items-start gap-3">
          {Icon ? (
            <div className="bg-background flex size-9 shrink-0 items-center justify-center rounded-md border border-border">
              <Icon className="text-muted-foreground size-4" />
            </div>
          ) : null}
          <div className="min-w-0">
            <CardTitle className="text-base">{title}</CardTitle>
            {description ? (
              <CardDescription className="mt-1">{description}</CardDescription>
            ) : null}
          </div>
        </div>
        {actions}
      </CardHeader>
      <CardContent className="p-4">{children}</CardContent>
    </Card>
  )
}

export function AppSearchBar({
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
