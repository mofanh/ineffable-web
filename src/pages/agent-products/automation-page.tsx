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
import { useTranslation } from "react-i18next"

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
import { i18n, normalizeLanguage } from "@/lib/i18n/i18n"

const INTERVAL_OPTIONS = [
  { value: "15", labelKey: "automation.interval.every15Minutes" },
  { value: "30", labelKey: "automation.interval.every30Minutes" },
  { value: "60", labelKey: "automation.interval.hourly" },
  { value: "180", labelKey: "automation.interval.every3Hours" },
  { value: "360", labelKey: "automation.interval.every6Hours" },
  { value: "720", labelKey: "automation.interval.every12Hours" },
  { value: "1440", labelKey: "automation.interval.daily" },
  { value: "custom", labelKey: "automation.interval.custom" },
]

const INTERVAL_VALUES = new Set(INTERVAL_OPTIONS.map((option) => option.value))
const EMPTY_AUTOMATION_RUNS: Record<string, AutomationRun[]> = {}
const WEEKDAY_OPTIONS = [
  { value: 1, labelKey: "automation.weekdays.monday" },
  { value: 2, labelKey: "automation.weekdays.tuesday" },
  { value: 3, labelKey: "automation.weekdays.wednesday" },
  { value: 4, labelKey: "automation.weekdays.thursday" },
  { value: 5, labelKey: "automation.weekdays.friday" },
  { value: 6, labelKey: "automation.weekdays.saturday" },
  { value: 7, labelKey: "automation.weekdays.sunday" },
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
  if (!date) return i18n.t("automation.trigger.chooseDateTime")
  const locale = normalizeLanguage(i18n.resolvedLanguage || i18n.language)
  const formattedDate = new Intl.DateTimeFormat(locale, {
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
  if (automation.trigger_kind === "manual")
    return i18n.t("automation.trigger.manualTrigger")
  if (
    automation.trigger_kind === "once" &&
    typeof automation.trigger_spec?.run_at === "string"
  ) {
    return i18n.t("automation.trigger.onceAt", {
      date: new Date(automation.trigger_spec.run_at).toLocaleString(
        normalizeLanguage(i18n.resolvedLanguage || i18n.language),
      ),
    })
  }
  if (automation.trigger_kind === "interval") {
    const minutes =
      typeof automation.trigger_spec?.interval_minutes === "number"
        ? automation.trigger_spec.interval_minutes
        : typeof automation.trigger_spec?.interval_seconds === "number"
          ? Math.round(automation.trigger_spec.interval_seconds / 60)
          : null
    return minutes
      ? i18n.t("automation.interval.everyMinutes", { minutes })
      : i18n.t("automation.interval.fixed")
  }
  if (automation.trigger_kind === "calendar") {
    const frequency =
      typeof automation.trigger_spec?.frequency === "string"
        ? automation.trigger_spec.frequency
        : "daily"
    const time =
      typeof automation.trigger_spec?.time === "string"
        ? automation.trigger_spec.time
        : i18n.t("automation.trigger.scheduled")
    const timezone =
      typeof automation.trigger_spec?.timezone === "string"
        ? automation.trigger_spec.timezone
        : "UTC"
    const frequencyLabel =
      frequency === "daily"
        ? i18n.t("automation.trigger.daily")
        : frequency === "weekly"
          ? i18n.t("automation.trigger.weekly")
          : frequency === "monthly"
            ? i18n.t("automation.trigger.monthly")
            : frequency
    return `${frequencyLabel} · ${time} · ${timezone}`
  }
  return automation.trigger_kind
}

function triggerKindLabel(triggerKind: string) {
  if (triggerKind === "manual") return i18n.t("automation.trigger.manual")
  if (triggerKind === "once") return i18n.t("automation.trigger.once")
  if (triggerKind === "interval") return i18n.t("automation.trigger.interval")
  if (triggerKind === "calendar") return i18n.t("automation.trigger.calendar")
  return triggerKind
}

function statusLabel(status: string) {
  if (status === "active") return i18n.t("automation.status.active")
  if (status === "inactive") return i18n.t("automation.status.inactive")
  if (status === "completed") return i18n.t("automation.status.completed")
  if (status === "failed") return i18n.t("automation.status.failed")
  if (status === "running") return i18n.t("automation.status.running")
  if (status === "queued") return i18n.t("automation.status.queued")
  return status
}

function formatRunTime(value?: string | null) {
  if (!value) return "—"
  return new Intl.DateTimeFormat(
    normalizeLanguage(i18n.resolvedLanguage || i18n.language),
    {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    },
  ).format(new Date(value))
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
  const { t } = useTranslation()
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
    errorMessage: t("automation.feedback.loadFailed"),
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
        title: t("automation.feedback.saved"),
        description: form.name,
      })
      await reload()
    } catch (err) {
      reportActionError(
        err,
        t("automation.feedback.saveFailed"),
        t("automation.feedback.saveFailedTitle"),
      )
    } finally {
      setSaving(false)
    }
  }

  async function handleArchiveAutomation(automation: Automation) {
    const confirmed = await confirm({
      title: t("automation.feedback.archiveTitle", { name: automation.name }),
      description: t("automation.feedback.archiveDescription"),
      confirmLabel: t("automation.feedback.archive"),
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
        title: t("automation.feedback.archived"),
        description: automation.name,
      })
      await reload()
    } catch (err) {
      reportActionError(
        err,
        t("automation.feedback.archiveFailed"),
        t("automation.feedback.archiveFailedTitle"),
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
            ? t("automation.feedback.paused")
            : t("automation.feedback.enabled"),
        description: automation.name,
      })
      await reload()
    } catch (err) {
      reportActionError(
        err,
        t("automation.feedback.statusFailed"),
        t("automation.feedback.statusFailedTitle"),
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
        title: t("automation.feedback.runStarted"),
        description: automation.name,
      })
      await reload()
    } catch (err) {
      reportActionError(
        err,
        t("automation.feedback.runFailed"),
        t("automation.feedback.runFailedTitle"),
      )
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
      title={t("automation.page.title")}
      subtitle={t("automation.page.subtitle")}
      metrics={[
        {
          label: t("automation.page.running"),
          value: automationResource.data
            ? String(
                automations.filter(
                  (automation) => automation.status === "active",
                ).length,
              )
            : "—",
          detail: t("automation.page.runningDetail"),
          icon: Zap,
          tone: "amber",
        },
        {
          label: t("automation.page.scheduled"),
          value: automationResource.data
            ? String(
                automations.filter((automation) => automation.next_run_at)
                  .length,
              )
            : "—",
          detail: t("automation.page.scheduledDetail"),
          icon: Clock3,
          tone: "blue",
        },
        {
          label: t("automation.page.recentRuns"),
          value: automationResource.data ? String(runCounts.total) : "—",
          detail: runCounts.failed
            ? t("automation.page.failedRuns", { count: runCounts.failed })
            : t("automation.page.recentRunsDetail"),
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
            aria-label={t("automation.page.createInChatLabel")}
            title={t("automation.page.createInChatLabel")}
          >
            <MessageSquarePlus className="size-4" />
            <span className="hidden sm:inline">
              {t("automation.page.createInChat")}
            </span>
          </Button>
          <Button
            variant="outline"
            disabled={saving || automationResource.isRefreshing}
            onClick={() => void reload()}
            aria-label={t("automation.page.refreshLabel")}
          >
            <RotateCw
              className={automationResource.isRefreshing ? "animate-spin" : ""}
            />
            <span className="hidden sm:inline">{t("automation.page.refresh")}</span>
          </Button>
        </div>
      }
    >
      <ErrorState error={error} title={t("common.operationFailed")} />

      {lastRunConversationId ? (
        <Notice tone="success" title={t("automation.feedback.runStarted")}>
          {t("automation.page.runStartedDescription")} {" "}
          <Button
            variant="link"
            className="h-auto p-0"
            onClick={() => openConversation(lastRunConversationId)}
          >
            {t("automation.page.openConversation")}
          </Button>
        </Notice>
      ) : null}

      <AppSectionCard
        title={t("automation.page.listTitle")}
        description={t("automation.page.listDescription")}
        icon={Zap}
        actions={
          <div className="hidden min-w-72 md:block">
            <AppSearchBar
              value={query}
              onChange={setQuery}
              placeholder={t("automation.page.searchPlaceholder")}
            />
          </div>
        }
      >
        <div className="space-y-3 md:hidden">
          <AppSearchBar
            value={query}
            onChange={setQuery}
            placeholder={t("automation.page.searchPlaceholder")}
          />
        </div>
        <DataState
          state={automationResource.state}
          error={automationResource.error}
          empty={automations.length === 0}
          emptyTitle={t("automation.page.emptyTitle")}
          emptyDescription={t("automation.page.emptyDescription")}
          loadingLabel={t("automation.page.loading")}
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
                    {t("automation.page.sourceConversation")} · {" "}
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
                  <dt className="text-muted-foreground">
                    {t("automation.page.triggerRule")}
                  </dt>
                  <dd className="mt-1 font-medium">{triggerLabel(automation)}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">
                    {t("automation.page.nextRun")}
                  </dt>
                  <dd className="mt-1 font-medium">
                    {formatRunTime(automation.next_run_at)}
                  </dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">
                    {t("automation.page.latestRun")}
                  </dt>
                  <dd className="mt-1 font-medium">
                    {formatRunTime(automation.last_run_at)}
                  </dd>
                </div>
              </dl>

              {(automationRuns[automation.id] ?? []).slice(0, 3).length > 0 ? (
                <div className="mt-4 space-y-2 border-t pt-3 text-xs">
                  <p className="font-medium">
                    {t("automation.page.recentRunRecords")}
                  </p>
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
                            {t("automation.page.viewConversation")}
                          </button>
                        ) : (
                          <span className="max-w-80 truncate">
                            {run.error || t("automation.page.noConversation")}
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
                  {t("automation.page.runNow")}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => startEditAutomation(automation)}
                >
                  <Edit3 className="size-3.5" />
                  {t("automation.page.edit")}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={saving}
                  onClick={() => void handleToggleAutomation(automation)}
                >
                  {automation.status === "active"
                    ? t("automation.page.pause")
                    : t("automation.page.enable")}
                </Button>
                <Button
                  variant="destructive"
                  size="sm"
                  disabled={saving}
                  onClick={() => void handleArchiveAutomation(automation)}
                >
                  <Trash2 className="size-3.5" />
                  {t("automation.feedback.archive")}
                </Button>
              </div>
            </div>
            ))}
            {filteredAutomations.length === 0 ? (
              <EmptyState
                title={t("automation.page.noMatches")}
                description={t("automation.page.noMatchesDescription")}
              />
            ) : null}
          </div>
        </DataState>
      </AppSectionCard>

      <AutomationDialog
        open={automationDialogOpen}
        title={t("automation.form.editTitle")}
        onOpenChange={(open) => {
          if (open) setAutomationDialogOpen(true)
          else closeAutomationDialog()
        }}
      >
        <form className="space-y-5" onSubmit={handleSaveAutomation}>
          <FormSection className="space-y-4">
            <FormField
              htmlFor="automation-name"
              label={t("automation.form.name")}
            >
              <Input
                id="automation-name"
                className="h-10"
                placeholder={t("automation.form.namePlaceholder")}
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
            <FormField
              htmlFor="automation-description"
              label={t("automation.form.description")}
            >
              <Input
                id="automation-description"
                className="h-10"
                placeholder={t("automation.form.descriptionPlaceholder")}
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
              label={t("automation.form.message")}
              description={t("automation.form.messageDescription")}
            >
              <Textarea
                id="automation-message"
                placeholder={t("automation.form.messagePlaceholder")}
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
            <FormField label={t("automation.form.triggerType")}>
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
                  <SelectValue placeholder={t("automation.form.chooseTriggerType")} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="manual">
                    {t("automation.form.manualOnly")}
                  </SelectItem>
                  <SelectItem value="once">{t("automation.form.once")}</SelectItem>
                  <SelectItem value="interval">
                    {t("automation.form.interval")}
                  </SelectItem>
                  <SelectItem value="calendar">
                    {t("automation.form.calendar")}
                  </SelectItem>
                </SelectContent>
              </Select>
            </FormField>
          </FormSection>
          {form.trigger_kind === "once" ? (
            <FormField
              label={t("automation.form.runAt")}
              description={t("automation.form.runAtDescription")}
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
            <FormField label={t("automation.form.runInterval")}>
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
                    <SelectValue placeholder={t("automation.form.chooseInterval")} />
                  </SelectTrigger>
                  <SelectContent>
                    {INTERVAL_OPTIONS.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {t(option.labelKey)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {form.interval_preset === "custom" ? (
                  <Input
                    className="h-10"
                    type="number"
                    min="1"
                    placeholder={t("automation.form.minutes")}
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
              label={t("automation.form.calendarPlan")}
              description={t("automation.form.calendarDescription")}
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
                    <SelectValue placeholder={t("automation.form.chooseFrequency")} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="daily">{t("automation.trigger.daily")}</SelectItem>
                    <SelectItem value="weekly">{t("automation.trigger.weekly")}</SelectItem>
                    <SelectItem value="monthly">{t("automation.trigger.monthly")}</SelectItem>
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
                        {t(weekday.labelKey)}
                      </Button>
                    )
                  })}
                </div>
              ) : null}
              {form.calendar_frequency === "monthly" ? (
                <Input
                  className="h-10"
                  placeholder={t("automation.form.monthlyDays")}
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
              {t("automation.form.cancel")}
            </Button>
            <AsyncButton
              type="submit"
              isLoading={saving}
              loadingLabel={t("automation.form.saving")}
              disabled={!editingAutomation}
            >
              {t("automation.form.save")}
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
  const { t } = useTranslation()
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
                {t("automation.dateTime.onceLabel")}
              </span>
            </span>
          </span>
          <span className="text-muted-foreground shrink-0 text-xs">
            {t("automation.dateTime.modify")}
          </span>
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
              <p className="text-sm font-medium">
                {t("automation.dateTime.time")}
              </p>
              <p className="text-muted-foreground text-xs">
                {t("automation.dateTime.timeDescription")}
              </p>
            </div>

            <div className="grid grid-cols-[1fr_auto_1fr_auto_1fr] items-end gap-2">
              <TimeNumberField
                label={t("automation.dateTime.hour")}
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
                label={t("automation.dateTime.minute")}
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
                label={t("automation.dateTime.second")}
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
                {t("automation.dateTime.nextSlot")}
              </Button>
              <Button type="button" onClick={() => setOpen(false)}>
                {t("automation.dateTime.apply")}
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
  const { t } = useTranslation()

  return (
    <AppDialog
      open={open}
      title={title}
      description={t("automation.form.dialogDescription")}
      onOpenChange={onOpenChange}
    >
      {children}
    </AppDialog>
  )
}
