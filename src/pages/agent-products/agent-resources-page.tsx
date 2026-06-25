import * as React from "react"
import { Brain, Database, Edit3, Filter, MemoryStick, Plus, ShieldCheck, Terminal, Trash2, X } from "lucide-react"
import { Dialog as DialogPrimitive } from "radix-ui"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import { useAppSession } from "@/features/auth/app-session"
import {
  createAgentRule,
  createMemoryEntry,
  deleteAgentRule,
  deleteMemoryEntry,
  listAgentRules,
  listMemoryEntries,
  listSkillsCatalog,
  updateAgentRule,
  updateMemoryEntry,
  type AgentRule,
  type AgentRuleKind,
  type AgentSkillRef,
  type MemoryEntry,
} from "@/lib/api/gateway-client"

import { AgentProductPage, EmptyState, ErrorNotice, SearchBar, StatusBadge, WorkbenchCard } from "./shared"

function useAccessToken() {
  const { accessToken } = useAppSession()
  if (!accessToken) throw new Error("auth required")
  return accessToken
}

export function AgentResourcesPage() {
  const accessToken = useAccessToken()
  const [rules, setRules] = React.useState<AgentRule[]>([])
  const [memoryEntries, setMemoryEntries] = React.useState<MemoryEntry[]>([])
  const [resourceSkillCatalog, setResourceSkillCatalog] = React.useState<AgentSkillRef[]>([])
  const [query, setQuery] = React.useState("")
  const [activeDialog, setActiveDialog] = React.useState<"skill" | "rule" | "memory" | null>(null)
  const [editingRule, setEditingRule] = React.useState<AgentRule | null>(null)
  const [editingMemory, setEditingMemory] = React.useState<MemoryEntry | null>(null)
  const [ruleForm, setRuleForm] = React.useState<{
    name: string
    kind: AgentRuleKind
    content: string
    enabled: boolean
  }>({ name: "", kind: "behavior", content: "", enabled: true })
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

  const filteredRules = rules.filter((rule) =>
    `${rule.name ?? ""} ${rule.kind} ${rule.content}`.toLowerCase().includes(query.toLowerCase())
  )
  const filteredMemory = memoryEntries.filter((memory) =>
    `${memory.title} ${memory.content} ${memory.tags.join(" ")}`.toLowerCase().includes(query.toLowerCase())
  )

  function startEditRule(rule: AgentRule) {
    setEditingRule(rule)
    setRuleForm({ name: rule.name || "", kind: rule.kind, content: rule.content, enabled: rule.enabled })
    setActiveDialog("rule")
  }

  function startCreateRule() {
    resetRuleForm()
    setActiveDialog("rule")
  }

  function resetRuleForm() {
    setEditingRule(null)
    setRuleForm({ name: "", kind: "behavior", content: "", enabled: true })
  }

  function startEditMemory(memory: MemoryEntry) {
    setEditingMemory(memory)
    setMemoryForm({
      title: memory.title,
      content: memory.content,
      tags: memory.tags.join(", "),
      enabled: memory.enabled,
    })
    setActiveDialog("memory")
  }

  function startCreateMemory() {
    resetMemoryForm()
    setActiveDialog("memory")
  }

  function resetMemoryForm() {
    setEditingMemory(null)
    setMemoryForm({ title: "", content: "", tags: "", enabled: true })
  }

  function closeRuleDialog() {
    setActiveDialog(null)
    resetRuleForm()
  }

  function closeMemoryDialog() {
    setActiveDialog(null)
    resetMemoryForm()
  }

  async function handleSaveRule(event: React.FormEvent) {
    event.preventDefault()
    setSaving(true)
    setError(null)
    try {
      if (editingRule) await updateAgentRule(accessToken, editingRule.id, ruleForm)
      else await createAgentRule(accessToken, ruleForm)
      resetRuleForm()
      setActiveDialog(null)
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
        resetRuleForm()
        setActiveDialog(null)
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
      tags: memoryForm.tags.split(",").map((tag) => tag.trim()).filter(Boolean),
      enabled: memoryForm.enabled,
    }
    try {
      if (editingMemory) await updateMemoryEntry(accessToken, editingMemory.id, payload)
      else await createMemoryEntry(accessToken, payload)
      resetMemoryForm()
      setActiveDialog(null)
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
        setActiveDialog(null)
      }
      await reload()
    } catch (err) {
      setError(err instanceof Error ? err.message : "failed to archive memory")
    } finally {
      setSaving(false)
    }
  }

  return (
    <AgentProductPage
      eyebrow="Skills / Rules / Memory"
      title="Cognitive Asset Library"
      subtitle="Skills、Rules、Memory 是个人智能体资产库。AI Teammate 从这里选择资产，Automation 主动触发对应运行配置。"
      metrics={[
        {
          label: "Total Skills",
          value: String(resourceSkillCatalog.length),
          detail: resourceSkillCatalog.length ? "discoverable skills" : "catalog provider pending",
          icon: Brain,
          tone: "indigo",
        },
        {
          label: "Active Rules",
          value: String(rules.filter((rule) => rule.enabled).length),
          detail: `${rules.length} total behavioral rules`,
          icon: ShieldCheck,
          tone: "amber",
        },
        {
          label: "Memory Objects",
          value: String(memoryEntries.length),
          detail: "explicit personal memory",
          icon: Database,
          tone: "green",
        },
      ]}
    >
      <ErrorNotice message={error} />

      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <SearchBar value={query} onChange={setQuery} placeholder="Search cognitive assets..." />
        <Button variant="outline">
          <Filter className="mr-2 size-4" />
          Filter
        </Button>
      </div>

      <div className="space-y-6">
        <WorkbenchCard
          title="Cognitive Skills"
          description="当前 gateway 可发现的 skill catalog。"
          icon={Brain}
          actions={<CreateIconButton label="Create skill" onClick={() => setActiveDialog("skill")} />}
        >
          <div className="overflow-hidden rounded-md border border-border">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-border bg-muted/50 text-xs tracking-wider text-muted-foreground uppercase">
                <tr>
                  <th className="px-4 py-3 font-medium">Asset Name</th>
                  <th className="px-4 py-3 font-medium">Source</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {resourceSkillCatalog.map((skill) => (
                  <tr key={skill.name} className="bg-background/60 transition-colors hover:bg-muted/60">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <Terminal className="text-muted-foreground size-4" />
                        <span className="font-medium">{skill.name}</span>
                      </div>
                    </td>
                    <td className="text-muted-foreground px-4 py-3">{skill.source || "local/user"}</td>
                    <td className="px-4 py-3"><StatusBadge status={skill.enabled ? "active" : "disabled"} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {resourceSkillCatalog.length === 0 ? (
            <div className="mt-3">
              <EmptyState title="Skill catalog pending" detail="Gateway service is not connected to agentic runtime catalog yet." />
            </div>
          ) : null}
        </WorkbenchCard>

        <WorkbenchCard
          title="Behavioral Rules"
          description="Prompt-level behavioral constraints。"
          icon={ShieldCheck}
          actions={<CreateIconButton label="Create rule" onClick={startCreateRule} />}
        >
          <div className="grid gap-3">
            {filteredRules.map((rule) => (
              <AssetCard
                key={rule.id}
                title={rule.name || rule.kind}
                detail={rule.content}
                icon={ShieldCheck}
                badge={rule.kind}
                enabled={rule.enabled}
                saving={saving}
                onToggle={(checked) => void handleToggleRule(rule, checked)}
                onEdit={() => startEditRule(rule)}
                onArchive={() => void handleArchiveRule(rule)}
              />
            ))}
            {filteredRules.length === 0 ? <EmptyState title="No rules" detail="Create a rule with the plus button." /> : null}
          </div>
        </WorkbenchCard>

        <WorkbenchCard
          title="Memory Objects"
          description="显式个人 memory，不做自动长期记忆。"
          icon={MemoryStick}
          actions={<CreateIconButton label="Create memory" onClick={startCreateMemory} />}
        >
          <div className="grid gap-3">
            {filteredMemory.map((memory) => (
              <AssetCard
                key={memory.id}
                title={memory.title}
                detail={memory.content}
                icon={MemoryStick}
                badge={memory.tags.join(", ") || "memory"}
                enabled={memory.enabled}
                saving={saving}
                onToggle={(checked) => void handleToggleMemory(memory, checked)}
                onEdit={() => startEditMemory(memory)}
                onArchive={() => void handleArchiveMemory(memory)}
              />
            ))}
            {filteredMemory.length === 0 ? <EmptyState title="No memory" detail="Create explicit memory with the plus button." /> : null}
          </div>
        </WorkbenchCard>
      </div>

      <ResourceDialog
        open={activeDialog === "skill"}
        title="Create skill"
        description="Skill catalog is read from the gateway runtime."
        onOpenChange={(open) => setActiveDialog(open ? "skill" : null)}
      >
        <EmptyState
          title="Skill creation is not available here"
          detail="The current gateway client only exposes skill catalog and detail APIs. Add a create-skill API before wiring this form."
        />
      </ResourceDialog>

      <ResourceDialog
        open={activeDialog === "rule"}
        title={editingRule ? "Edit rule" : "Create rule"}
        description="Rules 被 AI Teammate 绑定后进入 prompt。"
        onOpenChange={(open) => {
          if (open) setActiveDialog("rule")
          else closeRuleDialog()
        }}
      >
        <form className="space-y-3" onSubmit={handleSaveRule}>
          <Input placeholder="Rule name" value={ruleForm.name} onChange={(event) => setRuleForm((current) => ({ ...current, name: event.target.value }))} required />
          <select
            className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm"
            value={ruleForm.kind}
            onChange={(event) => setRuleForm((current) => ({ ...current, kind: event.target.value as AgentRuleKind }))}
          >
            <option value="behavior">behavior</option>
            <option value="system">system</option>
            <option value="tool">tool</option>
          </select>
          <Textarea placeholder="Rule content" value={ruleForm.content} onChange={(event) => setRuleForm((current) => ({ ...current, content: event.target.value }))} rows={8} required />
          <SwitchLine label="Enabled" checked={ruleForm.enabled} onCheckedChange={(checked) => setRuleForm((current) => ({ ...current, enabled: checked }))} />
          <div className="flex gap-2">
            <Button type="submit" disabled={saving}>{editingRule ? "Save rule" : "Create rule"}</Button>
            <Button type="button" variant="outline" onClick={closeRuleDialog}>Cancel</Button>
          </div>
        </form>
      </ResourceDialog>

      <ResourceDialog
        open={activeDialog === "memory"}
        title={editingMemory ? "Edit memory" : "Create memory"}
        description="Memory 被 AI Teammate 绑定后作为显式上下文注入。"
        onOpenChange={(open) => {
          if (open) setActiveDialog("memory")
          else closeMemoryDialog()
        }}
      >
        <form className="space-y-3" onSubmit={handleSaveMemory}>
          <Input placeholder="Memory title" value={memoryForm.title} onChange={(event) => setMemoryForm((current) => ({ ...current, title: event.target.value }))} required />
          <Textarea placeholder="Memory content" value={memoryForm.content} onChange={(event) => setMemoryForm((current) => ({ ...current, content: event.target.value }))} rows={8} required />
          <Input placeholder="Tags, comma separated" value={memoryForm.tags} onChange={(event) => setMemoryForm((current) => ({ ...current, tags: event.target.value }))} />
          <SwitchLine label="Enabled" checked={memoryForm.enabled} onCheckedChange={(checked) => setMemoryForm((current) => ({ ...current, enabled: checked }))} />
          <div className="flex gap-2">
            <Button type="submit" disabled={saving}>{editingMemory ? "Save memory" : "Create memory"}</Button>
            <Button type="button" variant="outline" onClick={closeMemoryDialog}>Cancel</Button>
          </div>
        </form>
      </ResourceDialog>
    </AgentProductPage>
  )
}

function CreateIconButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <Button type="button" variant="outline" size="icon-sm" aria-label={label} title={label} onClick={onClick}>
      <Plus className="size-4" />
    </Button>
  )
}

function ResourceDialog({
  open,
  title,
  description,
  children,
  onOpenChange,
}: {
  open: boolean
  title: string
  description: string
  children: React.ReactNode
  onOpenChange: (open: boolean) => void
}) {
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 fixed inset-0 z-50 bg-black/10 duration-100 supports-backdrop-filter:backdrop-blur-xs" />
        <DialogPrimitive.Content className="data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 bg-background fixed top-1/2 left-1/2 z-50 grid max-h-[85vh] w-[calc(100vw-2rem)] max-w-xl -translate-x-1/2 -translate-y-1/2 gap-4 overflow-y-auto rounded-xl border border-border p-5 shadow-lg duration-100 outline-none">
          <div className="pr-8">
            <DialogPrimitive.Title className="text-base font-medium">{title}</DialogPrimitive.Title>
            <DialogPrimitive.Description className="text-muted-foreground mt-1 text-sm">
              {description}
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

function AssetCard({
  title,
  detail,
  icon: Icon,
  badge,
  enabled,
  saving,
  onToggle,
  onEdit,
  onArchive,
}: {
  title: string
  detail: string
  icon: React.ComponentType<{ className?: string }>
  badge: string
  enabled: boolean
  saving: boolean
  onToggle: (checked: boolean) => void
  onEdit: () => void
  onArchive: () => void
}) {
  return (
    <div className="rounded-md border border-border bg-background/60 p-4 transition-colors hover:bg-muted/60">
      <div className="flex items-start justify-between gap-3">
        <div className="flex gap-3">
          <Icon className="text-muted-foreground mt-0.5 size-4" />
          <div>
            <p className="font-medium">{title}</p>
            <Badge variant="outline" className="mt-2 text-[10px]">{badge}</Badge>
          </div>
        </div>
        <Switch checked={enabled} disabled={saving} onCheckedChange={onToggle} />
      </div>
      <p className="text-muted-foreground mt-3 line-clamp-3 text-sm leading-6">{detail}</p>
      <div className="mt-3 flex gap-2">
        <Button type="button" variant="outline" size="sm" onClick={onEdit}><Edit3 className="mr-2 size-3.5" />Edit</Button>
        <Button type="button" variant="destructive" size="sm" disabled={saving} onClick={onArchive}><Trash2 className="mr-2 size-3.5" />Archive</Button>
      </div>
    </div>
  )
}

function SwitchLine({ label, checked, onCheckedChange }: { label: string; checked: boolean; onCheckedChange: (checked: boolean) => void }) {
  return (
    <label className="flex items-center justify-between rounded-md border border-border bg-background/60 p-3 text-sm">
      {label}
      <Switch checked={checked} onCheckedChange={onCheckedChange} />
    </label>
  )
}
