import {
  CartesianGrid,
  Line,
  LineChart,
  XAxis,
  YAxis,
} from "recharts"

import { EmptyState } from "@/components/app/empty-state"
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart"
import { cn } from "@/lib/utils"

export type AppLineChartSeries = {
  key: string
  label: string
  color: string
}

export type AppLineChartDatum = {
  label: string
} & Record<string, string | number>

export function AppLineChart({
  data,
  series,
  valueFormatter = formatCompactValue,
  className,
}: {
  data: AppLineChartDatum[]
  series: AppLineChartSeries[]
  valueFormatter?: (value: number) => string
  className?: string
}) {
  const hasData = data.some((datum) =>
    series.some((item) => Number(datum[item.key] ?? 0) > 0),
  )

  if (!hasData) {
    return (
      <EmptyState
        title="暂无趋势数据"
        detail="产生模型调用后，这里会展示按月聚合的真实用量趋势。"
        className={className}
      />
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
    <ChartContainer config={config} className={cn("min-h-72 w-full", className)}>
      <LineChart data={data} margin={{ top: 16, right: 18, bottom: 4, left: 0 }}>
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
              indicator="line"
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
          <Line
            key={item.key}
            dataKey={item.key}
            type="monotone"
            stroke={`var(--color-${item.key})`}
            strokeWidth={2.5}
            dot={false}
            activeDot={{ r: 4 }}
          />
        ))}
      </LineChart>
    </ChartContainer>
  )
}

function formatCompactValue(value: number) {
  return new Intl.NumberFormat(undefined, {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(value)
}
