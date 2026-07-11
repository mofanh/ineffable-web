import {
  Bar,
  BarChart,
  CartesianGrid,
  XAxis,
  YAxis,
} from "recharts"

import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart"
import { cn } from "@/lib/utils"

export type UiBarChartSeries = {
  key: string
  label: string
  color: string
}

export type UiBarChartDatum = {
  label: string
} & Record<string, string | number>

export function BarChartPanel({
  data,
  series,
  height = 288,
  valueFormatter = formatCompactValue,
  emptyTitle = "暂无概览数据",
  emptyDescription = "产生数据后，这里会展示按维度聚合的概览。",
  className,
}: {
  data: UiBarChartDatum[]
  series: UiBarChartSeries[]
  height?: number
  valueFormatter?: (value: number) => string
  emptyTitle?: string
  emptyDescription?: string
  className?: string
}) {
  const hasData = data.some((datum) =>
    series.some((item) => Number(datum[item.key] ?? 0) > 0),
  )

  if (!hasData) {
    return (
      <div
        className={cn(
          "rounded-md border border-dashed border-border bg-background/60 p-6 text-sm text-muted-foreground",
          className,
        )}
      >
        <p className="font-medium text-foreground">{emptyTitle}</p>
        <p className="mt-1 leading-6">{emptyDescription}</p>
      </div>
    )
  }

  const config = series.reduce<ChartConfig>((current, item) => {
    current[item.key] = {
      label: item.label,
      color: item.color,
    }
    return current
  }, {})

  return (
    <ChartContainer
      config={config}
      className={cn("w-full", className)}
      style={{ height }}
    >
      <BarChart data={data} margin={{ top: 16, right: 18, bottom: 4, left: 0 }}>
        <CartesianGrid vertical={false} />
        <XAxis
          dataKey="label"
          tickLine={false}
          axisLine={false}
          tickMargin={10}
        />
        <YAxis
          tickLine={false}
          axisLine={false}
          tickMargin={10}
          tickFormatter={(value) => valueFormatter(Number(value))}
        />
        <ChartTooltip
          cursor={false}
          content={
            <ChartTooltipContent
              indicator="dashed"
              formatter={(value, name) => (
                <div className="flex min-w-36 items-center justify-between gap-4">
                  <span className="text-muted-foreground">
                    {config[String(name)]?.label ?? String(name)}
                  </span>
                  <span className="font-mono font-medium text-foreground">
                    {valueFormatter(Number(value))}
                  </span>
                </div>
              )}
            />
          }
        />
        {series.map((item) => (
          <Bar
            key={item.key}
            dataKey={item.key}
            fill={`var(--color-${item.key})`}
            radius={[4, 4, 0, 0]}
          />
        ))}
      </BarChart>
    </ChartContainer>
  )
}

function formatCompactValue(value: number) {
  return new Intl.NumberFormat(undefined, {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(value)
}
