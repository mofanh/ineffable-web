import { useTranslation } from "react-i18next"

import type {
  AdminModelProfile,
  AdminModelUsageTimeseries,
  AdminUsageGranularity,
  AdminUsageRange,
  AdminUserUsageTimeseries,
} from "@/lib/api/api-client"
import {
  AppLineChart,
  DataState,
  type AppLineChartDatum,
  type AppLineChartSeries,
  type DataStateName,
} from "@/components/app"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import type { AppError } from "@/lib/app/api-errors"
import { getCurrentLocale, i18n } from "@/lib/i18n/i18n"

export const ADMIN_USAGE_RANGES: AdminUsageRange[] = [
  "24h",
  "7d",
  "30d",
  "6m",
  "12m",
]

export type ModelUsageMetric =
  "credits" | "requests" | "tokens" | "failureRate" | "latency"

export type UserUsageMetric = "credits" | "requests" | "tokens"

type Metric = ModelUsageMetric | UserUsageMetric

export function UsageTimeseriesPanel({
  range,
  onRangeChange,
  metric,
  onMetricChange,
  metricOptions,
  granularity,
  state,
  error,
  onRetry,
  empty,
  data,
  series,
}: {
  range: AdminUsageRange
  onRangeChange: (range: AdminUsageRange) => void
  metric: Metric
  onMetricChange: (metric: Metric) => void
  metricOptions: readonly Metric[]
  granularity?: AdminUsageGranularity
  state: DataStateName
  error?: AppError | null
  onRetry: () => void
  empty: boolean
  data: AppLineChartDatum[]
  series: AppLineChartSeries[]
}) {
  const { t } = useTranslation()
  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <Select
            value={range}
            onValueChange={(value) => onRangeChange(value as AdminUsageRange)}
          >
            <SelectTrigger
              size="sm"
              className="min-w-24"
              aria-label={t("system.usageTimeseries.rangeLabel")}
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {ADMIN_USAGE_RANGES.map((value) => (
                <SelectItem key={value} value={value}>
                  {t(`system.usageTimeseries.ranges.${value}`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            value={metric}
            onValueChange={(value) => onMetricChange(value as Metric)}
          >
            <SelectTrigger
              size="sm"
              className="min-w-28"
              aria-label={t("system.usageTimeseries.metricLabel")}
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {metricOptions.map((value) => (
                <SelectItem key={value} value={value}>
                  {t(`system.usageTimeseries.metrics.${value}`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {granularity ? (
          <span className="text-xs text-muted-foreground">
            {t("system.usageTimeseries.granularity", {
              value: t(`system.usageTimeseries.granularities.${granularity}`),
            })}
          </span>
        ) : null}
      </div>
      <DataState
        state={state}
        error={error}
        empty={empty}
        emptyTitle={t("system.usageTimeseries.empty")}
        emptyDescription={t("system.usageTimeseries.emptyDescription")}
        loadingLabel={t("system.usageTimeseries.loading")}
        onRetry={onRetry}
      >
        <AppLineChart
          data={data}
          series={series}
          height={220}
          valueFormatter={(value) => formatUsageMetricValue(metric, value)}
          hasData={!empty}
          emptyTitle={t("system.usageTimeseries.empty")}
          emptyDescription={t("system.usageTimeseries.emptyDescription")}
        />
      </DataState>
    </div>
  )
}

export function buildModelUsageChart(
  models: AdminModelProfile[],
  timeseries: AdminModelUsageTimeseries | null,
  metric: ModelUsageMetric,
) {
  if (!timeseries) return { data: [], series: [] }
  const names = new Map(models.map((model) => [model.id, model.display_name]))
  const totals = new Map<string, number>()
  for (const point of timeseries.points) {
    totals.set(
      point.model_profile_id,
      (totals.get(point.model_profile_id) ?? 0) +
        modelMetricValue(point, metric),
    )
  }
  const modelIds = Array.from(totals)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([modelId]) => modelId)
  const seriesKeys = new Map(
    modelIds.map((modelId, index) => [modelId, `model_${index}`]),
  )
  const buckets = Array.from(
    new Set(timeseries.points.map((point) => point.bucket_start)),
  ).sort()
  const byIdentity = new Map(
    timeseries.points.map((point) => [
      `${point.model_profile_id}\u0000${point.bucket_start}`,
      point,
    ]),
  )
  const data = buckets.map<AppLineChartDatum>((bucket) => {
    const datum: AppLineChartDatum = {
      label: formatUsageBucket(bucket, timeseries.granularity),
    }
    for (const modelId of modelIds) {
      const point = byIdentity.get(`${modelId}\u0000${bucket}`)
      datum[seriesKeys.get(modelId) ?? modelId] = point
        ? modelMetricValue(point, metric)
        : 0
    }
    return datum
  })
  const series = modelIds.map<AppLineChartSeries>((modelId, index) => ({
    key: seriesKeys.get(modelId) ?? modelId,
    label: names.get(modelId) ?? modelId,
    color: `var(--chart-${(index % 5) + 1})`,
  }))
  return { data, series }
}

export function buildUserUsageChart(
  timeseries: AdminUserUsageTimeseries | null,
  metric: UserUsageMetric,
) {
  if (!timeseries) return { data: [], series: [] }
  return {
    data: timeseries.points.map<AppLineChartDatum>((point) => ({
      label: formatUsageBucket(point.bucket_start, timeseries.granularity),
      value:
        metric === "credits"
          ? point.charged_credits
          : metric === "requests"
            ? point.request_count
            : point.raw_total_tokens,
    })),
    series: [
      {
        key: "value",
        label: i18n.t(`system.usageTimeseries.metrics.${metric}`),
        color: "var(--chart-1)",
      },
    ] satisfies AppLineChartSeries[],
  }
}

type ModelPoint = AdminModelUsageTimeseries["points"][number]

function modelMetricValue(point: ModelPoint, metric: ModelUsageMetric) {
  switch (metric) {
    case "credits":
      return point.charged_credits
    case "requests":
      return point.request_count
    case "tokens":
      return point.raw_total_tokens
    case "failureRate":
      return point.request_count > 0
        ? (point.failed_request_count / point.request_count) * 100
        : 0
    case "latency":
      return point.average_latency_ms ?? 0
  }
}

export function formatUsageBucket(
  value: string,
  granularity: AdminUsageGranularity,
) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  const options: Intl.DateTimeFormatOptions =
    granularity === "hour"
      ? { month: "numeric", day: "numeric", hour: "2-digit" }
      : granularity === "day"
        ? { month: "numeric", day: "numeric" }
        : { year: "numeric", month: "short" }
  return new Intl.DateTimeFormat(getCurrentLocale(), options).format(date)
}

export function formatUsageMetricValue(metric: Metric, value: number) {
  if (metric === "failureRate") {
    return `${new Intl.NumberFormat(getCurrentLocale(), { maximumFractionDigits: 1 }).format(value)}%`
  }
  if (metric === "latency") {
    return `${new Intl.NumberFormat(getCurrentLocale(), { maximumFractionDigits: 0 }).format(value)} ms`
  }
  return new Intl.NumberFormat(getCurrentLocale(), {
    notation: "compact",
    maximumFractionDigits: value >= 100 ? 1 : 2,
  }).format(value)
}
