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
  detail: string
  icon: React.ComponentType<{ className?: string }>
  tone?: "green" | "amber" | "blue" | "indigo"
}

export function AppMetricPage({
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
    <div className="min-w-0 space-y-6">
      <section className="space-y-2">
        <p className="text-muted-foreground text-xs font-semibold tracking-[0.18em] uppercase">
          {eyebrow}
        </p>
        <h1 className="text-3xl font-semibold tracking-tight">{title}</h1>
        <p className="text-muted-foreground max-w-3xl text-sm leading-6">
          {subtitle}
        </p>
      </section>

      <section className="grid grid-cols-1 gap-2 sm:grid-cols-3 sm:gap-4">
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
    <Card className="min-w-0 border-border/80 bg-muted/40 py-0 sm:py-4 shadow-none transition-colors hover:bg-muted/60">
      <CardContent className="grid grid-cols-2 items-center gap-x-3 p-3 sm:block sm:p-5">
        <div className="text-muted-foreground flex items-start justify-between gap-1 text-[10px] font-semibold tracking-wide uppercase sm:text-xs sm:tracking-wider">
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
        <p className="wrap-anywhere text-right text-2xl sm:text-left font-semibold sm:mt-3 sm:text-3xl">
          {metric.value}
        </p>
        <p className="text-muted-foreground col-span-2 mt-1 wrap-anywhere text-[11px] leading-4 sm:text-xs">
          {metric.detail}
        </p>
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
