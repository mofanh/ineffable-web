import * as React from "react"
import { Link, useNavigate, useParams } from "react-router-dom"
import { Bot, Brain, Database, History, Plus, Route, ShieldCheck, Sparkles, X } from "lucide-react"
import { Dialog as DialogPrimitive } from "radix-ui"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import { useAppSession } from "@/features/auth/app-session"
import {
  createAgentProfile,
  deleteAgentProfile,
  getAgentProfile,
  getAgentProfileMemory,
  getAgentProfileRules,
  getAgentProfileSkills,
  listAgentProfiles,
  listAgentRules,
  listMemoryEntries,
  listSkillsCatalog,
  replaceAgentProfileMemory,
  replaceAgentProfileRules,
  replaceAgentProfileSkills,
  updateAgentProfile,
  type AgentProfile,
  type AgentRule,
  type AgentSkillRef,
  type MemoryEntry,
} from "@/lib/api/gateway-client"

import {
  AgentProductPage,
  EmptyState,
  ErrorNotice,
  SearchBar,
  StatusBadge,
  WorkbenchCard,
  toggleSet,
} from "./shared"

function useAccessToken() {
  const { accessToken } = useAppSession()
  if (!accessToken) throw new Error("auth required")
  return accessToken
}

export function AiTeammatesPage() {
  const accessToken = useAccessToken()
  const navigate = useNavigate()
  const [profiles, setProfiles] = React.useState<AgentProfile[]>([])
  const [query, setQuery] = React.useState("")
  const [createDialogOpen, setCreateDialogOpen] = React.useState(false)
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

  const filteredProfiles = profiles.filter((profile) =>
    `${profile.name} ${profile.description ?? ""}`.toLowerCase().includes(query.toLowerCase())
  )

  function resetCreateForm() {
    setName("")
    setDescription("")
    setSystemPrompt("")
  }

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
      resetCreateForm()
      setCreateDialogOpen(false)
      await reload()
      navigate(`/ai-teammates/${response.profile.id}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : "failed to create teammate")
    } finally {
      setSaving(false)
    }
  }

  return (
    <AgentProductPage
      eyebrow="AI Teammates"
      title="AI Teammates"
      subtitle="AI Teammate 是资产的运行配置。它选择 Skills、Rules、Memory，并在 conversation 或 automation 中编译成 AgentProfileRuntimePlan。"
      metrics={[
        {
          label: "Teammates",
          value: String(profiles.length),
          detail: loading ? "Loading profiles" : "available runtime profiles",
          icon: Bot,
          tone: "indigo",
        },
        {
          label: "Runtime Path",
          value: "Gateway",
          detail: "conversation / automation shared path",
          icon: Route,
          tone: "blue",
        },
        {
          label: "Asset Scope",
          value: "Personal",
          detail: "skills, rules, and memory bindings",
          icon: Sparkles,
          tone: "green",
        },
      ]}
      headerActions={
        <Button onClick={() => setCreateDialogOpen(true)}>
          <Plus className="mr-2 size-4" />
          New Profile
        </Button>
      }
    >
      <ErrorNotice message={error} />

      <WorkbenchCard
        title="Profile Catalog"
        description="选择 teammate 进入详情，绑定技能、规则和记忆。"
        icon={Bot}
        actions={
          <div className="hidden min-w-72 md:block">
            <SearchBar value={query} onChange={setQuery} placeholder="Search teammates..." />
          </div>
        }
      >
        <div className="space-y-3 md:hidden">
          <SearchBar value={query} onChange={setQuery} placeholder="Search teammates..." />
        </div>
        <div className="mt-3 grid gap-3 md:grid-cols-2">
          {filteredProfiles.map((profile) => (
            <Link
              key={profile.id}
              to={`/ai-teammates/${profile.id}`}
              className="group block rounded-md border border-border bg-background/60 p-4 transition-colors hover:bg-muted/60"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex min-w-0 gap-3">
                  <div className="flex size-10 shrink-0 items-center justify-center rounded-md border border-border bg-muted/40">
                    <Bot className="size-5 text-indigo-500" />
                  </div>
                  <div className="min-w-0">
                    <p className="truncate font-medium">{profile.name}</p>
                    <p className="text-muted-foreground mt-1 line-clamp-2 text-sm">
                      {profile.description || "No description"}
                    </p>
                  </div>
                </div>
                <StatusBadge status={profile.status} />
              </div>
              <div className="text-muted-foreground mt-4 flex items-center justify-between text-xs">
                <span>rev {profile.revision}</span>
                <span className="group-hover:text-foreground">Open profile →</span>
              </div>
            </Link>
          ))}
        </div>
        {!loading && filteredProfiles.length === 0 ? (
          <div className="mt-3">
            <EmptyState title="No teammates found" detail="Create a profile or adjust search." />
          </div>
        ) : null}
      </WorkbenchCard>

      <CreateTeammateDialog
        open={createDialogOpen}
        onOpenChange={(open) => {
          setCreateDialogOpen(open)
          if (!open) resetCreateForm()
        }}
      >
        <form className="space-y-3" onSubmit={handleCreate}>
          <Input placeholder="Name" value={name} onChange={(event) => setName(event.target.value)} required />
          <Input placeholder="Description" value={description} onChange={(event) => setDescription(event.target.value)} />
          <Textarea
            placeholder="System prompt"
            value={systemPrompt}
            onChange={(event) => setSystemPrompt(event.target.value)}
            rows={8}
          />
          <div className="flex gap-2">
            <Button type="submit" disabled={saving}>
              {saving ? "Creating..." : "Create profile"}
            </Button>
            <Button type="button" variant="outline" onClick={() => setCreateDialogOpen(false)}>
              Cancel
            </Button>
          </div>
        </form>
      </CreateTeammateDialog>
    </AgentProductPage>
  )
}

function CreateTeammateDialog({
  open,
  onOpenChange,
  children,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  children: React.ReactNode
}) {
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 fixed inset-0 z-50 bg-black/10 duration-100 supports-backdrop-filter:backdrop-blur-xs" />
        <DialogPrimitive.Content className="data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 bg-background fixed top-1/2 left-1/2 z-50 grid max-h-[85vh] w-[calc(100vw-2rem)] max-w-xl -translate-x-1/2 -translate-y-1/2 gap-4 overflow-y-auto rounded-xl border border-border p-5 shadow-lg duration-100 outline-none">
          <div className="pr-8">
            <DialogPrimitive.Title className="text-base font-medium">Create teammate</DialogPrimitive.Title>
            <DialogPrimitive.Description className="text-muted-foreground mt-1 text-sm">
              定义一个个人 Agent Profile。
            </DialogPrimitive.Description>
          </div>
          {children}
          <DialogPrimitive.Close asChild>
            <Button type="button" variant="ghost" size="icon-sm" className="absolute top-4 right-4">
              <X className="size-4" />
              <span className="sr-only">Close</span>
            </Button>
          </DialogPrimitive.Close>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
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
  const [form, setForm] = React.useState({ name: "", description: "", system_prompt: "" })
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
      ] = await Promise.all([
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
      await replaceAgentProfileRules(
        accessToken,
        profileId,
        rules
          .filter((rule) => boundRuleIds.has(rule.id))
          .map((rule, index) => ({ rule_id: rule.id, enabled: true, sort_order: index }))
      )
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
      await replaceAgentProfileMemory(
        accessToken,
        profileId,
        memoryEntries
          .filter((entry) => boundMemoryIds.has(entry.id))
          .map((entry, index) => ({ memory_entry_id: entry.id, enabled: true, sort_order: index }))
      )
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
    if (!name || boundSkills.some((skill) => skill.name === name)) return
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
    <AgentProductPage
      eyebrow="AI Teammate Detail"
      title={profile?.name || "AI Teammate Detail"}
      subtitle="Profile prompt、rules、skills 和 memory 会在运行前解析为 AgentProfileRuntimePlan。"
      metrics={[
        {
          label: "Revision",
          value: String(profile?.revision ?? "-"),
          detail: profile?.status || "loading",
          icon: History,
          tone: "blue",
        },
        {
          label: "Rules",
          value: String(boundRuleIds.size),
          detail: "bound behavioral rules",
          icon: ShieldCheck,
          tone: "amber",
        },
        {
          label: "Memory",
          value: String(boundMemoryIds.size),
          detail: "explicit context objects",
          icon: Database,
          tone: "green",
        },
      ]}
      headerActions={<Button variant="outline" onClick={() => navigate("/ai-teammates")}>Back</Button>}
    >
      <ErrorNotice message={error} />

      <div className="space-y-6">
        <WorkbenchCard title="Profile Runtime Identity" description="基础身份和 system prompt。" icon={Bot}>
          <form className="space-y-3" onSubmit={handleSaveProfile}>
            <Input value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} disabled={isDefault} required />
            <Input value={form.description} onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))} disabled={isDefault} placeholder="Description" />
            <Textarea value={form.system_prompt} onChange={(event) => setForm((current) => ({ ...current, system_prompt: event.target.value }))} disabled={isDefault} placeholder="System prompt" rows={10} />
            <div className="flex gap-2">
              <Button type="submit" disabled={saving || isDefault}>Save profile</Button>
              <Button type="button" variant="destructive" disabled={saving || isDefault} onClick={handleArchive}>Archive</Button>
            </div>
          </form>
        </WorkbenchCard>

        <BindingSection title="Behavioral Rules" description="绑定后按 sort_order 注入 prompt。" icon={ShieldCheck} count={boundRuleIds.size} onSave={handleSaveRules} disabled={saving || isDefault}>
          {rules.map((rule) => (
            <ToggleRow
              key={rule.id}
              title={rule.name || rule.kind}
              detail={rule.content}
              checked={boundRuleIds.has(rule.id)}
              disabled={isDefault}
              badge={rule.kind}
              onCheckedChange={(checked) => setBoundRuleIds((current) => toggleSet(current, rule.id, checked))}
            />
          ))}
          {rules.length === 0 ? <EmptyState title="No rules" detail="Create rules from Skills, Rules, Memory." /> : null}
        </BindingSection>

        <BindingSection title="Explicit Memory" description="少量显式 memory 会作为 dynamic context 注入。" icon={Database} count={boundMemoryIds.size} onSave={handleSaveMemory} disabled={saving || isDefault}>
          {memoryEntries.map((entry) => (
            <ToggleRow
              key={entry.id}
              title={entry.title}
              detail={entry.content}
              checked={boundMemoryIds.has(entry.id)}
              disabled={isDefault}
              badge={entry.tags.slice(0, 2).join(", ") || "memory"}
              onCheckedChange={(checked) => setBoundMemoryIds((current) => toggleSet(current, entry.id, checked))}
            />
          ))}
          {memoryEntries.length === 0 ? <EmptyState title="No memory" detail="Create memory from the asset library." /> : null}
        </BindingSection>

        <WorkbenchCard title="Skill Allowlist" description="自定义 teammate 只激活绑定的 skill。" icon={Brain}>
          <form className="flex gap-2" onSubmit={handleAddSkill}>
            <Input list="agent-skill-catalog" placeholder="Skill name, e.g. deploy" value={skillName} disabled={isDefault} onChange={(event) => setSkillName(event.target.value)} />
            <datalist id="agent-skill-catalog">
              {skillCatalog.map((skill) => <option key={skill.name} value={skill.name} />)}
            </datalist>
            <Button type="submit" disabled={isDefault || !skillName.trim()}>Add</Button>
          </form>

          <div className="mt-4 space-y-2">
            {boundSkills.map((skill) => (
              <div key={`${skill.source ?? "local"}:${skill.name}`} className="flex items-center justify-between gap-3 rounded-md border border-border bg-background/60 p-3">
                <div>
                  <p className="text-sm font-medium">{skill.name}</p>
                  <p className="text-muted-foreground text-xs">{skill.source || "local/user"} · {skill.enabled ? "enabled" : "disabled"}</p>
                </div>
                <div className="flex items-center gap-2">
                  <Switch
                    checked={skill.enabled}
                    disabled={isDefault}
                    onCheckedChange={(checked) =>
                      setBoundSkills((current) => current.map((item) => item.name === skill.name ? { ...item, enabled: checked } : item))
                    }
                  />
                  <Button type="button" size="sm" variant="outline" disabled={isDefault} onClick={() => setBoundSkills((current) => current.filter((item) => item.name !== skill.name))}>Remove</Button>
                </div>
              </div>
            ))}
            {boundSkills.length === 0 ? <EmptyState title="No skills bound" detail="Add skill names manually or from catalog." /> : null}
          </div>

          <Button className="mt-4 w-full" disabled={saving || isDefault} onClick={() => void handleSaveSkills()}>Save skills</Button>
        </WorkbenchCard>
      </div>
    </AgentProductPage>
  )
}

function BindingSection({
  title,
  description,
  icon,
  count,
  onSave,
  disabled,
  children,
}: {
  title: string
  description: string
  icon: React.ComponentType<{ className?: string }>
  count: number
  onSave: () => void
  disabled: boolean
  children: React.ReactNode
}) {
  return (
    <WorkbenchCard title={title} description={description} icon={icon} actions={<Badge variant="outline">{count} bound</Badge>}>
      <div className="space-y-2">{children}</div>
      <Button className="mt-4" disabled={disabled} onClick={onSave}>Save bindings</Button>
    </WorkbenchCard>
  )
}

function ToggleRow({
  title,
  detail,
  checked,
  disabled,
  badge,
  onCheckedChange,
}: {
  title: string
  detail: string
  checked: boolean
  disabled?: boolean
  badge?: string
  onCheckedChange: (checked: boolean) => void
}) {
  return (
    <label className="flex items-start justify-between gap-3 rounded-md border border-border bg-background/60 p-3 transition-colors hover:bg-muted/60">
      <span>
        <span className="flex items-center gap-2 text-sm font-medium">
          {title}
          {badge ? <Badge variant="outline" className="text-[10px]">{badge}</Badge> : null}
        </span>
        <span className="text-muted-foreground mt-1 line-clamp-3 block text-sm">{detail}</span>
      </span>
      <Switch checked={checked} disabled={disabled} onCheckedChange={onCheckedChange} />
    </label>
  )
}
