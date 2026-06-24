import * as React from "react"
import { useNavigate } from "react-router-dom"
import { Clock3, Edit3, History, Play, Plus, Settings2, Zap } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { useAppSession } from "@/features/auth/app-session"
import {
  createAutomation,
  deleteAutomation,
  listAgentProfiles,
  listAutomationRuns,
  listAutomations,
  runAutomation,
  tickDueAutomations,
  updateAutomation,
  type AgentProfile,
  type Automation,
  type AutomationRun,
} from "@/lib/api/gateway-client"

import { AgentProductPage, EmptyState, ErrorNotice, SearchBar, StatusBadge, WorkbenchCard } from "./shared"

function useAccessToken() {
  const { accessToken } = useAppSession()
  if (!accessToken) throw new Error("auth required")
  return accessToken
}

export function AutomationPage() {
  const accessToken = useAccessToken()
  const navigate = useNavigate()
  const [automations, setAutomations] = React.useState<Automation[]>([])
  const [automationRuns, setAutomationRuns] = React.useState<Record<string, AutomationRun[]>>({})
  const [profiles, setProfiles] = React.useState<AgentProfile[]>([])
  const [editingAutomation, setEditingAutomation] = React.useState<Automation | null>(null)
  const [query, setQuery] = React.useState("")
  const [form, setForm] = React.useState({
    name: "",
    description: "",
    agent_profile_id: "default",
    task_prompt: "",
    trigger_kind: "manual",
    once_run_at: "",
    cron_interval_minutes: "60",
  })
  const [error, setError] = React.useState<string | null>(null)
  const [saving, setSaving] = React.useState(false)
  const [lastRunConversationId, setLastRunConversationId] = React.useState<string | null>(null)

  const reload = React.useCallback(async () => {
    setError(null)
    try {
      const [automationsResponse, profilesResponse] = await Promise.all([
        listAutomations(accessToken),
        listAgentProfiles(accessToken),
      ])
      setAutomations(automationsResponse.automations)
      setProfiles(profilesResponse.profiles)
      const runPairs = await Promise.all(
        automationsResponse.automations.map(async (automation) => {
          const runsResponse = await listAutomationRuns(accessToken, automation.id)
          return [automation.id, runsResponse.runs] as const
        })
      )
      setAutomationRuns(Object.fromEntries(runPairs))
      if (
        profilesResponse.profiles.length > 0 &&
        !profilesResponse.profiles.some((profile) => profile.id === form.agent_profile_id)
      ) {
        setForm((current) => ({
          ...current,
          agent_profile_id: profilesResponse.profiles[0]?.id ?? "default",
        }))
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "failed to load automations")
    }
  }, [accessToken, form.agent_profile_id])

  React.useEffect(() => {
    void reload()
  }, [reload])

  const filteredAutomations = automations.filter((automation) =>
    `${automation.name} ${automation.description ?? ""} ${automation.task_prompt}`.toLowerCase().includes(query.toLowerCase())
  )

  function resetForm() {
    setEditingAutomation(null)
    setForm({
      name: "",
      description: "",
      agent_profile_id: profiles[0]?.id ?? "default",
      task_prompt: "",
      trigger_kind: "manual",
      once_run_at: "",
      cron_interval_minutes: "60",
    })
  }

  function startEditAutomation(automation: Automation) {
    setEditingAutomation(automation)
    setForm({
      name: automation.name,
      description: automation.description || "",
      agent_profile_id: automation.agent_profile_id,
      task_prompt: automation.task_prompt,
      trigger_kind: automation.trigger_kind || "manual",
      once_run_at:
        typeof automation.trigger_spec?.run_at === "string" ? automation.trigger_spec.run_at : "",
      cron_interval_minutes:
        typeof automation.trigger_spec?.interval_minutes === "number"
          ? String(automation.trigger_spec.interval_minutes)
          : "60",
    })
  }

  function buildTriggerSpec() {
    if (form.trigger_kind === "once") return { run_at: form.once_run_at }
    if (form.trigger_kind === "cron") return { interval_minutes: Number(form.cron_interval_minutes) || 60 }
    return {}
  }

  async function handleSaveAutomation(event: React.FormEvent) {
    event.preventDefault()
    setSaving(true)
    setError(null)
    const payload = {
      name: form.name,
      description: form.description,
      agent_profile_id: form.agent_profile_id,
      task_prompt: form.task_prompt,
      trigger_kind: form.trigger_kind,
      trigger_spec: buildTriggerSpec(),
    }
    try {
      if (editingAutomation) await updateAutomation(accessToken, editingAutomation.id, payload)
      else await createAutomation(accessToken, payload)
      resetForm()
      await reload()
    } catch (err) {
      setError(err instanceof Error ? err.message : "failed to save automation")
    } finally {
      setSaving(false)
    }
  }

  async function handleArchiveAutomation(automation: Automation) {
    setSaving(true)
    setError(null)
    try {
      await deleteAutomation(accessToken, automation.id)
      if (editingAutomation?.id === automation.id) resetForm()
      await reload()
    } catch (err) {
      setError(err instanceof Error ? err.message : "failed to archive automation")
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
      await reload()
    } catch (err) {
      setError(err instanceof Error ? err.message : "failed to update automation")
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
      await reload()
    } catch (err) {
      setError(err instanceof Error ? err.message : "failed to run automation")
    } finally {
      setSaving(false)
    }
  }

  async function handleTickDueAutomations() {
    setSaving(true)
    setError(null)
    setLastRunConversationId(null)
    try {
      const response = await tickDueAutomations(accessToken)
      const firstConversation = response.triggered[0]?.conversation_id
      if (firstConversation) setLastRunConversationId(firstConversation)
      await reload()
    } catch (err) {
      setError(err instanceof Error ? err.message : "failed to trigger due automations")
    } finally {
      setSaving(false)
    }
  }

  return (
    <AgentProductPage
      eyebrow="Automation"
      title="Active Trigger Console"
      subtitle="Automation 是主动触发某个 AI Teammate 执行任务。它不绕过 agent 主链路，而是创建绑定目标 teammate 的 conversation 并发送任务。"
      metrics={[
        {
          label: "Automations",
          value: String(automations.length),
          detail: "configured trigger profiles",
          icon: Zap,
          tone: "amber",
        },
        {
          label: "Due Scheduled",
          value: String(automations.filter((automation) => automation.next_run_at).length),
          detail: "once / cron next_run_at",
          icon: Clock3,
          tone: "blue",
        },
        {
          label: "Run Records",
          value: String(Object.values(automationRuns).reduce((sum, runs) => sum + runs.length, 0)),
          detail: "last 50 per automation",
          icon: History,
          tone: "green",
        },
      ]}
      headerActions={
        <div className="flex gap-2">
          <Button variant="outline" disabled={saving} onClick={() => void handleTickDueAutomations()}>
            <Clock3 className="mr-2 size-4" />
            Tick due
          </Button>
          <Button onClick={() => document.getElementById("automation-editor")?.scrollIntoView()}>
            <Plus className="mr-2 size-4" />
            New Automation
          </Button>
        </div>
      }
    >
      <ErrorNotice message={error} />

      {lastRunConversationId ? (
        <div className="border-primary/30 bg-primary/10 rounded-md border px-4 py-3 text-sm">
          Automation triggered.{" "}
          <Button variant="link" className="h-auto p-0" onClick={() => navigate(`/chat/${lastRunConversationId}`)}>
            Open conversation
          </Button>
        </div>
      ) : null}

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_430px]">
        <WorkbenchCard
          title="Trigger Inventory"
          description="Run now、once 和 cron 都进入同一 conversation send 主链路。"
          icon={Zap}
          actions={<div className="hidden min-w-72 md:block"><SearchBar value={query} onChange={setQuery} placeholder="Search automations..." /></div>}
        >
          <div className="space-y-3 md:hidden">
            <SearchBar value={query} onChange={setQuery} placeholder="Search automations..." />
          </div>
          <div className="mt-3 grid gap-3">
            {filteredAutomations.map((automation) => (
              <div key={automation.id} className="rounded-md border border-border bg-background/60 p-4 transition-colors hover:bg-muted/60">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="font-medium">{automation.name}</p>
                      <StatusBadge status={automation.status} />
                    </div>
                    <p className="text-muted-foreground mt-1 text-xs">
                      {automation.trigger_kind} · teammate {automation.agent_profile_id}
                    </p>
                    {automation.next_run_at ? (
                      <p className="text-muted-foreground mt-1 text-xs">next: {new Date(automation.next_run_at).toLocaleString()}</p>
                    ) : null}
                  </div>
                  <Badge variant="outline">{automation.trigger_kind}</Badge>
                </div>
                <p className="text-muted-foreground mt-3 line-clamp-3 text-sm leading-6">{automation.task_prompt}</p>
                {(automationRuns[automation.id] ?? []).slice(0, 3).length > 0 ? (
                  <div className="mt-3 space-y-1 rounded-md border border-border bg-muted/30 p-2 text-xs">
                    {(automationRuns[automation.id] ?? []).slice(0, 3).map((run) => (
                      <div key={run.id} className="text-muted-foreground flex items-center justify-between gap-2">
                        <span>{run.status}</span>
                        {run.conversation_id ? (
                          <button type="button" className="text-primary hover:underline" onClick={() => navigate(`/chat/${run.conversation_id}`)}>
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
                  <Button size="sm" disabled={saving || automation.status !== "active"} onClick={() => void handleRunAutomation(automation)}>
                    <Play className="mr-2 size-3.5" />
                    Run now
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => startEditAutomation(automation)}>
                    <Edit3 className="mr-2 size-3.5" />
                    Edit
                  </Button>
                  <Button variant="outline" size="sm" disabled={saving} onClick={() => void handleToggleAutomation(automation)}>
                    {automation.status === "active" ? "Disable" : "Enable"}
                  </Button>
                  <Button variant="destructive" size="sm" disabled={saving} onClick={() => void handleArchiveAutomation(automation)}>
                    Archive
                  </Button>
                </div>
              </div>
            ))}
            {filteredAutomations.length === 0 ? <EmptyState title="No automations" detail="Create an automation with the editor on the right." /> : null}
          </div>
        </WorkbenchCard>

        <WorkbenchCard title={editingAutomation ? "Edit automation" : "Create automation"} description="选择 target teammate、task prompt 和 trigger。" icon={Settings2}>
          <form id="automation-editor" className="space-y-3" onSubmit={handleSaveAutomation}>
            <Input placeholder="Automation name" value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} required />
            <Input placeholder="Description" value={form.description} onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))} />
            <select className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm" value={form.agent_profile_id} onChange={(event) => setForm((current) => ({ ...current, agent_profile_id: event.target.value }))}>
              {profiles.map((profile) => <option key={profile.id} value={profile.id}>{profile.name}</option>)}
            </select>
            <Textarea placeholder="Task prompt" value={form.task_prompt} onChange={(event) => setForm((current) => ({ ...current, task_prompt: event.target.value }))} rows={8} required />
            <select className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm" value={form.trigger_kind} onChange={(event) => setForm((current) => ({ ...current, trigger_kind: event.target.value }))}>
              <option value="manual">manual</option>
              <option value="once">once</option>
              <option value="cron">cron</option>
            </select>
            {form.trigger_kind === "once" ? (
              <Input placeholder="Run at, RFC3339 e.g. 2026-06-24T12:00:00Z" value={form.once_run_at} onChange={(event) => setForm((current) => ({ ...current, once_run_at: event.target.value }))} required />
            ) : null}
            {form.trigger_kind === "cron" ? (
              <Input type="number" min="1" placeholder="Interval minutes" value={form.cron_interval_minutes} onChange={(event) => setForm((current) => ({ ...current, cron_interval_minutes: event.target.value }))} required />
            ) : null}
            <div className="flex gap-2">
              <Button type="submit" disabled={saving}>{editingAutomation ? "Save automation" : "Create automation"}</Button>
              {editingAutomation ? <Button type="button" variant="outline" onClick={resetForm}>Cancel</Button> : null}
            </div>
          </form>
        </WorkbenchCard>
      </div>
    </AgentProductPage>
  )
}
