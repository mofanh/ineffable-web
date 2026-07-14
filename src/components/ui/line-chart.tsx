import { CartesianGrid, Line, LineChart, XAxis, YAxis } from "recharts"
import { useTranslation } from "react-i18next"

import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart"
import { cn } from "@/lib/utils"
import { getCurrentLocale } from "@/lib/i18n/i18n"

export type UiLineChartSeries = {
  key: string
  label: string
  color: string
}

export type UiLineChartDatum = {
  label: string
} & Record<string, string | number>

export function LineChartPanel({
  data,
  series,
  height = 288,
  valueFormatter = formatCompactValue,
  emptyTitle,
  emptyDescription,
  className,
}: {
  data: UiLineChartDatum[]
  series: UiLineChartSeries[]
  height?: number
  valueFormatter?: (value: number) => string
  emptyTitle?: string
  emptyDescription?: string
  className?: string
}) {
  const { t } = useTranslation()
  const resolvedEmptyTitle = emptyTitle ?? t("common.chart.trendEmpty")
  const resolvedEmptyDescription =
    emptyDescription ?? t("common.chart.trendEmptyDescription")
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
        <p className="font-medium text-foreground">{resolvedEmptyTitle}</p>
        <p className="mt-1 leading-6">{resolvedEmptyDescription}</p>
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
      <LineChart
        data={data}
        margin={{ top: 16, right: 18, bottom: 4, left: 0 }}
      >
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
  return new Intl.NumberFormat(getCurrentLocale(), {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(value)
}
