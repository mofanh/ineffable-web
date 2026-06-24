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
  createAutomation,
  createMemoryEntry,
  createAgentRule,
  deleteAgentProfile,
  deleteAutomation,
  deleteMemoryEntry,
  deleteAgentRule,
  getAgentProfile,
  getAgentProfileMemory,
  getAgentProfileRules,
  getAgentProfileSkills,
  listAgentProfiles,
  listAgentRules,
  listAutomationRuns,
  listAutomations,
  listMemoryEntries,
  listSkillsCatalog,
  replaceAgentProfileMemory,
  replaceAgentProfileRules,
  replaceAgentProfileSkills,
  runAutomation,
  tickDueAutomations,
  updateAgentProfile,
  updateAutomation,
  updateMemoryEntry,
  updateAgentRule,
  type AgentProfile,
  type AgentRule,
  type AgentRuleKind,
  type AgentSkillRef,
  type Automation,
  type AutomationRun,
  type MemoryEntry,
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
  const [memoryEntries, setMemoryEntries] = React.useState<MemoryEntry[]>([])
  const [skillCatalog, setSkillCatalog] = React.useState<AgentSkillRef[]>([])
  const [boundRuleIds, setBoundRuleIds] = React.useState<Set<string>>(new Set())
  const [boundMemoryIds, setBoundMemoryIds] = React.useState<Set<string>>(new Set())
  const [boundSkills, setBoundSkills] = React.useState<AgentSkillRef[]>([])
  const [skillName, setSkillName] = React.useState("")
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
      const [
        profileResponse,
        rulesResponse,
        bindingsResponse,
        skillsResponse,
        catalogResponse,
        memoryResponse,
        profileMemoryResponse,
      ] =
        await Promise.all([
          getAgentProfile(accessToken, profileId),
          listAgentRules(accessToken),
          getAgentProfileRules(accessToken, profileId),
          getAgentProfileSkills(accessToken, profileId),
          listSkillsCatalog(accessToken),
          listMemoryEntries(accessToken),
          getAgentProfileMemory(accessToken, profileId),
        ])
      setProfile(profileResponse.profile)
      setRules(rulesResponse.rules)
      setMemoryEntries(memoryResponse.memory)
      setBoundRuleIds(new Set(bindingsResponse.rules.map((rule) => rule.id)))
      setBoundMemoryIds(new Set(profileMemoryResponse.memory.map((entry) => entry.id)))
      setBoundSkills(skillsResponse.skills)
      setSkillCatalog(catalogResponse.skills)
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

  async function handleSaveMemory() {
    setSaving(true)
    setError(null)
    try {
      const selected = memoryEntries
        .filter((entry) => boundMemoryIds.has(entry.id))
        .map((entry, index) => ({
          memory_entry_id: entry.id,
          enabled: true,
          sort_order: index,
        }))
      await replaceAgentProfileMemory(accessToken, profileId, selected)
      await reload()
    } catch (err) {
      setError(err instanceof Error ? err.message : "failed to bind memory")
    } finally {
      setSaving(false)
    }
  }

  async function handleSaveSkills(nextSkills = boundSkills) {
    setSaving(true)
    setError(null)
    try {
      await replaceAgentProfileSkills(
        accessToken,
        profileId,
        nextSkills.map((skill, index) => ({
          name: skill.name,
          source: skill.source,
          enabled: skill.enabled,
          sort_order: index,
        }))
      )
      await reload()
    } catch (err) {
      setError(err instanceof Error ? err.message : "failed to bind skills")
    } finally {
      setSaving(false)
    }
  }

  function handleAddSkill(event: React.FormEvent) {
    event.preventDefault()
    const name = skillName.trim()
    if (!name || boundSkills.some((skill) => skill.name === name)) {
      return
    }
    setBoundSkills((current) => [...current, { name, enabled: true }])
    setSkillName("")
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

      <Card className="bg-muted/50">
        <CardHeader>
          <CardTitle className="text-base">Memory</CardTitle>
          <CardDescription>绑定显式个人 memory，运行时会作为 teammate context 注入。</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {memoryEntries.map((entry) => (
            <label
              key={entry.id}
              className="border-border bg-background flex items-start justify-between gap-3 rounded-lg border p-3"
            >
              <span>
                <span className="block text-sm font-medium">{entry.title}</span>
                <span className="text-muted-foreground mt-1 line-clamp-3 block text-sm">
                  {entry.content}
                </span>
                {entry.tags.length > 0 ? (
                  <span className="text-muted-foreground mt-2 block text-xs">
                    {entry.tags.join(", ")}
                  </span>
                ) : null}
              </span>
              <Switch
                checked={boundMemoryIds.has(entry.id)}
                disabled={isDefault}
                onCheckedChange={(checked) => {
                  setBoundMemoryIds((current) => {
                    const next = new Set(current)
                    if (checked) {
                      next.add(entry.id)
                    } else {
                      next.delete(entry.id)
                    }
                    return next
                  })
                }}
              />
            </label>
          ))}
          {memoryEntries.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              No memory yet. Create memory from Skills, Rules, Memory.
            </p>
          ) : null}
          <Button disabled={saving || isDefault} onClick={handleSaveMemory}>
            Save memory
          </Button>
        </CardContent>
      </Card>

      <Card className="bg-muted/50">
        <CardHeader>
          <CardTitle className="text-base">Skills</CardTitle>
          <CardDescription>
            绑定后会进入 teammate 的 skill allowlist。当前 catalog 可为空，可手动输入 skill name。
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <form className="flex gap-2" onSubmit={handleAddSkill}>
            <Input
              list="agent-skill-catalog"
              placeholder="Skill name, e.g. deploy"
              value={skillName}
              disabled={isDefault}
              onChange={(event) => setSkillName(event.target.value)}
            />
            <datalist id="agent-skill-catalog">
              {skillCatalog.map((skill) => (
                <option key={skill.name} value={skill.name} />
              ))}
            </datalist>
            <Button type="submit" disabled={isDefault || !skillName.trim()}>
              Add
            </Button>
          </form>
          {boundSkills.map((skill) => (
            <div
              key={`${skill.source ?? "local"}:${skill.name}`}
              className="border-border bg-background flex items-center justify-between gap-3 rounded-lg border p-3"
            >
              <div>
                <p className="text-sm font-medium">{skill.name}</p>
                <p className="text-muted-foreground text-xs">
                  {skill.source || "local/user"} · {skill.enabled ? "enabled" : "disabled"}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Switch
                  checked={skill.enabled}
                  disabled={isDefault}
                  onCheckedChange={(checked) => {
                    setBoundSkills((current) =>
                      current.map((item) =>
                        item.name === skill.name ? { ...item, enabled: checked } : item
                      )
                    )
                  }}
                />
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={isDefault}
                  onClick={() => {
                    setBoundSkills((current) =>
                      current.filter((item) => item.name !== skill.name)
                    )
                  }}
                >
                  Remove
                </Button>
              </div>
            </div>
          ))}
          {boundSkills.length === 0 ? (
            <p className="text-muted-foreground text-sm">No skills bound.</p>
          ) : null}
          <Button
            disabled={saving || isDefault}
            onClick={() => {
              void handleSaveSkills()
            }}
          >
            Save skills
          </Button>
        </CardContent>
      </Card>
    </ModuleDashboardPage>
  )
}

export function AgentResourcesPage() {
  const accessToken = useAccessToken()
  const [rules, setRules] = React.useState<AgentRule[]>([])
  const [memoryEntries, setMemoryEntries] = React.useState<MemoryEntry[]>([])
  const [resourceSkillCatalog, setResourceSkillCatalog] = React.useState<AgentSkillRef[]>([])
  const [editingRule, setEditingRule] = React.useState<AgentRule | null>(null)
  const [editingMemory, setEditingMemory] = React.useState<MemoryEntry | null>(null)
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
  const [memoryForm, setMemoryForm] = React.useState({
    title: "",
    content: "",
    tags: "",
    enabled: true,
  })
  const [error, setError] = React.useState<string | null>(null)
  const [saving, setSaving] = React.useState(false)

  const reload = React.useCallback(async () => {
    setError(null)
    try {
      const [rulesResponse, skillsResponse, memoryResponse] = await Promise.all([
        listAgentRules(accessToken),
        listSkillsCatalog(accessToken),
        listMemoryEntries(accessToken),
      ])
      setRules(rulesResponse.rules)
      setResourceSkillCatalog(skillsResponse.skills)
      setMemoryEntries(memoryResponse.memory)
    } catch (err) {
      setError(err instanceof Error ? err.message : "failed to load resources")
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

  function startEditMemory(memory: MemoryEntry) {
    setEditingMemory(memory)
    setMemoryForm({
      title: memory.title,
      content: memory.content,
      tags: memory.tags.join(", "),
      enabled: memory.enabled,
    })
  }

  function resetMemoryForm() {
    setEditingMemory(null)
    setMemoryForm({
      title: "",
      content: "",
      tags: "",
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

  async function handleSaveMemory(event: React.FormEvent) {
    event.preventDefault()
    setSaving(true)
    setError(null)
    const payload = {
      title: memoryForm.title,
      content: memoryForm.content,
      tags: memoryForm.tags
        .split(",")
        .map((tag) => tag.trim())
        .filter(Boolean),
      enabled: memoryForm.enabled,
    }
    try {
      if (editingMemory) {
        await updateMemoryEntry(accessToken, editingMemory.id, payload)
      } else {
        await createMemoryEntry(accessToken, payload)
      }
      resetMemoryForm()
      await reload()
    } catch (err) {
      setError(err instanceof Error ? err.message : "failed to save memory")
    } finally {
      setSaving(false)
    }
  }

  async function handleToggleMemory(memory: MemoryEntry, enabled: boolean) {
    setSaving(true)
    setError(null)
    try {
      await updateMemoryEntry(accessToken, memory.id, { enabled })
      await reload()
    } catch (err) {
      setError(err instanceof Error ? err.message : "failed to update memory")
    } finally {
      setSaving(false)
    }
  }

  async function handleArchiveMemory(memory: MemoryEntry) {
    setSaving(true)
    setError(null)
    try {
      await deleteMemoryEntry(accessToken, memory.id)
      if (editingMemory?.id === memory.id) {
        resetMemoryForm()
      }
      await reload()
    } catch (err) {
      setError(err instanceof Error ? err.message : "failed to archive memory")
    } finally {
      setSaving(false)
    }
  }

  return (
    <ModuleDashboardPage
      title="Skills, Rules, Memory"
      subtitle="用户个人智能体资产库。"
      metrics={productMetrics({
        label: "Assets",
        value: String(rules.length + memoryEntries.length),
        detail: "当前个人 rules + memory 数量",
      })}
      highlights={[
        "Skills / Rules / Memory 是个人资产库。",
        "AI Teammate 从这里选择资产并编译进运行上下文。",
        "第一版 Memory 是显式记忆，不做自动长期记忆。",
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
            <CardDescription>当前可发现的 skill catalog。</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {resourceSkillCatalog.map((skill) => (
              <div
                key={skill.name}
                className="border-border bg-background rounded-lg border p-3"
              >
                <p className="text-sm font-medium">{skill.name}</p>
                <p className="text-muted-foreground text-xs">
                  {skill.source || "local/user"} · {skill.enabled ? "enabled" : "disabled"}
                </p>
              </div>
            ))}
            {resourceSkillCatalog.length === 0 ? (
              <p className="text-muted-foreground text-sm">
                Skill catalog is not connected to agentic runtime yet.
              </p>
            ) : null}
          </CardContent>
        </Card>
        <Card className="bg-muted/50">
          <CardHeader>
            <CardTitle className="text-base">Memory</CardTitle>
            <CardDescription>创建和维护显式个人 memory。</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {memoryEntries.map((memory) => (
              <div
                key={memory.id}
                className="border-border bg-background rounded-lg border p-4"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-medium">{memory.title}</p>
                    <p className="text-muted-foreground mt-1 text-xs">
                      {memory.tags.length > 0 ? memory.tags.join(", ") : "no tags"}
                    </p>
                  </div>
                  <Switch
                    checked={memory.enabled}
                    disabled={saving}
                    onCheckedChange={(checked) =>
                      void handleToggleMemory(memory, checked)
                    }
                  />
                </div>
                <p className="text-muted-foreground mt-3 line-clamp-4 text-sm leading-6">
                  {memory.content}
                </p>
                <div className="mt-3 flex gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => startEditMemory(memory)}
                  >
                    Edit
                  </Button>
                  <Button
                    type="button"
                    variant="destructive"
                    size="sm"
                    disabled={saving}
                    onClick={() => void handleArchiveMemory(memory)}
                  >
                    Archive
                  </Button>
                </div>
              </div>
            ))}
            {memoryEntries.length === 0 ? (
              <p className="text-muted-foreground text-sm">No memory yet.</p>
            ) : null}
          </CardContent>
        </Card>
      </div>

      <Card className="bg-muted/50">
        <CardHeader>
          <CardTitle className="text-base">
            {editingMemory ? "Edit memory" : "Create memory"}
          </CardTitle>
          <CardDescription>
            Memory 被 AI Teammate 绑定后会作为显式上下文注入。
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form className="space-y-3" onSubmit={handleSaveMemory}>
            <Input
              placeholder="Memory title"
              value={memoryForm.title}
              onChange={(event) =>
                setMemoryForm((current) => ({ ...current, title: event.target.value }))
              }
              required
            />
            <Textarea
              placeholder="Memory content"
              value={memoryForm.content}
              onChange={(event) =>
                setMemoryForm((current) => ({
                  ...current,
                  content: event.target.value,
                }))
              }
              rows={6}
              required
            />
            <Input
              placeholder="Tags, comma separated"
              value={memoryForm.tags}
              onChange={(event) =>
                setMemoryForm((current) => ({ ...current, tags: event.target.value }))
              }
            />
            <label className="flex items-center justify-between rounded-lg border p-3 text-sm">
              Enabled
              <Switch
                checked={memoryForm.enabled}
                onCheckedChange={(checked) =>
                  setMemoryForm((current) => ({ ...current, enabled: checked }))
                }
              />
            </label>
            <div className="flex gap-2">
              <Button type="submit" disabled={saving}>
                {saving ? "Saving..." : editingMemory ? "Save memory" : "Create memory"}
              </Button>
              {editingMemory ? (
                <Button type="button" variant="outline" onClick={resetMemoryForm}>
                  Cancel
                </Button>
              ) : null}
            </div>
          </form>
        </CardContent>
      </Card>
    </ModuleDashboardPage>
  )
}

export function AutomationPage() {
  const accessToken = useAccessToken()
  const navigate = useNavigate()
  const [automations, setAutomations] = React.useState<Automation[]>([])
  const [automationRuns, setAutomationRuns] = React.useState<Record<string, AutomationRun[]>>({})
  const [profiles, setProfiles] = React.useState<AgentProfile[]>([])
  const [editingAutomation, setEditingAutomation] = React.useState<Automation | null>(null)
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
        typeof automation.trigger_spec?.run_at === "string"
          ? automation.trigger_spec.run_at
          : "",
      cron_interval_minutes:
        typeof automation.trigger_spec?.interval_minutes === "number"
          ? String(automation.trigger_spec.interval_minutes)
          : "60",
    })
  }

  function buildTriggerSpec() {
    if (form.trigger_kind === "once") {
      return { run_at: form.once_run_at }
    }
    if (form.trigger_kind === "cron") {
      return { interval_minutes: Number(form.cron_interval_minutes) || 60 }
    }
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
      if (editingAutomation) {
        await updateAutomation(accessToken, editingAutomation.id, payload)
      } else {
        await createAutomation(accessToken, payload)
      }
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
      if (editingAutomation?.id === automation.id) {
        resetForm()
      }
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
      if (firstConversation) {
        setLastRunConversationId(firstConversation)
      }
      await reload()
    } catch (err) {
      setError(err instanceof Error ? err.message : "failed to trigger due automations")
    } finally {
      setSaving(false)
    }
  }

  return (
    <ModuleDashboardPage
      title="Automation"
      subtitle="主动触发某个 AI Teammate 执行任务。"
      metrics={productMetrics({
        label: "Automations",
        value: String(automations.length),
        detail: "当前手动触发 automation 数量",
      })}
      highlights={[
        "Automation 不绕过 agent 主链路。",
        "Run now 会创建绑定目标 teammate 的 conversation。",
        "Once/Cron 会写入 next_run_at，Due tick 会触发到期任务。",
      ]}
    >
      <ErrorNotice message={error} />

      {lastRunConversationId ? (
        <Card className="border-primary/30 bg-primary/5">
          <CardContent className="pt-6 text-sm">
            Automation triggered.{" "}
            <Button
              variant="link"
              className="h-auto p-0"
              onClick={() => navigate(`/chat/${lastRunConversationId}`)}
            >
              Open conversation
            </Button>
          </CardContent>
        </Card>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_420px]">
        <Card className="bg-muted/50">
          <CardHeader>
            <div className="flex items-center justify-between gap-3">
              <div>
                <CardTitle className="text-base">Automations</CardTitle>
                <CardDescription>手动或按计划触发某个 AI Teammate 执行预设任务。</CardDescription>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={saving}
                onClick={() => void handleTickDueAutomations()}
              >
                Tick due
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {automations.map((automation) => (
              <div
                key={automation.id}
                className="border-border bg-background rounded-lg border p-4"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-medium">{automation.name}</p>
                    <p className="text-muted-foreground mt-1 text-xs">
                      {automation.trigger_kind} · {automation.status} · teammate{" "}
                      {automation.agent_profile_id}
                    </p>
                    {automation.next_run_at ? (
                      <p className="text-muted-foreground mt-1 text-xs">
                        next: {new Date(automation.next_run_at).toLocaleString()}
                      </p>
                    ) : null}
                  </div>
                </div>
                <p className="text-muted-foreground mt-3 line-clamp-4 text-sm leading-6">
                  {automation.task_prompt}
                </p>
                {(automationRuns[automation.id] ?? []).slice(0, 3).length > 0 ? (
                  <div className="mt-3 space-y-1 rounded-md border p-2 text-xs">
                    {(automationRuns[automation.id] ?? []).slice(0, 3).map((run) => (
                      <div
                        key={run.id}
                        className="text-muted-foreground flex items-center justify-between gap-2"
                      >
                        <span>{run.status}</span>
                        {run.conversation_id ? (
                          <button
                            type="button"
                            className="text-primary hover:underline"
                            onClick={() => navigate(`/chat/${run.conversation_id}`)}
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
                    type="button"
                    size="sm"
                    disabled={saving || automation.status !== "active"}
                    onClick={() => void handleRunAutomation(automation)}
                  >
                    Run now
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => startEditAutomation(automation)}
                  >
                    Edit
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={saving}
                    onClick={() => void handleToggleAutomation(automation)}
                  >
                    {automation.status === "active" ? "Disable" : "Enable"}
                  </Button>
                  <Button
                    type="button"
                    variant="destructive"
                    size="sm"
                    disabled={saving}
                    onClick={() => void handleArchiveAutomation(automation)}
                  >
                    Archive
                  </Button>
                </div>
              </div>
            ))}
            {automations.length === 0 ? (
              <p className="text-muted-foreground text-sm">No automations yet.</p>
            ) : null}
          </CardContent>
        </Card>

        <Card className="bg-muted/50">
          <CardHeader>
            <CardTitle className="text-base">
              {editingAutomation ? "Edit automation" : "Create automation"}
            </CardTitle>
            <CardDescription>选择目标 AI Teammate 和主动触发任务。</CardDescription>
          </CardHeader>
          <CardContent>
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
              <select
                className="border-input bg-background ring-offset-background focus-visible:ring-ring flex h-9 w-full rounded-md border px-3 py-1 text-sm shadow-sm transition-colors focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50"
                value={form.agent_profile_id}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    agent_profile_id: event.target.value,
                  }))
                }
              >
                {profiles.map((profile) => (
                  <option key={profile.id} value={profile.id}>
                    {profile.name}
                  </option>
                ))}
              </select>
              <Textarea
                placeholder="Task prompt"
                value={form.task_prompt}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    task_prompt: event.target.value,
                  }))
                }
                rows={8}
                required
              />
              <select
                className="border-input bg-background ring-offset-background focus-visible:ring-ring flex h-9 w-full rounded-md border px-3 py-1 text-sm shadow-sm transition-colors focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50"
                value={form.trigger_kind}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    trigger_kind: event.target.value,
                  }))
                }
              >
                <option value="manual">manual</option>
                <option value="once">once</option>
                <option value="cron">cron</option>
              </select>
              {form.trigger_kind === "once" ? (
                <Input
                  placeholder="Run at, RFC3339 e.g. 2026-06-24T12:00:00Z"
                  value={form.once_run_at}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      once_run_at: event.target.value,
                    }))
                  }
                  required
                />
              ) : null}
              {form.trigger_kind === "cron" ? (
                <Input
                  type="number"
                  min="1"
                  placeholder="Interval minutes"
                  value={form.cron_interval_minutes}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      cron_interval_minutes: event.target.value,
                    }))
                  }
                  required
                />
              ) : null}
              <div className="flex gap-2">
                <Button type="submit" disabled={saving}>
                  {saving
                    ? "Saving..."
                    : editingAutomation
                      ? "Save automation"
                      : "Create automation"}
                </Button>
                {editingAutomation ? (
                  <Button type="button" variant="outline" onClick={resetForm}>
                    Cancel
                  </Button>
                ) : null}
              </div>
            </form>
          </CardContent>
        </Card>
      </div>
    </ModuleDashboardPage>
  )
}
