import * as React from "react"

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"

type ModuleDashboardMetric = {
  label: string
  value: string
  detail: string
}

type ModuleDashboardPageProps = {
  title: string
  subtitle: string
  metrics: [ModuleDashboardMetric, ModuleDashboardMetric, ModuleDashboardMetric]
  highlights: string[]
  children?: React.ReactNode
}

export function ModuleDashboardPage({
  title,
  subtitle,
  metrics,
  highlights,
  children,
}: ModuleDashboardPageProps) {
  return (
    <>
      <div className="grid auto-rows-min gap-4 md:grid-cols-3">
        {metrics.map((metric) => (
          <Card key={metric.label} className="bg-muted/50">
            <CardHeader>
              <CardTitle className="text-sm">{metric.label}</CardTitle>
              <CardDescription>{metric.detail}</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-semibold">{metric.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card className="bg-muted/50 min-h-screen flex-1 md:min-h-min">
        <CardHeader>
          <CardTitle>{title}</CardTitle>
          <CardDescription>{subtitle}</CardDescription>
        </CardHeader>
        <CardContent>
          <ul className="space-y-3">
            {highlights.map((item) => (
              <li key={item} className="text-muted-foreground text-sm leading-6">
                {item}
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      {children}
    </>
  )
}
