import * as React from "react"
import { Link, useNavigate, useParams } from "react-router-dom"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import { useAppSession } from "@/features/auth/app-session"
import {
  createAgentProfile,
  createAgentRule,
  deleteAgentProfile,
  deleteAgentRule,
  getAgentProfile,
  getAgentProfileRules,
  listAgentProfiles,
  listAgentRules,
  replaceAgentProfileRules,
  updateAgentProfile,
  updateAgentRule,
  type AgentProfile,
  type AgentRule,
  type AgentRuleKind,
} from "@/lib/api/gateway-client"
import { ModuleDashboardPage } from "@/pages/shared/module-dashboard-page"

type ProductMetric = {
  label: string
  value: string
  detail: string
}

function productMetrics(primary: ProductMetric): [
  ProductMetric,
  ProductMetric,
  ProductMetric,
] {
  return [
    primary,
    {
      label: "链路",
      value: "Gateway",
      detail: "复用 agent 主运行链路",
    },
    {
      label: "状态",
      value: "MVP",
      detail: "当前阶段接入最小管理 UI",
    },
  ]
}

function useAccessToken() {
  const { accessToken } = useAppSession()
  if (!accessToken) {
    throw new Error("auth required")
  }
  return accessToken
}

function ErrorNotice({ message }: { message: string | null }) {
  if (!message) {
    return null
  }

  return (
    <Card className="border-destructive/30 bg-destructive/5">
      <CardContent className="text-destructive pt-6 text-sm">{message}</CardContent>
    </Card>
  )
}

export function AiTeammatesPage() {
  const accessToken = useAccessToken()
  const navigate = useNavigate()
  const [profiles, setProfiles] = React.useState<AgentProfile[]>([])
  const [name, setName] = React.useState("")
  const [description, setDescription] = React.useState("")
  const [systemPrompt, setSystemPrompt] = React.useState("")
  const [error, setError] = React.useState<string | null>(null)
  const [loading, setLoading] = React.useState(true)
  const [saving, setSaving] = React.useState(false)

  const reload = React.useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const response = await listAgentProfiles(accessToken)
      setProfiles(response.profiles)
    } catch (err) {
      setError(err instanceof Error ? err.message : "failed to load teammates")
    } finally {
      setLoading(false)
    }
  }, [accessToken])

  React.useEffect(() => {
    void reload()
  }, [reload])

  async function handleCreate(event: React.FormEvent) {
    event.preventDefault()
    setSaving(true)
    setError(null)
    try {
      const response = await createAgentProfile(accessToken, {
        name,
        description,
        system_prompt: systemPrompt,
      })
      setName("")
      setDescription("")
      setSystemPrompt("")
      await reload()
      navigate(`/ai-teammates/${response.profile.id}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : "failed to create teammate")
    } finally {
      setSaving(false)
    }
  }

  return (
    <ModuleDashboardPage
      title="AI Teammates"
      subtitle="配置可运行的 Agent Profile，并绑定 Skills / Rules / Memory。"
      metrics={productMetrics({
        label: "Teammates",
        value: String(profiles.length),
        detail: loading ? "加载中" : "当前可用 profile 数量",
      })}
      highlights={[
        "AI Teammate 是运行配置，不是独立 runtime。",
        "每个 teammate 会在运行时解析为 AgentProfileRuntimePlan。",
        "第一版支持基础 prompt 编辑和 rules 绑定。",
      ]}
    >
      <ErrorNotice message={error} />

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
        <Card className="bg-muted/50">
          <CardHeader>
            <CardTitle className="text-base">Teammates</CardTitle>
            <CardDescription>选择一个 teammate 进入详情编辑。</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {profiles.map((profile) => (
              <Link
                key={profile.id}
                to={`/ai-teammates/${profile.id}`}
                className="border-border bg-background hover:bg-muted block rounded-lg border p-4 transition-colors"
              >
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="font-medium">{profile.name}</p>
                    <p className="text-muted-foreground mt-1 text-sm">
                      {profile.description || "No description"}
                    </p>
                  </div>
                  <span className="text-muted-foreground text-xs">
                    rev {profile.revision}
                  </span>
                </div>
              </Link>
            ))}
            {!loading && profiles.length === 0 ? (
              <p className="text-muted-foreground text-sm">No teammates yet.</p>
            ) : null}
          </CardContent>
        </Card>

        <Card className="bg-muted/50">
          <CardHeader>
            <CardTitle className="text-base">Create teammate</CardTitle>
            <CardDescription>创建一个个人 AI Teammate。</CardDescription>
          </CardHeader>
          <CardContent>
            <form className="space-y-3" onSubmit={handleCreate}>
              <Input
                placeholder="Name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                required
              />
              <Input
                placeholder="Description"
                value={description}
                onChange={(event) => setDescription(event.target.value)}
              />
              <Textarea
                placeholder="System prompt"
                value={systemPrompt}
                onChange={(event) => setSystemPrompt(event.target.value)}
                rows={6}
              />
              <Button type="submit" disabled={saving}>
                {saving ? "Creating..." : "Create"}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </ModuleDashboardPage>
  )
}

export function AiTeammateDetailPage() {
  const accessToken = useAccessToken()
  const navigate = useNavigate()
  const { profileId = "default" } = useParams()
  const [profile, setProfile] = React.useState<AgentProfile | null>(null)
  const [rules, setRules] = React.useState<AgentRule[]>([])
  const [boundRuleIds, setBoundRuleIds] = React.useState<Set<string>>(new Set())
  const [form, setForm] = React.useState({
    name: "",
    description: "",
    system_prompt: "",
  })
  const [error, setError] = React.useState<string | null>(null)
  const [saving, setSaving] = React.useState(false)
  const isDefault = profileId === "default"

  const reload = React.useCallback(async () => {
    setError(null)
    try {
      const [profileResponse, rulesResponse, bindingsResponse] = await Promise.all([
        getAgentProfile(accessToken, profileId),
        listAgentRules(accessToken),
        getAgentProfileRules(accessToken, profileId),
      ])
      setProfile(profileResponse.profile)
      setRules(rulesResponse.rules)
      setBoundRuleIds(new Set(bindingsResponse.rules.map((rule) => rule.id)))
      setForm({
        name: profileResponse.profile.name,
        description: profileResponse.profile.description || "",
        system_prompt: profileResponse.profile.system_prompt || "",
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : "failed to load teammate")
    }
  }, [accessToken, profileId])

  React.useEffect(() => {
    void reload()
  }, [reload])

  async function handleSaveProfile(event: React.FormEvent) {
    event.preventDefault()
    setSaving(true)
    setError(null)
    try {
      const response = await updateAgentProfile(accessToken, profileId, form)
      setProfile(response.profile)
    } catch (err) {
      setError(err instanceof Error ? err.message : "failed to save teammate")
    } finally {
      setSaving(false)
    }
  }

  async function handleSaveRules() {
    setSaving(true)
    setError(null)
    try {
      const selected = rules
        .filter((rule) => boundRuleIds.has(rule.id))
        .map((rule, index) => ({
          rule_id: rule.id,
          enabled: true,
          sort_order: index,
        }))
      await replaceAgentProfileRules(accessToken, profileId, selected)
      await reload()
    } catch (err) {
      setError(err instanceof Error ? err.message : "failed to bind rules")
    } finally {
      setSaving(false)
    }
  }

  async function handleArchive() {
    setSaving(true)
    setError(null)
    try {
      await deleteAgentProfile(accessToken, profileId)
      navigate("/ai-teammates")
    } catch (err) {
      setError(err instanceof Error ? err.message : "failed to archive teammate")
      setSaving(false)
    }
  }

  return (
    <ModuleDashboardPage
      title={profile?.name || "AI Teammate Detail"}
      subtitle="查看和编辑单个 Agent Profile。"
      metrics={productMetrics({
        label: "Revision",
        value: String(profile?.revision ?? "-"),
        detail: profile?.status || "loading",
      })}
      highlights={[
        "Profile prompt 和绑定 rules 会进入 AgentProfileRuntimePlan。",
        "保存 rules 后，后续用该 teammate 运行的 conversation 会注入这些 rules。",
        "Default Agent 是隐式 profile，当前只读。",
      ]}
    >
      <ErrorNotice message={error} />

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_420px]">
        <Card className="bg-muted/50">
          <CardHeader>
            <CardTitle className="text-base">Profile</CardTitle>
            <CardDescription>基础身份和 system prompt。</CardDescription>
          </CardHeader>
          <CardContent>
            <form className="space-y-3" onSubmit={handleSaveProfile}>
              <Input
                value={form.name}
                onChange={(event) =>
                  setForm((current) => ({ ...current, name: event.target.value }))
                }
                disabled={isDefault}
                required
              />
              <Input
                value={form.description}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    description: event.target.value,
                  }))
                }
                disabled={isDefault}
                placeholder="Description"
              />
              <Textarea
                value={form.system_prompt}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    system_prompt: event.target.value,
                  }))
                }
                disabled={isDefault}
                placeholder="System prompt"
                rows={10}
              />
              <div className="flex gap-2">
                <Button type="submit" disabled={saving || isDefault}>
                  {saving ? "Saving..." : "Save profile"}
                </Button>
                <Button
                  type="button"
                  variant="destructive"
                  disabled={saving || isDefault}
                  onClick={handleArchive}
                >
                  Archive
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>

        <Card className="bg-muted/50">
          <CardHeader>
            <CardTitle className="text-base">Rules</CardTitle>
            <CardDescription>绑定已有个人 rules。</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {rules.map((rule) => (
              <label
                key={rule.id}
                className="border-border bg-background flex items-start justify-between gap-3 rounded-lg border p-3"
              >
                <span>
                  <span className="block text-sm font-medium">
                    {rule.name || rule.kind}
                  </span>
                  <span className="text-muted-foreground mt-1 line-clamp-3 block text-sm">
                    {rule.content}
                  </span>
                </span>
                <Switch
                  checked={boundRuleIds.has(rule.id)}
                  disabled={isDefault}
                  onCheckedChange={(checked) => {
                    setBoundRuleIds((current) => {
                      const next = new Set(current)
                      if (checked) {
                        next.add(rule.id)
                      } else {
                        next.delete(rule.id)
                      }
                      return next
                    })
                  }}
                />
              </label>
            ))}
            {rules.length === 0 ? (
              <p className="text-muted-foreground text-sm">
                No rules yet. Create rules from Skills, Rules, Memory in the next phase.
              </p>
            ) : null}
            <Button disabled={saving || isDefault} onClick={handleSaveRules}>
              Save rules
            </Button>
          </CardContent>
        </Card>
      </div>
    </ModuleDashboardPage>
  )
}

export function AgentResourcesPage() {
  const accessToken = useAccessToken()
  const [rules, setRules] = React.useState<AgentRule[]>([])
  const [editingRule, setEditingRule] = React.useState<AgentRule | null>(null)
  const [form, setForm] = React.useState<{
    name: string
    kind: AgentRuleKind
    content: string
    enabled: boolean
  }>({
    name: "",
    kind: "behavior",
    content: "",
    enabled: true,
  })
  const [error, setError] = React.useState<string | null>(null)
  const [saving, setSaving] = React.useState(false)

  const reload = React.useCallback(async () => {
    setError(null)
    try {
      const response = await listAgentRules(accessToken)
      setRules(response.rules)
    } catch (err) {
      setError(err instanceof Error ? err.message : "failed to load rules")
    }
  }, [accessToken])

  React.useEffect(() => {
    void reload()
  }, [reload])

  function startEdit(rule: AgentRule) {
    setEditingRule(rule)
    setForm({
      name: rule.name || "",
      kind: rule.kind,
      content: rule.content,
      enabled: rule.enabled,
    })
  }

  function resetForm() {
    setEditingRule(null)
    setForm({
      name: "",
      kind: "behavior",
      content: "",
      enabled: true,
    })
  }

  async function handleSaveRule(event: React.FormEvent) {
    event.preventDefault()
    setSaving(true)
    setError(null)
    try {
      if (editingRule) {
        await updateAgentRule(accessToken, editingRule.id, form)
      } else {
        await createAgentRule(accessToken, form)
      }
      resetForm()
      await reload()
    } catch (err) {
      setError(err instanceof Error ? err.message : "failed to save rule")
    } finally {
      setSaving(false)
    }
  }

  async function handleToggleRule(rule: AgentRule, enabled: boolean) {
    setSaving(true)
    setError(null)
    try {
      await updateAgentRule(accessToken, rule.id, { enabled })
      await reload()
    } catch (err) {
      setError(err instanceof Error ? err.message : "failed to update rule")
    } finally {
      setSaving(false)
    }
  }

  async function handleArchiveRule(rule: AgentRule) {
    setSaving(true)
    setError(null)
    try {
      await deleteAgentRule(accessToken, rule.id)
      if (editingRule?.id === rule.id) {
        resetForm()
      }
      await reload()
    } catch (err) {
      setError(err instanceof Error ? err.message : "failed to archive rule")
    } finally {
      setSaving(false)
    }
  }

  return (
    <ModuleDashboardPage
      title="Skills, Rules, Memory"
      subtitle="用户个人智能体资产库。"
      metrics={productMetrics({
        label: "Rules",
        value: String(rules.length),
        detail: "当前个人 rules 数量",
      })}
      highlights={[
        "Skills / Rules / Memory 是个人资产库。",
        "AI Teammate 从这里选择资产并编译进运行上下文。",
        "第一版先落地 Rules，Skills 和 Memory 后续补齐。",
      ]}
    >
      <ErrorNotice message={error} />

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_420px]">
        <Card className="bg-muted/50">
          <CardHeader>
            <CardTitle className="text-base">Rules</CardTitle>
            <CardDescription>创建和维护个人智能体规则。</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {rules.map((rule) => (
              <div
                key={rule.id}
                className="border-border bg-background rounded-lg border p-4"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-medium">{rule.name || rule.kind}</p>
                    <p className="text-muted-foreground mt-1 text-xs">
                      {rule.kind} · rev {rule.revision}
                    </p>
                  </div>
                  <Switch
                    checked={rule.enabled}
                    disabled={saving}
                    onCheckedChange={(checked) => void handleToggleRule(rule, checked)}
                  />
                </div>
                <p className="text-muted-foreground mt-3 line-clamp-4 text-sm leading-6">
                  {rule.content}
                </p>
                <div className="mt-3 flex gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => startEdit(rule)}
                  >
                    Edit
                  </Button>
                  <Button
                    type="button"
                    variant="destructive"
                    size="sm"
                    disabled={saving}
                    onClick={() => void handleArchiveRule(rule)}
                  >
                    Archive
                  </Button>
                </div>
              </div>
            ))}
            {rules.length === 0 ? (
              <p className="text-muted-foreground text-sm">No rules yet.</p>
            ) : null}
          </CardContent>
        </Card>

        <Card className="bg-muted/50">
          <CardHeader>
            <CardTitle className="text-base">
              {editingRule ? "Edit rule" : "Create rule"}
            </CardTitle>
            <CardDescription>
              Rules 会被 AI Teammate 绑定后注入 prompt。
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form className="space-y-3" onSubmit={handleSaveRule}>
              <Input
                placeholder="Rule name"
                value={form.name}
                onChange={(event) =>
                  setForm((current) => ({ ...current, name: event.target.value }))
                }
                required
              />
              <select
                className="border-input bg-background ring-offset-background focus-visible:ring-ring flex h-9 w-full rounded-md border px-3 py-1 text-sm shadow-sm transition-colors focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50"
                value={form.kind}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    kind: event.target.value as AgentRuleKind,
                  }))
                }
              >
                <option value="behavior">behavior</option>
                <option value="system">system</option>
                <option value="tool">tool</option>
              </select>
              <Textarea
                placeholder="Rule content"
                value={form.content}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    content: event.target.value,
                  }))
                }
                rows={8}
                required
              />
              <label className="flex items-center justify-between rounded-lg border p-3 text-sm">
                Enabled
                <Switch
                  checked={form.enabled}
                  onCheckedChange={(checked) =>
                    setForm((current) => ({ ...current, enabled: checked }))
                  }
                />
              </label>
              <div className="flex gap-2">
                <Button type="submit" disabled={saving}>
                  {saving ? "Saving..." : editingRule ? "Save rule" : "Create rule"}
                </Button>
                {editingRule ? (
                  <Button type="button" variant="outline" onClick={resetForm}>
                    Cancel
                  </Button>
                ) : null}
              </div>
            </form>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card className="bg-muted/50">
          <CardHeader>
            <CardTitle className="text-base">Skills</CardTitle>
            <CardDescription>后续阶段接入 skill catalog 和绑定。</CardDescription>
          </CardHeader>
        </Card>
        <Card className="bg-muted/50">
          <CardHeader>
            <CardTitle className="text-base">Memory</CardTitle>
            <CardDescription>后续阶段接入显式个人 memory。</CardDescription>
          </CardHeader>
        </Card>
      </div>
    </ModuleDashboardPage>
  )
}

export function AutomationPage() {
  return (
    <ModuleDashboardPage
      title="Automation"
      subtitle="主动触发某个 AI Teammate 执行任务。"
      metrics={productMetrics({
        label: "定位",
        value: "主动触发",
        detail: "trigger + target Agent Profile + task",
      })}
      highlights={[
        "Automation 不绕过 agent 主链路。",
        "后续会绑定 target AI Teammate，并复用 gateway run。",
      ]}
    />
  )
}
