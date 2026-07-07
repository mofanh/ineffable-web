import * as React from "react"
import {
  CalendarClock,
  Clock3,
  Edit3,
  History,
  Play,
  RotateCw,
  Trash2,
  X,
  Zap,
} from "lucide-react"
import { DayPicker } from "react-day-picker"
import {
  Dialog as DialogPrimitive,
  Popover as PopoverPrimitive,
} from "radix-ui"

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

import {
  AgentProductPage,
  EmptyState,
  ErrorNotice,
  SearchBar,
  StatusBadge,
  WorkbenchCard,
} from "./shared"

const INTERVAL_OPTIONS = [
  { value: "15", label: "Every 15 minutes" },
  { value: "30", label: "Every 30 minutes" },
  { value: "60", label: "Hourly" },
  { value: "180", label: "Every 3 hours" },
  { value: "360", label: "Every 6 hours" },
  { value: "720", label: "Every 12 hours" },
  { value: "1440", label: "Daily" },
  { value: "custom", label: "Custom minutes" },
]

const INTERVAL_VALUES = new Set(INTERVAL_OPTIONS.map((option) => option.value))
const WEEKDAY_OPTIONS = [
  { value: 1, label: "Mon" },
  { value: 2, label: "Tue" },
  { value: 3, label: "Wed" },
  { value: 4, label: "Thu" },
  { value: 5, label: "Fri" },
  { value: 6, label: "Sat" },
  { value: 7, label: "Sun" },
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
  if (!date) return "Select date and time"
  const formattedDate = new Intl.DateTimeFormat(undefined, {
    month: "short",
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
  if (automation.trigger_kind === "manual") return "Manual"
  if (
    automation.trigger_kind === "once" &&
    typeof automation.trigger_spec?.run_at === "string"
  ) {
    return `Once · ${new Date(automation.trigger_spec.run_at).toLocaleString()}`
  }
  if (automation.trigger_kind === "interval") {
    const minutes =
      typeof automation.trigger_spec?.interval_minutes === "number"
        ? automation.trigger_spec.interval_minutes
        : typeof automation.trigger_spec?.interval_seconds === "number"
          ? Math.round(automation.trigger_spec.interval_seconds / 60)
          : null
    return minutes ? `Every ${minutes} min` : "Interval"
  }
  if (automation.trigger_kind === "calendar") {
    const frequency =
      typeof automation.trigger_spec?.frequency === "string"
        ? automation.trigger_spec.frequency
        : "daily"
    const time =
      typeof automation.trigger_spec?.time === "string"
        ? automation.trigger_spec.time
        : "scheduled"
    const timezone =
      typeof automation.trigger_spec?.timezone === "string"
        ? automation.trigger_spec.timezone
        : "UTC"
    return `${frequency} · ${time} · ${timezone}`
  }
  return automation.trigger_kind
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
  const [automations, setAutomations] = React.useState<Automation[]>([])
  const [automationRuns, setAutomationRuns] = React.useState<
    Record<string, AutomationRun[]>
  >({})
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

  const reload = React.useCallback(async () => {
    setError(null)
    try {
      const [automationsResponse] = await Promise.all([
        listAutomations(accessToken),
        refreshConversations(),
      ])
      setAutomations(automationsResponse.automations)
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
      setAutomationRuns(Object.fromEntries(runPairs))
    } catch (err) {
      reportActionError(err, "failed to load automations", "Load automations failed")
    }
  }, [accessToken, refreshConversations, reportActionError])

  React.useEffect(() => {
    void reload()
  }, [reload])

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
        title: "Automation saved",
        description: form.name,
      })
      await reload()
    } catch (err) {
      reportActionError(err, "failed to save automation", "Save automation failed")
    } finally {
      setSaving(false)
    }
  }

  async function handleArchiveAutomation(automation: Automation) {
    const confirmed = await confirm({
      title: `Archive "${automation.name}"?`,
      description: "This automation will stop appearing in the active list.",
      confirmLabel: "Archive",
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
        title: "Automation archived",
        description: automation.name,
      })
      await reload()
    } catch (err) {
      reportActionError(
        err,
        "failed to archive automation",
        "Archive automation failed",
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
            ? "Automation paused"
            : "Automation activated",
        description: automation.name,
      })
      await reload()
    } catch (err) {
      reportActionError(
        err,
        "failed to update automation",
        "Update automation failed",
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
        title: "Automation started",
        description: automation.name,
      })
      await reload()
    } catch (err) {
      reportActionError(err, "failed to run automation", "Run automation failed")
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
    <AgentProductPage
      eyebrow="Automation"
      title="Scheduled Automations"
      subtitle="这里管理 agent 已经安排的自动任务。创建发生在对话中；这里用于查看、暂停、编辑、手动运行或归档。"
      metrics={[
        {
          label: "Active",
          value: String(
            automations.filter((automation) => automation.status === "active")
              .length,
          ),
          detail: "currently enabled",
          icon: Zap,
          tone: "amber",
        },
        {
          label: "Scheduled",
          value: String(
            automations.filter((automation) => automation.next_run_at).length,
          ),
          detail: "with next run time",
          icon: Clock3,
          tone: "blue",
        },
        {
          label: "Runs",
          value: String(runCounts.total),
          detail: runCounts.failed
            ? `${runCounts.failed} failed`
            : "last 50 per automation",
          icon: History,
          tone: "green",
        },
      ]}
      headerActions={
        <div className="flex gap-2">
          <Button
            variant="outline"
            disabled={saving}
            onClick={() => void reload()}
          >
            <RotateCw className="mr-2 size-4" />
            Refresh
          </Button>
        </div>
      }
    >
      <ErrorNotice message={error} />

      {lastRunConversationId ? (
        <div className="border-primary/30 bg-primary/10 rounded-md border px-4 py-3 text-sm">
          Automation triggered.{" "}
          <Button
            variant="link"
            className="h-auto p-0"
            onClick={() => openConversation(lastRunConversationId)}
          >
            Open conversation
          </Button>
        </div>
      ) : null}

      <WorkbenchCard
        title="Automation Inventory"
        description="自动任务绑定到原 conversation；到点后会向该会话追加一条输入并触发正常 agent run。"
        icon={Zap}
        actions={
          <div className="hidden min-w-72 md:block">
            <SearchBar
              value={query}
              onChange={setQuery}
              placeholder="Search automations..."
            />
          </div>
        }
      >
        <div className="space-y-3 md:hidden">
          <SearchBar
            value={query}
            onChange={setQuery}
            placeholder="Search automations..."
          />
        </div>
        <div className="mt-3 grid gap-3">
          {filteredAutomations.map((automation) => (
            <div
              key={automation.id}
              className="rounded-md border border-border bg-background/60 p-4 transition-colors hover:bg-muted/60"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="font-medium">{automation.name}</p>
                    <StatusBadge status={automation.status} />
                  </div>
                  <p className="text-muted-foreground mt-1 text-xs">
                    {triggerLabel(automation)}
                  </p>
                  <button
                    type="button"
                    className="text-primary mt-1 max-w-full truncate text-left text-xs hover:underline"
                    onClick={() => openConversation(automation.conversation_id)}
                  >
                    {conversationsById.get(automation.conversation_id)?.title ??
                      automation.conversation_id}
                  </button>
                  {automation.next_run_at ? (
                    <p className="text-muted-foreground mt-1 text-xs">
                      next: {new Date(automation.next_run_at).toLocaleString()}
                    </p>
                  ) : null}
                  {automation.last_run_at ? (
                    <p className="text-muted-foreground mt-1 text-xs">
                      last: {new Date(automation.last_run_at).toLocaleString()}
                    </p>
                  ) : null}
                </div>
                <Badge variant="outline">{automation.trigger_kind}</Badge>
              </div>
              <p className="text-muted-foreground mt-3 line-clamp-3 text-sm leading-6">
                {automation.message}
              </p>
              {(automationRuns[automation.id] ?? []).slice(0, 3).length > 0 ? (
                <div className="mt-3 space-y-1 rounded-md border border-border bg-muted/30 p-2 text-xs">
                  {(automationRuns[automation.id] ?? [])
                    .slice(0, 3)
                    .map((run) => (
                      <div
                        key={run.id}
                        className="text-muted-foreground flex items-center justify-between gap-2"
                      >
                        <span>{run.status}</span>
                        {run.conversation_id ? (
                          <button
                            type="button"
                            className="text-primary hover:underline"
                            onClick={() =>
                              openConversation(run.conversation_id)
                            }
                          >
                            conversation
                          </button>
                        ) : (
                          <span>{run.error || "no conversation"}</span>
                        )}
                      </div>
                    ))}
                </div>
              ) : null}
              <div className="mt-3 flex flex-wrap gap-2">
                <Button
                  size="sm"
                  disabled={saving || automation.status !== "active"}
                  onClick={() => void handleRunAutomation(automation)}
                >
                  <Play className="mr-2 size-3.5" />
                  Run now
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => startEditAutomation(automation)}
                >
                  <Edit3 className="mr-2 size-3.5" />
                  Edit
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={saving}
                  onClick={() => void handleToggleAutomation(automation)}
                >
                  {automation.status === "active" ? "Disable" : "Enable"}
                </Button>
                <Button
                  variant="destructive"
                  size="sm"
                  disabled={saving}
                  onClick={() => void handleArchiveAutomation(automation)}
                >
                  <Trash2 className="mr-2 size-3.5" />
                  Archive
                </Button>
              </div>
            </div>
          ))}
          {filteredAutomations.length === 0 ? (
            <EmptyState
              title="No automations"
              detail="Ask an agent in a conversation to schedule a reminder, check, or recurring task."
            />
          ) : null}
        </div>
      </WorkbenchCard>

      <AutomationDialog
        open={automationDialogOpen}
        title="Edit automation"
        onOpenChange={(open) => {
          if (open) setAutomationDialogOpen(true)
          else closeAutomationDialog()
        }}
      >
        <form className="space-y-3" onSubmit={handleSaveAutomation}>
          <Input
            placeholder="Automation name"
            value={form.name}
            onChange={(event) =>
              setForm((current) => ({ ...current, name: event.target.value }))
            }
            required
          />
          <Input
            placeholder="Description"
            value={form.description}
            onChange={(event) =>
              setForm((current) => ({
                ...current,
                description: event.target.value,
              }))
            }
          />
          <Textarea
            placeholder="Message to append to the conversation"
            value={form.message}
            onChange={(event) =>
              setForm((current) => ({
                ...current,
                message: event.target.value,
              }))
            }
            rows={8}
            required
          />
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
            <SelectTrigger className="h-9 w-full">
              <SelectValue placeholder="Trigger" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="manual">manual</SelectItem>
              <SelectItem value="once">once</SelectItem>
              <SelectItem value="interval">interval</SelectItem>
              <SelectItem value="calendar">calendar</SelectItem>
            </SelectContent>
          </Select>
          {form.trigger_kind === "once" ? (
            <div className="space-y-2">
              <DateTimePicker
                dateValue={form.once_date}
                timeValue={form.once_time}
                onChange={(next) =>
                  setForm((current) => ({ ...current, ...next }))
                }
              />
              <p className="text-muted-foreground md:col-span-2 text-xs">
                Uses your browser timezone and saves as RFC3339 UTC.
              </p>
            </div>
          ) : null}
          {form.trigger_kind === "interval" ? (
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
                <SelectTrigger className="h-9 w-full">
                  <SelectValue placeholder="Interval" />
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
                  type="number"
                  min="1"
                  placeholder="Minutes"
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
          ) : null}
          {form.trigger_kind === "calendar" ? (
            <div className="space-y-3">
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
                  <SelectTrigger className="h-9 w-full">
                    <SelectValue placeholder="Frequency" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="daily">daily</SelectItem>
                    <SelectItem value="weekly">weekly</SelectItem>
                    <SelectItem value="monthly">monthly</SelectItem>
                  </SelectContent>
                </Select>
                <Input
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
                  placeholder="Month days, e.g. 1, 15, 28"
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
            </div>
          ) : null}
          <div className="flex gap-2">
            <Button type="submit" disabled={saving || !editingAutomation}>
              Save automation
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={closeAutomationDialog}
            >
              Cancel
            </Button>
          </div>
        </form>
      </AutomationDialog>
    </AgentProductPage>
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
                One-time trigger
              </span>
            </span>
          </span>
          <span className="text-muted-foreground shrink-0 text-xs">Change</span>
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
              <p className="text-sm font-medium">Time</p>
              <p className="text-muted-foreground text-xs">
                Choose hour, minute, and second precisely.
              </p>
            </div>

            <div className="grid grid-cols-[1fr_auto_1fr_auto_1fr] items-end gap-2">
              <TimeNumberField
                label="Hour"
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
                label="Minute"
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
                label="Second"
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
                Next slot
              </Button>
              <Button type="button" onClick={() => setOpen(false)}>
                Apply
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
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 fixed inset-0 z-50 bg-black/10 duration-100 supports-backdrop-filter:backdrop-blur-xs" />
        <DialogPrimitive.Content className="data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 bg-background fixed top-1/2 left-1/2 z-50 grid max-h-[85vh] w-[calc(100vw-2rem)] max-w-xl -translate-x-1/2 -translate-y-1/2 gap-4 overflow-y-auto rounded-xl border border-border p-5 shadow-lg duration-100 outline-none">
          <div className="pr-8">
            <DialogPrimitive.Title className="text-base font-medium">
              {title}
            </DialogPrimitive.Title>
            <DialogPrimitive.Description className="text-muted-foreground mt-1 text-sm">
              设置要追加到会话的消息和触发条件。
            </DialogPrimitive.Description>
          </div>
          {children}
          <DialogPrimitive.Close asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              className="absolute top-4 right-4"
            >
              <X className="size-4" />
              <span className="sr-only">Close</span>
            </Button>
          </DialogPrimitive.Close>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  )
}
