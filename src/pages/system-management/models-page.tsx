import * as React from "react"
import {
  BotIcon,
  ChevronDownIcon,
  Edit3Icon,
  GaugeIcon,
  PlusIcon,
  SaveIcon,
  ShieldIcon,
  Trash2Icon,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  AppDialog,
  AppDisclosureSection,
  AppExpandablePanel,
  AppFieldGrid,
  AppListToolbar,
  AppSearchBar,
  AppSectionCard,
  DataTableBody,
  DataTableHeader,
  DataTableShell,
  EmptyState,
  FormField,
  StatusBadge,
  ToggleField,
} from "@/components/app"
import { useAuthSession } from "@/features/auth/app-session"
import {
  createAdminModelProfile,
  deleteAdminModelProfile,
  listAdminModelProfiles,
  updateAdminModelProfile,
  type AdminModelProfile,
  type AdminModelProfilePayload,
} from "@/lib/api/api-client"
import { normalizeAppError } from "@/lib/app/api-errors"
import { confirm } from "@/lib/app/confirm"
import { notify } from "@/lib/app/notifications"

import {
  AdminAccessDenied,
  SystemPageShell,
  emptyModel,
  isRawApiKey,
  numberOrNull,
  textOrNull,
  type LoadState,
} from "./shared"

export function AdminLlmSettingsPage() {
  return <SystemModelManagementPage />
}

export function SystemModelManagementPage() {
  const { accessToken, currentUser } = useAuthSession()
  const [models, setModels] = React.useState<AdminModelProfile[]>([])
  const [query, setQuery] = React.useState("")
  const [editingModel, setEditingModel] =
    React.useState<AdminModelProfilePayload | null>(null)
  const [editingModelId, setEditingModelId] = React.useState<string | null>(null)
  const [expandedModelIds, setExpandedModelIds] = React.useState<Set<string>>(
    () => new Set()
  )
  const [dialogOpen, setDialogOpen] = React.useState(false)
  const [state, setState] = React.useState<LoadState>("idle")
  const [message, setMessage] = React.useState("")
  const [error, setError] = React.useState("")
  const isAdmin = currentUser?.role === "admin"

  const loadModels = React.useCallback(async () => {
    if (!accessToken || !isAdmin) return
    setState("loading")
    setError("")
    try {
      const result = await listAdminModelProfiles(accessToken)
      setModels(result.profiles)
    } catch (loadError) {
      const appError = normalizeAppError(loadError, {
        fallbackMessage: "加载失败",
      })
      setError(appError.message)
      notify.error({
        title: "加载模型失败",
        description: appError.message,
      })
    } finally {
      setState("idle")
    }
  }, [accessToken, isAdmin])

  React.useEffect(() => {
    void loadModels()
  }, [loadModels])

  const filteredModels = React.useMemo(() => {
    const keyword = query.trim().toLowerCase()
    if (!keyword) return models
    return models.filter((model) =>
      `${model.id} ${model.display_name} ${model.upstream_model_name} ${model.upstream_base_url ?? ""}`
        .toLowerCase()
        .includes(keyword),
    )
  }, [models, query])

  const metrics = React.useMemo(
    () => [
      {
        label: "Models",
        value: String(models.length),
        detail: `${models.filter((model) => model.enabled && !model.archived_at).length} enabled`,
        icon: BotIcon,
        tone: "blue" as const,
      },
      {
        label: "Tool Ready",
        value: String(models.filter((model) => model.supports_tool_calls).length),
        detail: "support tool calls",
        icon: GaugeIcon,
        tone: "green" as const,
      },
      {
        label: "Reasoning",
        value: String(models.filter((model) => model.supports_reasoning).length),
        detail: "reasoning capable",
        icon: ShieldIcon,
        tone: "indigo" as const,
      },
    ],
    [models],
  )

  function openCreateDialog() {
    setEditingModel({ ...emptyModel, metadata_json: {} })
    setEditingModelId(null)
    setDialogOpen(true)
  }

  function toggleExpandedModel(modelId: string) {
    setExpandedModelIds((current) => {
      const next = new Set(current)
      if (next.has(modelId)) {
        next.delete(modelId)
      } else {
        next.add(modelId)
      }
      return next
    })
  }

  function openEditDialog(model: AdminModelProfile) {
    setEditingModel({
      display_name: model.display_name,
      endpoint_kind: model.endpoint_kind,
      upstream_model_name: model.upstream_model_name,
      upstream_base_url: model.upstream_base_url ?? null,
      upstream_api_key_ref: model.upstream_api_key_ref ?? null,
      default_temperature: model.default_temperature ?? null,
      default_top_p: model.default_top_p ?? null,
      default_frequency_penalty: model.default_frequency_penalty ?? null,
      default_presence_penalty: model.default_presence_penalty ?? null,
      default_max_tokens: model.default_max_tokens ?? null,
      context_window_tokens: model.context_window_tokens ?? null,
      max_output_tokens: model.max_output_tokens ?? null,
      supports_tool_calls: model.supports_tool_calls,
      supports_reasoning: model.supports_reasoning,
      supports_json_schema: model.supports_json_schema,
      supports_vision: model.supports_vision,
      usage_multiplier: model.usage_multiplier,
      enabled: model.enabled,
      sort_order: model.sort_order,
      metadata_json: model.metadata_json ?? {},
    })
    setEditingModelId(model.id)
    setDialogOpen(true)
  }

  async function saveModel(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!accessToken || !editingModel) return
    if (
      editingModel.upstream_api_key_ref &&
      isRawApiKey(editingModel.upstream_api_key_ref)
    ) {
      setError("模型密钥字段只能填写 secret_ref 或 env:NAME，不能填写原始 API Key")
      return
    }
    if (!editingModel.max_output_tokens || editingModel.max_output_tokens <= 0) {
      setError("模型最大输出 tokens 必须填写，并且必须大于 0")
      return
    }

    setState("saving")
    setError("")
    try {
      const payload = {
        ...editingModel,
        default_max_tokens: editingModel.max_output_tokens,
      }
      const result = editingModelId
        ? await updateAdminModelProfile(accessToken, editingModelId, payload)
        : await createAdminModelProfile(accessToken, payload)
      setModels((current) => [
        result.profile,
        ...current.filter((item) => item.id !== result.profile.id),
      ])
      setMessage(`模型已保存：${result.profile.display_name}`)
      notify.success({
        title: "模型已保存",
        description: result.profile.display_name,
      })
      setDialogOpen(false)
    } catch (saveError) {
      const appError = normalizeAppError(saveError, {
        fallbackMessage: "保存失败",
      })
      setError(appError.message)
      notify.error({
        title: "保存模型失败",
        description: appError.message,
      })
    } finally {
      setState("idle")
    }
  }

  async function deleteModel(model: AdminModelProfile) {
    if (!accessToken || model.archived_at) return
    const confirmed = await confirm({
      title: `删除模型「${model.display_name}」？`,
      description: "删除后会禁用相关套餐授权，用户将自动回落到可用模型。",
      confirmLabel: "删除模型",
      variant: "destructive",
    })
    if (!confirmed) {
      return
    }
    setState("saving")
    setError("")
    try {
      const result = await deleteAdminModelProfile(accessToken, model.id)
      setModels((current) => [
        result.profile,
        ...current.filter((item) => item.id !== result.profile.id),
      ])
      setMessage(`模型已删除：${result.profile.display_name}`)
      notify.success({
        title: "模型已删除",
        description: result.profile.display_name,
      })
    } catch (deleteError) {
      const appError = normalizeAppError(deleteError, {
        fallbackMessage: "删除失败",
      })
      setError(appError.message)
      notify.error({
        title: "删除模型失败",
        description: appError.message,
      })
    } finally {
      setState("idle")
    }
  }

  if (!isAdmin) return <AdminAccessDenied />

  return (
    <SystemPageShell
      title="模型管理"
      subtitle="维护可用模型、OpenAI-compatible 上游、能力标记、输出上限和用量倍率。"
      metrics={metrics}
      state={state}
      message={message}
      error={error}
      onRefresh={() => void loadModels()}
    >
      <AppSectionCard
        title="模型列表"
        description="主视图保持单列表格，技术细节通过行内展开查看。"
        icon={BotIcon}
      >
        <AppListToolbar
          search={
            <AppSearchBar
              value={query}
              onChange={setQuery}
              placeholder="搜索模型..."
            />
          }
          actions={
            <Button type="button" onClick={openCreateDialog}>
              <PlusIcon />
              新增模型
            </Button>
          }
          className="-mx-4 -mt-4 mb-4"
        />
        <div className="grid gap-3">
          {filteredModels.length > 0 ? (
            <DataTableShell>
              <DataTableHeader>
                <tr>
                  <th className="w-10 px-4 py-3" />
                  <th className="px-4 py-3">模型</th>
                  <th className="px-4 py-3">上游</th>
                  <th className="px-4 py-3">能力</th>
                  <th className="px-4 py-3">状态</th>
                  <th className="px-4 py-3">倍率</th>
                  <th className="px-4 py-3 text-right">操作</th>
                </tr>
              </DataTableHeader>
              <DataTableBody>
                {filteredModels.map((model) => {
                  const expanded = expandedModelIds.has(model.id)
                  return (
                    <React.Fragment key={model.id}>
                      <tr className="align-top hover:bg-muted/20">
                        <td className="px-4 py-3">
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon-sm"
                            aria-label={expanded ? "收起模型详情" : "展开模型详情"}
                            onClick={() => toggleExpandedModel(model.id)}
                          >
                            <ChevronDownIcon
                              className={`size-4 transition-transform ${expanded ? "rotate-180" : ""}`}
                            />
                          </Button>
                        </td>
                        <td className="px-4 py-3">
                          <div className="font-medium">{model.display_name}</div>
                          <div className="mt-1 max-w-64 truncate text-xs text-muted-foreground">
                            {model.id}
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <div>{model.upstream_model_name}</div>
                          <div className="mt-1 max-w-64 truncate text-xs text-muted-foreground">
                            {model.endpoint_kind}
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex flex-wrap gap-1.5">
                            {model.supports_tool_calls ? <CapabilityTag>Tool</CapabilityTag> : null}
                            {model.supports_reasoning ? <CapabilityTag>Reasoning</CapabilityTag> : null}
                            {model.supports_vision ? <CapabilityTag>Vision</CapabilityTag> : null}
                            {model.max_output_tokens ? <CapabilityTag>max {model.max_output_tokens}</CapabilityTag> : null}
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <StatusBadge
                            status={
                              model.archived_at
                                ? "archived"
                                : model.enabled
                                  ? "enabled"
                                  : "disabled"
                            }
                          />
                        </td>
                        <td className="px-4 py-3">{model.usage_multiplier}</td>
                        <td className="px-4 py-3">
                          <div className="flex justify-end gap-2">
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() => openEditDialog(model)}
                              disabled={Boolean(model.archived_at)}
                            >
                              <Edit3Icon />
                              编辑
                            </Button>
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() => void deleteModel(model)}
                              disabled={state !== "idle" || Boolean(model.archived_at)}
                            >
                              <Trash2Icon />
                              删除
                            </Button>
                          </div>
                        </td>
                      </tr>
                      {expanded ? (
                        <tr>
                          <td colSpan={7} className="p-0">
                            <AppExpandablePanel>
                              <ModelDetail model={model} />
                            </AppExpandablePanel>
                          </td>
                        </tr>
                      ) : null}
                    </React.Fragment>
                  )
                })}
              </DataTableBody>
            </DataTableShell>
          ) : null}
          {filteredModels.length === 0 ? (
            <EmptyState title="暂无模型" detail="新增模型后会出现在这里。" />
          ) : null}
        </div>
      </AppSectionCard>

      <AppDialog
        open={dialogOpen}
        title={editingModelId ? "编辑模型" : "新增模型"}
        description="模型档案保存后可在套餐里配置可见和可用范围。"
        maxWidth="3xl"
        onOpenChange={setDialogOpen}
      >
        {editingModel ? (
          <ModelForm
            model={editingModel}
            state={state}
            onChange={setEditingModel}
            onSubmit={saveModel}
            onCancel={() => setDialogOpen(false)}
          />
        ) : null}
      </AppDialog>
    </SystemPageShell>
  )
}

function ModelDetail({ model }: { model: AdminModelProfile }) {
  return (
    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
      <DetailItem label="Base URL" value={model.upstream_base_url ?? "未配置"} />
      <DetailItem label="API key ref" value={model.upstream_api_key_ref ?? "未配置"} />
      <DetailItem
        label="Context window"
        value={model.context_window_tokens?.toLocaleString() ?? "未配置"}
      />
      <DetailItem
        label="Default max tokens"
        value={model.default_max_tokens?.toLocaleString() ?? "未配置"}
      />
      <DetailItem label="Sort order" value={String(model.sort_order)} />
      <DetailItem
        label="JSON schema"
        value={model.supports_json_schema ? "supported" : "unsupported"}
      />
      <DetailItem
        label="Temperature"
        value={model.default_temperature == null ? "默认" : String(model.default_temperature)}
      />
      <DetailItem
        label="Top P"
        value={model.default_top_p == null ? "默认" : String(model.default_top_p)}
      />
    </div>
  )
}

function DetailItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-md border border-border bg-background px-3 py-2">
      <div className="text-[11px] font-medium uppercase text-muted-foreground">
        {label}
      </div>
      <div className="mt-1 truncate text-sm">{value}</div>
    </div>
  )
}

function CapabilityTag({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded-md border bg-background px-2 py-0.5 text-xs text-muted-foreground">
      {children}
    </span>
  )
}

function ModelForm({
  model,
  state,
  onChange,
  onSubmit,
  onCancel,
}: {
  model: AdminModelProfilePayload
  state: LoadState
  onChange: React.Dispatch<React.SetStateAction<AdminModelProfilePayload | null>>
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => Promise<void>
  onCancel: () => void
}) {
  return (
    <form onSubmit={(event) => void onSubmit(event)} className="space-y-4">
      <AppDisclosureSection title="基础信息" description="控制模型在管理端和套餐授权中的展示方式。">
        <AppFieldGrid>
          <FormField label="展示名">
            <Input
              value={model.display_name}
              onChange={(event) =>
                onChange((current) =>
                  current ? { ...current, display_name: event.target.value } : current,
                )
              }
            />
          </FormField>
          <FormField label="Endpoint">
            <Input
              value={model.endpoint_kind}
              onChange={(event) =>
                onChange((current) =>
                  current ? { ...current, endpoint_kind: event.target.value } : current,
                )
              }
            />
          </FormField>
        </AppFieldGrid>
      </AppDisclosureSection>

      <AppDisclosureSection title="上游连接" description="只保存上游连接信息和密钥引用，不保存明文 API key。">
        <AppFieldGrid>
          <FormField label="上游模型名">
            <Input
              value={model.upstream_model_name}
              onChange={(event) =>
                onChange((current) =>
                  current ? { ...current, upstream_model_name: event.target.value } : current,
                )
              }
            />
          </FormField>
          <FormField label="Base URL">
            <Input
              value={model.upstream_base_url ?? ""}
              onChange={(event) =>
                onChange((current) =>
                  current
                    ? { ...current, upstream_base_url: textOrNull(event.target.value) }
                    : current,
                )
              }
            />
          </FormField>
          <FormField label="密钥引用（secret_ref 或 env:NAME）">
            <Input
              value={model.upstream_api_key_ref ?? ""}
              placeholder="例如 deepseek-default 或 env:DEEPSEEK_API_KEY"
              onChange={(event) =>
                onChange((current) =>
                  current
                    ? { ...current, upstream_api_key_ref: textOrNull(event.target.value) }
                    : current,
                )
              }
            />
          </FormField>
        </AppFieldGrid>
      </AppDisclosureSection>

      <AppDisclosureSection title="上下文限制">
        <AppFieldGrid>
          <FormField label="上下文长度">
            <Input
              type="number"
              value={model.context_window_tokens ?? ""}
              onChange={(event) =>
                onChange((current) =>
                  current
                    ? { ...current, context_window_tokens: numberOrNull(event.target.value) }
                    : current,
                )
              }
            />
          </FormField>
          <FormField label="最大输出 tokens">
            <Input
              type="number"
              min={1}
              value={model.max_output_tokens ?? ""}
              onChange={(event) => {
                const value = numberOrNull(event.target.value)
                onChange((current) =>
                  current
                    ? { ...current, max_output_tokens: value, default_max_tokens: value }
                    : current,
                )
              }}
            />
          </FormField>
        </AppFieldGrid>
      </AppDisclosureSection>

      <AppDisclosureSection title="能力开关">
        <AppFieldGrid columns={4}>
          <ToggleField label="启用" checked={model.enabled} onCheckedChange={(checked) => onChange((current) => current ? { ...current, enabled: checked } : current)} />
          <ToggleField label="Tool" checked={model.supports_tool_calls} onCheckedChange={(checked) => onChange((current) => current ? { ...current, supports_tool_calls: checked } : current)} />
          <ToggleField label="Reasoning" checked={model.supports_reasoning} onCheckedChange={(checked) => onChange((current) => current ? { ...current, supports_reasoning: checked } : current)} />
          <ToggleField label="Vision" checked={model.supports_vision} onCheckedChange={(checked) => onChange((current) => current ? { ...current, supports_vision: checked } : current)} />
        </AppFieldGrid>
      </AppDisclosureSection>

      <AppDisclosureSection title="计费和排序">
        <AppFieldGrid>
          <FormField label="使用倍率">
            <Input
              type="number"
              step="0.01"
              value={model.usage_multiplier}
              onChange={(event) =>
                onChange((current) =>
                  current ? { ...current, usage_multiplier: Number(event.target.value) } : current,
                )
              }
            />
          </FormField>
          <FormField label="排序">
            <Input
              type="number"
              value={model.sort_order}
              onChange={(event) =>
                onChange((current) =>
                  current ? { ...current, sort_order: Number(event.target.value) } : current,
                )
              }
            />
          </FormField>
        </AppFieldGrid>
      </AppDisclosureSection>
      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={onCancel}>
          取消
        </Button>
        <Button type="submit" disabled={state !== "idle"}>
          <SaveIcon />
          保存模型
        </Button>
      </div>
    </form>
  )
}
