import * as React from "react"
import {
  CalendarClock,
  Clock3,
  Edit3,
  History,
  MessageSquarePlus,
  Play,
  RotateCw,
  Trash2,
  Zap,
} from "lucide-react"
import { DayPicker } from "react-day-picker"
import { Popover as PopoverPrimitive } from "radix-ui"

import {
  AppDialog,
  AppMetricPage,
  AppSearchBar,
  AppSectionCard,
  AsyncButton,
  DataState,
  EmptyState,
  ErrorState,
  FormField,
  FormSection,
  Notice,
  StatusBadge,
} from "@/components/app"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { useAppSession } from "@/features/auth/app-session"
import {
  deleteAutomation,
  listAutomationRuns,
  listAutomations,
  runAutomation,
  updateAutomation,
  type Automation,
  type AutomationRun,
} from "@/lib/api/api-client"
import { normalizeAppError } from "@/lib/app/api-errors"
import { confirm } from "@/lib/app/confirm"
import { notify } from "@/lib/app/notifications"
import { useApiResource } from "@/lib/app/use-api-resource"

const INTERVAL_OPTIONS = [
  { value: "15", label: "每 15 分钟" },
  { value: "30", label: "每 30 分钟" },
  { value: "60", label: "每小时" },
  { value: "180", label: "每 3 小时" },
  { value: "360", label: "每 6 小时" },
  { value: "720", label: "每 12 小时" },
  { value: "1440", label: "每天" },
  { value: "custom", label: "自定义分钟数" },
]

const INTERVAL_VALUES = new Set(INTERVAL_OPTIONS.map((option) => option.value))
const EMPTY_AUTOMATION_RUNS: Record<string, AutomationRun[]> = {}
const WEEKDAY_OPTIONS = [
  { value: 1, label: "周一" },
  { value: 2, label: "周二" },
  { value: 3, label: "周三" },
  { value: 4, label: "周四" },
  { value: 5, label: "周五" },
  { value: 6, label: "周六" },
  { value: 7, label: "周日" },
]

function padNumber(value: number) {
  return String(value).padStart(2, "0")
}

function clampTimePart(value: number, max: number) {
  if (!Number.isFinite(value)) return 0
  return Math.min(max, Math.max(0, Math.trunc(value)))
}

function normalizeTimeValue(timeValue: string) {
  const [rawHour = "0", rawMinute = "0", rawSecond = "0"] = timeValue.split(":")
  const hour = clampTimePart(Number(rawHour), 23)
  const minute = clampTimePart(Number(rawMinute), 59)
  const second = clampTimePart(Number(rawSecond), 59)
  return `${padNumber(hour)}:${padNumber(minute)}:${padNumber(second)}`
}

function updateTimePart(
  timeValue: string,
  part: "hour" | "minute" | "second",
  value: string,
) {
  const [hour, minute, second] = normalizeTimeValue(timeValue).split(":")
  const nextValue = Number(value)
  const next = {
    hour,
    minute,
    second,
    [part]: padNumber(clampTimePart(nextValue, part === "hour" ? 23 : 59)),
  }
  return `${next.hour}:${next.minute}:${next.second}`
}

function defaultOnceDateTime() {
  const date = new Date()
  date.setMinutes(Math.ceil(date.getMinutes() / 15) * 15, 0, 0)
  if (date.getTime() <= Date.now()) {
    date.setMinutes(date.getMinutes() + 15)
  }
  return {
    once_date: `${date.getFullYear()}-${padNumber(date.getMonth() + 1)}-${padNumber(date.getDate())}`,
    once_time: `${padNumber(date.getHours())}:${padNumber(date.getMinutes())}:00`,
  }
}

function parseOnceRunAt(runAt: unknown) {
  if (typeof runAt !== "string") return defaultOnceDateTime()
  const date = new Date(runAt)
  if (Number.isNaN(date.getTime())) return defaultOnceDateTime()
  return {
    once_date: `${date.getFullYear()}-${padNumber(date.getMonth() + 1)}-${padNumber(date.getDate())}`,
    once_time: `${padNumber(date.getHours())}:${padNumber(date.getMinutes())}:${padNumber(date.getSeconds())}`,
  }
}

function buildOnceRunAt(dateValue: string, timeValue: string) {
  const date = new Date(`${dateValue}T${normalizeTimeValue(timeValue)}`)
  return Number.isNaN(date.getTime()) ? "" : date.toISOString()
}

function parseLocalDate(dateValue: string) {
  const [year, month, day] = dateValue.split("-").map(Number)
  if (!year || !month || !day) return undefined
  const date = new Date(year, month - 1, day)
  return Number.isNaN(date.getTime()) ? undefined : date
}

function formatLocalDateValue(date: Date) {
  return `${date.getFullYear()}-${padNumber(date.getMonth() + 1)}-${padNumber(date.getDate())}`
}

function formatDateTimeLabel(dateValue: string, timeValue: string) {
  const date = parseLocalDate(dateValue)
  if (!date) return "选择日期和时间"
  const formattedDate = new Intl.DateTimeFormat("zh-CN", {
    month: "long",
    day: "numeric",
    year: "numeric",
  }).format(date)
  return `${formattedDate} · ${timeValue}`
}

function numberArray(value: unknown) {
  if (!Array.isArray(value)) return []
  return value
    .map((item) => Number(item))
    .filter((item) => Number.isInteger(item))
}

function triggerLabel(automation: Automation) {
  if (automation.trigger_kind === "manual") return "手动触发"
  if (
    automation.trigger_kind === "once" &&
    typeof automation.trigger_spec?.run_at === "string"
  ) {
    return `单次 · ${new Date(automation.trigger_spec.run_at).toLocaleString("zh-CN")}`
  }
  if (automation.trigger_kind === "interval") {
    const minutes =
      typeof automation.trigger_spec?.interval_minutes === "number"
        ? automation.trigger_spec.interval_minutes
        : typeof automation.trigger_spec?.interval_seconds === "number"
          ? Math.round(automation.trigger_spec.interval_seconds / 60)
          : null
    return minutes ? `每 ${minutes} 分钟` : "固定间隔"
  }
  if (automation.trigger_kind === "calendar") {
    const frequency =
      typeof automation.trigger_spec?.frequency === "string"
        ? automation.trigger_spec.frequency
        : "daily"
    const time =
      typeof automation.trigger_spec?.time === "string"
        ? automation.trigger_spec.time
        : "已排期"
    const timezone =
      typeof automation.trigger_spec?.timezone === "string"
        ? automation.trigger_spec.timezone
        : "UTC"
    const frequencyLabel =
      frequency === "daily"
        ? "每天"
        : frequency === "weekly"
          ? "每周"
          : frequency === "monthly"
            ? "每月"
            : frequency
    return `${frequencyLabel} · ${time} · ${timezone}`
  }
  return automation.trigger_kind
}

function triggerKindLabel(triggerKind: string) {
  if (triggerKind === "manual") return "手动"
  if (triggerKind === "once") return "单次"
  if (triggerKind === "interval") return "间隔"
  if (triggerKind === "calendar") return "日历"
  return triggerKind
}

function statusLabel(status: string) {
  if (status === "active") return "已启用"
  if (status === "inactive") return "已暂停"
  if (status === "completed") return "已完成"
  if (status === "failed") return "失败"
  if (status === "running") return "运行中"
  if (status === "queued") return "排队中"
  return status
}

function formatRunTime(value?: string | null) {
  if (!value) return "—"
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value))
}

function runStatusCounts(runsByAutomation: Record<string, AutomationRun[]>) {
  return Object.values(runsByAutomation).reduce(
    (counts, runs) => {
      runs.forEach((run) => {
        counts.total += 1
        if (run.status === "failed") counts.failed += 1
      })
      return counts
    },
    { total: 0, failed: 0 },
  )
}

function useAccessToken() {
  const { accessToken } = useAppSession()
  if (!accessToken) throw new Error("auth required")
  return accessToken
}

export function AutomationPage() {
  const accessToken = useAccessToken()
  const { conversations, refreshConversations, selectConversation } =
    useAppSession()
  const [editingAutomation, setEditingAutomation] =
    React.useState<Automation | null>(null)
  const [automationDialogOpen, setAutomationDialogOpen] = React.useState(false)
  const [query, setQuery] = React.useState("")
  const [form, setForm] = React.useState({
    name: "",
    description: "",
    message: "",
    trigger_kind: "manual",
    ...defaultOnceDateTime(),
    interval_preset: "60",
    interval_minutes: "60",
    calendar_frequency: "daily",
    calendar_time: "09:00:00",
    calendar_timezone:
      Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
    calendar_weekdays: [1, 2, 3, 4, 5],
    calendar_month_days: "1",
  })
  const [error, setError] = React.useState<string | null>(null)
  const [saving, setSaving] = React.useState(false)
  const [lastRunConversationId, setLastRunConversationId] = React.useState<
    string | null
  >(null)

  const reportActionError = React.useCallback(
    (caught: unknown, fallbackMessage: string, title: string) => {
      const appError = normalizeAppError(caught, { fallbackMessage })
      setError(appError.message)
      notify.error({
        title,
        description: appError.message,
      })
      return appError.message
    },
    [],
  )

  const loadAutomationData = React.useCallback(async () => {
    const [automationsResponse] = await Promise.all([
      listAutomations(accessToken),
      refreshConversations(),
    ])
    const runPairs = await Promise.all(
      automationsResponse.automations.map(async (automation) => {
        try {
          const runsResponse = await listAutomationRuns(
            accessToken,
            automation.id,
          )
          return [automation.id, runsResponse.runs] as const
        } catch {
          return [automation.id, []] as const
        }
      }),
    )
    return {
      automations: automationsResponse.automations,
      runs: Object.fromEntries(runPairs) as Record<string, AutomationRun[]>,
    }
  }, [accessToken, refreshConversations])

  const automationResource = useApiResource({
    load: loadAutomationData,
    errorMessage: "加载自动任务失败。",
  })
  const automations = automationResource.data?.automations ?? []
  const automationRuns = automationResource.data?.runs ?? EMPTY_AUTOMATION_RUNS
  const reload = automationResource.reload

  const conversationsById = React.useMemo(
    () =>
      new Map(
        conversations.map((conversation) => [conversation.id, conversation]),
      ),
    [conversations],
  )
  const runCounts = React.useMemo(
    () => runStatusCounts(automationRuns),
    [automationRuns],
  )

  const filteredAutomations = automations.filter((automation) =>
    `${automation.name} ${automation.description ?? ""} ${automation.message}`
      .toLowerCase()
      .includes(query.toLowerCase()),
  )

  function resetForm() {
    setEditingAutomation(null)
    setForm({
      name: "",
      description: "",
      message: "",
      trigger_kind: "manual",
      ...defaultOnceDateTime(),
      interval_preset: "60",
      interval_minutes: "60",
      calendar_frequency: "daily",
      calendar_time: "09:00:00",
      calendar_timezone:
        Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
      calendar_weekdays: [1, 2, 3, 4, 5],
      calendar_month_days: "1",
    })
  }

  function closeAutomationDialog() {
    setAutomationDialogOpen(false)
    resetForm()
  }

  function startEditAutomation(automation: Automation) {
    const onceDateTime = parseOnceRunAt(automation.trigger_spec?.run_at)
    const intervalMinutes =
      typeof automation.trigger_spec?.interval_minutes === "number"
        ? String(automation.trigger_spec.interval_minutes)
        : typeof automation.trigger_spec?.interval_seconds === "number"
          ? String(
              Math.max(
                1,
                Math.round(automation.trigger_spec.interval_seconds / 60),
              ),
            )
          : "60"
    const calendarWeekdays = numberArray(automation.trigger_spec?.weekdays)
    const calendarMonthDays = numberArray(automation.trigger_spec?.month_days)
    setEditingAutomation(automation)
    setForm({
      name: automation.name,
      description: automation.description || "",
      message: automation.message,
      trigger_kind: automation.trigger_kind || "manual",
      ...onceDateTime,
      interval_preset: INTERVAL_VALUES.has(intervalMinutes)
        ? intervalMinutes
        : "custom",
      interval_minutes: intervalMinutes,
      calendar_frequency:
        typeof automation.trigger_spec?.frequency === "string"
          ? automation.trigger_spec.frequency
          : "daily",
      calendar_time:
        typeof automation.trigger_spec?.time === "string"
          ? normalizeTimeValue(automation.trigger_spec.time)
          : "09:00:00",
      calendar_timezone:
        typeof automation.trigger_spec?.timezone === "string"
          ? automation.trigger_spec.timezone
          : Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
      calendar_weekdays: calendarWeekdays.length
        ? calendarWeekdays
        : [1, 2, 3, 4, 5],
      calendar_month_days: calendarMonthDays.length
        ? calendarMonthDays.join(", ")
        : "1",
    })
    setAutomationDialogOpen(true)
  }

  function buildTriggerSpec() {
    if (form.trigger_kind === "once")
      return { run_at: buildOnceRunAt(form.once_date, form.once_time) }
    if (form.trigger_kind === "interval")
      return { interval_minutes: Number(form.interval_minutes) || 60 }
    if (form.trigger_kind === "calendar") {
      const spec: Record<string, unknown> = {
        timezone: form.calendar_timezone || "UTC",
        frequency: form.calendar_frequency || "daily",
        time: normalizeTimeValue(form.calendar_time),
      }
      if (form.calendar_frequency === "weekly") {
        spec.weekdays = form.calendar_weekdays.length
          ? form.calendar_weekdays
          : [1]
      }
      if (form.calendar_frequency === "monthly") {
        const monthDays = form.calendar_month_days
          .split(",")
          .map((value) => Number(value.trim()))
          .filter(
            (value) => Number.isInteger(value) && value >= 1 && value <= 31,
          )
        spec.month_days = monthDays.length ? monthDays : [1]
      }
      return spec
    }
    return {}
  }

  async function handleSaveAutomation(event: React.FormEvent) {
    event.preventDefault()
    if (!editingAutomation) {
      return
    }
    setSaving(true)
    setError(null)
    try {
      await updateAutomation(accessToken, editingAutomation.id, {
        name: form.name,
        description: form.description,
        message: form.message,
        trigger_kind: form.trigger_kind,
        trigger_spec: buildTriggerSpec(),
      })
      closeAutomationDialog()
      notify.success({
        title: "自动任务已保存",
        description: form.name,
      })
      await reload()
    } catch (err) {
      reportActionError(err, "保存自动任务失败。", "保存失败")
    } finally {
      setSaving(false)
    }
  }

  async function handleArchiveAutomation(automation: Automation) {
    const confirmed = await confirm({
      title: `归档“${automation.name}”？`,
      description: "归档后该任务将停止运行，并从当前任务列表中移除。",
      confirmLabel: "归档",
      variant: "destructive",
    })
    if (!confirmed) {
      return
    }

    setSaving(true)
    setError(null)
    try {
      await deleteAutomation(accessToken, automation.id)
      if (editingAutomation?.id === automation.id) closeAutomationDialog()
      notify.success({
        title: "自动任务已归档",
        description: automation.name,
      })
      await reload()
    } catch (err) {
      reportActionError(
        err,
        "归档自动任务失败。",
        "归档失败",
      )
    } finally {
      setSaving(false)
    }
  }

  async function handleToggleAutomation(automation: Automation) {
    setSaving(true)
    setError(null)
    try {
      await updateAutomation(accessToken, automation.id, {
        status: automation.status === "active" ? "inactive" : "active",
      })
      notify.success({
        title:
          automation.status === "active"
            ? "自动任务已暂停"
            : "自动任务已启用",
        description: automation.name,
      })
      await reload()
    } catch (err) {
      reportActionError(
        err,
        "更新自动任务状态失败。",
        "状态更新失败",
      )
    } finally {
      setSaving(false)
    }
  }

  async function handleRunAutomation(automation: Automation) {
    setSaving(true)
    setError(null)
    setLastRunConversationId(null)
    try {
      const response = await runAutomation(accessToken, automation.id)
      setLastRunConversationId(response.conversation_id)
      notify.success({
        title: "自动任务已开始运行",
        description: automation.name,
      })
      await reload()
    } catch (err) {
      reportActionError(err, "运行自动任务失败。", "运行失败")
    } finally {
      setSaving(false)
    }
  }

  function openConversation(conversationId: string | null | undefined) {
    if (!conversationId) {
      return
    }
    selectConversation(conversationId)
    window.dispatchEvent(new Event("ineffable:right-sidebar:open"))
  }

  return (
    <AppMetricPage
      eyebrow="Agent Automation"
      title="自动任务"
      subtitle="让 Agent 在指定时间回到原会话继续工作。你可以在这里查看排期、运行记录，或调整已经创建的任务。"
      metrics={[
        {
          label: "运行中",
          value: automationResource.data
            ? String(
                automations.filter(
                  (automation) => automation.status === "active",
                ).length,
              )
            : "—",
          detail: "当前已启用任务",
          icon: Zap,
          tone: "amber",
        },
        {
          label: "已排期",
          value: automationResource.data
            ? String(
                automations.filter((automation) => automation.next_run_at)
                  .length,
              )
            : "—",
          detail: "已有下次运行时间",
          icon: Clock3,
          tone: "blue",
        },
        {
          label: "近期运行",
          value: automationResource.data ? String(runCounts.total) : "—",
          detail: runCounts.failed
            ? `${runCounts.failed} 次失败`
            : "每个任务最近 50 条",
          icon: History,
          tone: "green",
        },
      ]}
      headerActions={
        <div className="flex flex-wrap gap-2">
          <Button
            onClick={() =>
              window.dispatchEvent(new Event("ineffable:right-sidebar:open"))
            }
            aria-label="在会话中创建自动任务"
            title="在会话中创建自动任务"
          >
            <MessageSquarePlus className="size-4" />
            <span className="hidden sm:inline">在会话中创建</span>
          </Button>
          <Button
            variant="outline"
            disabled={saving || automationResource.isRefreshing}
            onClick={() => void reload()}
            aria-label="刷新自动任务"
          >
            <RotateCw
              className={automationResource.isRefreshing ? "animate-spin" : ""}
            />
            <span className="hidden sm:inline">刷新</span>
          </Button>
        </div>
      }
    >
      <ErrorState error={error} title="操作失败" />

      {lastRunConversationId ? (
        <Notice tone="success" title="任务已开始运行">
          已在原会话中创建新的 Agent 运行。{" "}
          <Button
            variant="link"
            className="h-auto p-0"
            onClick={() => openConversation(lastRunConversationId)}
          >
            打开会话
          </Button>
        </Notice>
      ) : null}

      <AppSectionCard
        title="任务列表"
        description="任务到点后会向原会话追加输入，并按现有上下文继续执行。"
        icon={Zap}
        actions={
          <div className="hidden min-w-72 md:block">
            <AppSearchBar
              value={query}
              onChange={setQuery}
              placeholder="搜索任务名称或内容..."
            />
          </div>
        }
      >
        <div className="space-y-3 md:hidden">
          <AppSearchBar
            value={query}
            onChange={setQuery}
            placeholder="搜索任务名称或内容..."
          />
        </div>
        <DataState
          state={automationResource.state}
          error={automationResource.error}
          empty={automations.length === 0}
          emptyTitle="还没有自动任务"
          emptyDescription="在右侧会话中告诉 Agent 要做什么以及何时执行，任务创建后会出现在这里。"
          loadingLabel="正在加载自动任务"
          onRetry={() => void reload()}
        >
          <div className="mt-3 grid gap-3">
            {filteredAutomations.map((automation) => (
            <div
              key={automation.id}
              className="rounded-xl border border-border bg-background/70 p-4 transition-colors hover:border-foreground/20"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-base font-medium">{automation.name}</p>
                    <StatusBadge
                      status={automation.status}
                      label={statusLabel(automation.status)}
                    />
                  </div>
                  <button
                    type="button"
                    className="mt-1 max-w-full truncate text-left text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
                    onClick={() => openConversation(automation.conversation_id)}
                  >
                    来源会话 · {" "}
                    {conversationsById.get(automation.conversation_id)?.title ??
                      automation.conversation_id}
                  </button>
                </div>
                <Badge variant="outline">
                  {triggerKindLabel(automation.trigger_kind)}
                </Badge>
              </div>
              <p className="mt-4 line-clamp-3 rounded-lg bg-muted/40 px-3 py-2.5 text-sm leading-6 text-muted-foreground">
                {automation.message}
              </p>

              <dl className="mt-4 grid gap-3 text-xs sm:grid-cols-3">
                <div>
                  <dt className="text-muted-foreground">触发规则</dt>
                  <dd className="mt-1 font-medium">{triggerLabel(automation)}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">下次运行</dt>
                  <dd className="mt-1 font-medium">
                    {formatRunTime(automation.next_run_at)}
                  </dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">最近运行</dt>
                  <dd className="mt-1 font-medium">
                    {formatRunTime(automation.last_run_at)}
                  </dd>
                </div>
              </dl>

              {(automationRuns[automation.id] ?? []).slice(0, 3).length > 0 ? (
                <div className="mt-4 space-y-2 border-t pt-3 text-xs">
                  <p className="font-medium">最近运行记录</p>
                  {(automationRuns[automation.id] ?? [])
                    .slice(0, 3)
                    .map((run) => (
                      <div
                        key={run.id}
                        className="flex items-center justify-between gap-2 text-muted-foreground"
                      >
                        <StatusBadge
                          status={run.status}
                          label={statusLabel(run.status)}
                        />
                        {run.conversation_id ? (
                          <button
                            type="button"
                            className="hover:text-foreground hover:underline"
                            onClick={() =>
                              openConversation(run.conversation_id)
                            }
                          >
                            查看会话
                          </button>
                        ) : (
                          <span className="max-w-80 truncate">
                            {run.error || "未创建会话"}
                          </span>
                        )}
                      </div>
                    ))}
                </div>
              ) : null}
              <div className="mt-4 flex flex-wrap gap-2 border-t pt-3">
                <Button
                  size="sm"
                  disabled={saving || automation.status !== "active"}
                  onClick={() => void handleRunAutomation(automation)}
                >
                  <Play className="size-3.5" />
                  立即运行
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => startEditAutomation(automation)}
                >
                  <Edit3 className="size-3.5" />
                  编辑
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={saving}
                  onClick={() => void handleToggleAutomation(automation)}
                >
                  {automation.status === "active" ? "暂停" : "启用"}
                </Button>
                <Button
                  variant="destructive"
                  size="sm"
                  disabled={saving}
                  onClick={() => void handleArchiveAutomation(automation)}
                >
                  <Trash2 className="size-3.5" />
                  归档
                </Button>
              </div>
            </div>
            ))}
            {filteredAutomations.length === 0 ? (
              <EmptyState
                title="没有匹配的任务"
                description="尝试更换关键词，或清空搜索条件。"
              />
            ) : null}
          </div>
        </DataState>
      </AppSectionCard>

      <AutomationDialog
        open={automationDialogOpen}
        title="编辑自动任务"
        onOpenChange={(open) => {
          if (open) setAutomationDialogOpen(true)
          else closeAutomationDialog()
        }}
      >
        <form className="space-y-5" onSubmit={handleSaveAutomation}>
          <FormSection className="space-y-4">
            <FormField htmlFor="automation-name" label="任务名称">
              <Input
                id="automation-name"
                className="h-10"
                placeholder="例如：每日整理项目进展"
                value={form.name}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    name: event.target.value,
                  }))
                }
                required
              />
            </FormField>
            <FormField htmlFor="automation-description" label="说明（可选）">
              <Input
                id="automation-description"
                className="h-10"
                placeholder="简要说明这项任务的用途"
                value={form.description}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    description: event.target.value,
                  }))
                }
              />
            </FormField>
            <FormField
              htmlFor="automation-message"
              label="执行消息"
              description="触发时，这段消息会追加到任务的原会话中。"
            >
              <Textarea
                id="automation-message"
                placeholder="告诉 Agent 到点后需要继续完成什么"
                value={form.message}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    message: event.target.value,
                  }))
                }
                rows={6}
                required
              />
            </FormField>
            <FormField label="触发方式">
              <Select
                value={form.trigger_kind}
                onValueChange={(value) =>
                  setForm((current) => ({
                    ...current,
                    trigger_kind: value,
                    ...(value === "once" && !current.once_date
                      ? defaultOnceDateTime()
                      : {}),
                  }))
                }
              >
                <SelectTrigger className="h-10 w-full">
                  <SelectValue placeholder="选择触发方式" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="manual">仅手动运行</SelectItem>
                  <SelectItem value="once">指定时间运行一次</SelectItem>
                  <SelectItem value="interval">按固定间隔运行</SelectItem>
                  <SelectItem value="calendar">按日历计划运行</SelectItem>
                </SelectContent>
              </Select>
            </FormField>
          </FormSection>
          {form.trigger_kind === "once" ? (
            <FormField
              label="执行时间"
              description="使用浏览器所在时区选择，保存时会转换为 UTC。"
            >
              <DateTimePicker
                dateValue={form.once_date}
                timeValue={form.once_time}
                onChange={(next) =>
                  setForm((current) => ({ ...current, ...next }))
                }
              />
            </FormField>
          ) : null}
          {form.trigger_kind === "interval" ? (
            <FormField label="运行间隔">
              <div className="grid gap-2 md:grid-cols-[1fr_160px]">
                <Select
                  value={form.interval_preset}
                  onValueChange={(value) =>
                    setForm((current) => ({
                      ...current,
                      interval_preset: value,
                      interval_minutes:
                        value === "custom" ? current.interval_minutes : value,
                    }))
                  }
                >
                  <SelectTrigger className="h-10 w-full">
                    <SelectValue placeholder="选择运行间隔" />
                  </SelectTrigger>
                  <SelectContent>
                    {INTERVAL_OPTIONS.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {form.interval_preset === "custom" ? (
                  <Input
                    className="h-10"
                    type="number"
                    min="1"
                    placeholder="分钟数"
                    value={form.interval_minutes}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        interval_minutes: event.target.value,
                      }))
                    }
                    required
                  />
                ) : null}
              </div>
            </FormField>
          ) : null}
          {form.trigger_kind === "calendar" ? (
            <FormField
              label="日历计划"
              description="按所选时区和频率触发任务。"
            >
              <div className="grid gap-2 md:grid-cols-3">
                <Select
                  value={form.calendar_frequency}
                  onValueChange={(value) =>
                    setForm((current) => ({
                      ...current,
                      calendar_frequency: value,
                    }))
                  }
                >
                  <SelectTrigger className="h-10 w-full">
                    <SelectValue placeholder="选择频率" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="daily">每天</SelectItem>
                    <SelectItem value="weekly">每周</SelectItem>
                    <SelectItem value="monthly">每月</SelectItem>
                  </SelectContent>
                </Select>
                <Input
                  className="h-10"
                  placeholder="09:00:00"
                  value={form.calendar_time}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      calendar_time: event.target.value,
                    }))
                  }
                  required
                />
                <Input
                  className="h-10"
                  placeholder="Asia/Shanghai"
                  value={form.calendar_timezone}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      calendar_timezone: event.target.value,
                    }))
                  }
                  required
                />
              </div>
              {form.calendar_frequency === "weekly" ? (
                <div className="flex flex-wrap gap-2">
                  {WEEKDAY_OPTIONS.map((weekday) => {
                    const selected = form.calendar_weekdays.includes(
                      weekday.value,
                    )
                    return (
                      <Button
                        key={weekday.value}
                        type="button"
                        size="sm"
                        variant={selected ? "default" : "outline"}
                        onClick={() =>
                          setForm((current) => ({
                            ...current,
                            calendar_weekdays: selected
                              ? current.calendar_weekdays.filter(
                                  (value) => value !== weekday.value,
                                )
                              : [
                                  ...current.calendar_weekdays,
                                  weekday.value,
                                ].sort((a, b) => a - b),
                          }))
                        }
                      >
                        {weekday.label}
                      </Button>
                    )
                  })}
                </div>
              ) : null}
              {form.calendar_frequency === "monthly" ? (
                <Input
                  className="h-10"
                  placeholder="每月日期，例如 1, 15, 28"
                  value={form.calendar_month_days}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      calendar_month_days: event.target.value,
                    }))
                  }
                  required
                />
              ) : null}
            </FormField>
          ) : null}
          <div className="flex justify-end gap-2 border-t pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={closeAutomationDialog}
            >
              取消
            </Button>
            <AsyncButton
              type="submit"
              isLoading={saving}
              loadingLabel="保存中..."
              disabled={!editingAutomation}
            >
              保存任务
            </AsyncButton>
          </div>
        </form>
      </AutomationDialog>
    </AppMetricPage>
  )
}

function DateTimePicker({
  dateValue,
  timeValue,
  onChange,
}: {
  dateValue: string
  timeValue: string
  onChange: (next: { once_date?: string; once_time?: string }) => void
}) {
  const [open, setOpen] = React.useState(false)
  const selectedDate = parseLocalDate(dateValue)
  const label = formatDateTimeLabel(dateValue, timeValue)
  const [hour, minute, second] = normalizeTimeValue(timeValue).split(":")

  return (
    <PopoverPrimitive.Root open={open} onOpenChange={setOpen}>
      <PopoverPrimitive.Trigger asChild>
        <button
          type="button"
          className="border-input bg-background hover:bg-muted/60 flex h-11 w-full items-center justify-between gap-3 rounded-md border px-3 text-left text-sm transition-colors"
        >
          <span className="flex min-w-0 items-center gap-3">
            <span className="bg-muted flex size-8 shrink-0 items-center justify-center rounded-md border border-border">
              <CalendarClock className="text-muted-foreground size-4" />
            </span>
            <span className="min-w-0">
              <span className="block truncate font-medium">{label}</span>
              <span className="text-muted-foreground block text-xs">
                单次触发时间
              </span>
            </span>
          </span>
          <span className="text-muted-foreground shrink-0 text-xs">修改</span>
        </button>
      </PopoverPrimitive.Trigger>
      <PopoverPrimitive.Portal>
        <PopoverPrimitive.Content
          align="start"
          sideOffset={8}
          className="bg-popover text-popover-foreground z-[70] w-[min(calc(100vw-2rem),360px)] rounded-xl border border-border p-3 shadow-xl outline-none"
        >
          <DayPicker
            mode="single"
            selected={selectedDate}
            onSelect={(date) => {
              if (!date) return
              onChange({ once_date: formatLocalDateValue(date) })
            }}
            weekStartsOn={1}
            classNames={{
              root: "w-full",
              months: "space-y-4",
              month: "space-y-3",
              month_caption: "flex h-8 items-center justify-center",
              caption_label: "text-sm font-medium",
              nav: "absolute inset-x-3 top-3 flex items-center justify-between",
              button_previous:
                "flex size-8 items-center justify-center rounded-md border border-border bg-background text-muted-foreground transition-colors hover:bg-muted",
              button_next:
                "flex size-8 items-center justify-center rounded-md border border-border bg-background text-muted-foreground transition-colors hover:bg-muted",
              month_grid: "w-full border-collapse",
              weekdays: "grid grid-cols-7",
              weekday:
                "text-muted-foreground flex h-8 items-center justify-center text-xs font-normal",
              week: "grid grid-cols-7",
              day: "p-0 text-center text-sm",
              day_button:
                "mx-auto flex size-9 items-center justify-center rounded-md text-sm transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              selected:
                "[&>button]:bg-primary [&>button]:text-primary-foreground [&>button]:hover:bg-primary",
              today: "[&>button]:border [&>button]:border-primary/40",
              outside: "text-muted-foreground/40",
              disabled: "pointer-events-none opacity-40",
            }}
          />

          <div className="mt-3 grid gap-3 border-t border-border pt-3">
            <div>
              <p className="text-sm font-medium">时间</p>
              <p className="text-muted-foreground text-xs">
                选择小时、分钟和秒。
              </p>
            </div>

            <div className="grid grid-cols-[1fr_auto_1fr_auto_1fr] items-end gap-2">
              <TimeNumberField
                label="时"
                value={hour}
                max={23}
                onChange={(value) =>
                  onChange({
                    once_time: updateTimePart(timeValue, "hour", value),
                  })
                }
              />
              <span className="text-muted-foreground pb-2 text-lg font-medium">
                :
              </span>
              <TimeNumberField
                label="分"
                value={minute}
                max={59}
                onChange={(value) =>
                  onChange({
                    once_time: updateTimePart(timeValue, "minute", value),
                  })
                }
              />
              <span className="text-muted-foreground pb-2 text-lg font-medium">
                :
              </span>
              <TimeNumberField
                label="秒"
                value={second}
                max={59}
                onChange={(value) =>
                  onChange({
                    once_time: updateTimePart(timeValue, "second", value),
                  })
                }
              />
            </div>

            <div className="grid grid-cols-4 gap-2">
              {[0, 15, 30, 45].map((value) => (
                <Button
                  key={value}
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    onChange({
                      once_time: `${hour}:${padNumber(value)}:${second}`,
                    })
                  }
                >
                  :{padNumber(value)}
                </Button>
              ))}
            </div>

            <div className="grid grid-cols-2 gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => onChange(defaultOnceDateTime())}
              >
                下一个时间段
              </Button>
              <Button type="button" onClick={() => setOpen(false)}>
                应用
              </Button>
            </div>
          </div>
          <PopoverPrimitive.Arrow className="fill-popover" />
        </PopoverPrimitive.Content>
      </PopoverPrimitive.Portal>
    </PopoverPrimitive.Root>
  )
}

function TimeNumberField({
  label,
  value,
  max,
  onChange,
}: {
  label: string
  value: string
  max: number
  onChange: (value: string) => void
}) {
  return (
    <label className="grid gap-1">
      <span className="text-muted-foreground text-xs">{label}</span>
      <Input
        type="number"
        min={0}
        max={max}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onBlur={(event) => onChange(event.target.value)}
        className="h-10 text-center font-mono text-base"
      />
    </label>
  )
}

function AutomationDialog({
  open,
  title,
  children,
  onOpenChange,
}: {
  open: boolean
  title: string
  children: React.ReactNode
  onOpenChange: (open: boolean) => void
}) {
  return (
    <AppDialog
      open={open}
      title={title}
      description="设置要追加到会话的消息和触发条件。"
      onOpenChange={onOpenChange}
    >
      {children}
    </AppDialog>
  )
}
