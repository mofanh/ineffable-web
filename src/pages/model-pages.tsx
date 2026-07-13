import * as React from "react"
import {
  BotIcon,
  BrainCircuitIcon,
  BracesIcon,
  EyeIcon,
  GaugeIcon,
  MessageSquareTextIcon,
  SparklesIcon,
  WrenchIcon,
} from "lucide-react"

import {
  AppListToolbar,
  AppMetricPage,
  AppSearchBar,
  DataState,
  Notice,
  StatusBadge,
} from "@/components/app"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { useAppSession } from "@/features/auth/app-session"
import {
  listModelProfiles,
  type ModelProfile,
} from "@/features/models/api/model-api"
import { useApiResource } from "@/lib/app/use-api-resource"

function formatTokenLimit(value?: number | null) {
  if (!value) return "未设置"
  if (value >= 1_000_000) return `${(value / 1_000_000).toLocaleString("zh-CN")}M`
  if (value >= 1_000) return `${(value / 1_000).toLocaleString("zh-CN")}K`
  return value.toLocaleString("zh-CN")
}

function capabilityItems(profile: ModelProfile) {
  return [
    { label: "工具调用", enabled: profile.supports_tool_calls, icon: WrenchIcon },
    { label: "深度推理", enabled: profile.supports_reasoning, icon: BrainCircuitIcon },
    { label: "结构化输出", enabled: profile.supports_json_schema, icon: BracesIcon },
    { label: "视觉理解", enabled: profile.supports_vision, icon: EyeIcon },
  ]
}

function ModelProfileCard({ profile }: { profile: ModelProfile }) {
  const capabilities = capabilityItems(profile)

  return (
    <Card className="border-border/80 bg-muted/25 py-0 shadow-none transition-colors hover:bg-muted/40">
      <CardHeader className="border-b border-border/70 py-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-start gap-3">
            <div className="flex size-9 shrink-0 items-center justify-center rounded-lg border bg-background">
              <BotIcon className="size-4 text-muted-foreground" />
            </div>
            <div className="min-w-0">
              <CardTitle className="truncate">{profile.display_name}</CardTitle>
              <CardDescription className="mt-1 truncate font-mono text-xs">
                {profile.id}
              </CardDescription>
            </div>
          </div>
          <StatusBadge status="usable" label="当前套餐可用" />
        </div>
      </CardHeader>

      <CardContent className="space-y-4 py-4">
        <div className="grid grid-cols-2 gap-3 rounded-lg border bg-background/70 p-3 text-xs sm:grid-cols-4">
          <div>
            <p className="text-muted-foreground">上下文窗口</p>
            <p className="mt-1 font-semibold">{formatTokenLimit(profile.context_window_tokens)}</p>
          </div>
          <div>
            <p className="text-muted-foreground">单次输出</p>
            <p className="mt-1 font-semibold">{formatTokenLimit(profile.max_output_tokens)}</p>
          </div>
          <div>
            <p className="text-muted-foreground">请求上限</p>
            <p className="mt-1 font-semibold">{formatTokenLimit(profile.max_tokens_per_request)}</p>
          </div>
          <div>
            <p className="text-muted-foreground">用量倍率</p>
            <p className="mt-1 font-semibold">×{profile.usage_multiplier.toLocaleString("zh-CN")}</p>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          {capabilities.map((capability) => {
            const Icon = capability.icon
            return (
              <Badge
                key={capability.label}
                variant="outline"
                className={capability.enabled ? "bg-background" : "text-muted-foreground opacity-55"}
              >
                <Icon />
                {capability.enabled ? capability.label : `不支持${capability.label}`}
              </Badge>
            )
          })}
        </div>

        <p className="text-xs leading-5 text-muted-foreground">
          计费倍率：输入 ×{profile.input_multiplier}、输出 ×{profile.output_multiplier}、推理 ×
          {profile.reasoning_multiplier}、缓存输入 ×{profile.cached_input_multiplier}
        </p>
      </CardContent>
    </Card>
  )
}

export function ModelCenterPage() {
  const { accessToken } = useAppSession()
  const [query, setQuery] = React.useState("")
  const loadProfiles = React.useCallback(
    () => listModelProfiles(accessToken || ""),
    [accessToken]
  )
  const resource = useApiResource({
    enabled: Boolean(accessToken),
    load: loadProfiles,
    errorMessage: "模型目录加载失败。",
  })
  const profiles = React.useMemo(() => resource.data?.profiles ?? [], [resource.data?.profiles])
  const metricValue = React.useCallback(
    (value: number) => (resource.state === "success" ? String(value) : "—"),
    [resource.state]
  )
  const filteredProfiles = React.useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase()
    if (!normalizedQuery) return profiles
    return profiles.filter((profile) =>
      `${profile.display_name} ${profile.id}`.toLowerCase().includes(normalizedQuery)
    )
  }, [profiles, query])
  const openAssistant = React.useCallback(() => {
    window.dispatchEvent(new Event("ineffable:right-sidebar:open"))
  }, [])

  return (
    <AppMetricPage
      eyebrow="Models"
      title="模型中心"
      subtitle="这里展示当前账号套餐真正可见且可用的模型。模型能力、上下文限制和用量倍率均来自 Gateway Model Profile。"
      metrics={[
        {
          label: "可用模型",
          value: metricValue(profiles.length),
          detail: "当前套餐可见",
          icon: BotIcon,
          tone: "blue",
        },
        {
          label: "工具调用",
          value: metricValue(profiles.filter((profile) => profile.supports_tool_calls).length),
          detail: "可执行工作区任务",
          icon: WrenchIcon,
          tone: "green",
        },
        {
          label: "推理模型",
          value: metricValue(profiles.filter((profile) => profile.supports_reasoning).length),
          detail: "支持深度推理",
          icon: BrainCircuitIcon,
          tone: "indigo",
        },
      ]}
      headerActions={
        <Button type="button" size="sm" onClick={openAssistant}>
          <MessageSquareTextIcon />
          打开 AI 助手
        </Button>
      }
    >
      <Notice title="如何使用模型">
        打开右侧 AI 助手，在输入区底部选择本目录中的模型。具体可见范围和请求额度由当前套餐策略决定。
      </Notice>

      <section className="overflow-hidden rounded-xl border border-border/80 bg-muted/15">
        <AppListToolbar
          search={
            <AppSearchBar
              value={query}
              onChange={setQuery}
              placeholder="搜索模型名称或 ID"
            />
          }
          filters={
            <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
              <GaugeIcon className="size-3.5" />
              {filteredProfiles.length} 个结果
            </span>
          }
        />

        <div className="p-4">
          <DataState
            state={resource.state}
            error={resource.error}
            empty={profiles.length === 0}
            emptyTitle="当前套餐暂无可用模型"
            emptyDescription="请联系管理员检查套餐的模型可见性与可用性设置。"
            onRetry={resource.reload}
          >
            {filteredProfiles.length ? (
              <div className="grid gap-4 xl:grid-cols-2">
                {filteredProfiles.map((profile) => (
                  <ModelProfileCard key={profile.id} profile={profile} />
                ))}
              </div>
            ) : (
              <div className="rounded-lg border border-dashed p-8 text-center">
                <SparklesIcon className="mx-auto size-5 text-muted-foreground" />
                <p className="mt-3 text-sm font-medium">没有匹配的模型</p>
                <p className="mt-1 text-xs text-muted-foreground">请尝试其他名称或模型 ID。</p>
              </div>
            )}
          </DataState>
        </div>
      </section>
    </AppMetricPage>
  )
}
