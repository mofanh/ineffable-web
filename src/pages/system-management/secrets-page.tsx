import * as React from "react"
import {
  AlertTriangleIcon,
  CheckIcon,
  ChevronDownIcon,
  Edit3Icon,
  KeyRoundIcon,
  PlusIcon,
  SaveIcon,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  AppBarChart,
  type AppBarChartDatum,
  type AppBarChartSeries,
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
} from "@/components/app"
import { useAuthSession } from "@/features/auth/app-session"
import {
  listAdminLlmSecrets,
  listAdminModelProfiles,
  upsertAdminLlmSecret,
  type AdminLlmSecret,
  type AdminModelProfile,
} from "@/lib/api/api-client"
import { normalizeAppError } from "@/lib/app/api-errors"
import { notify } from "@/lib/app/notifications"

import {
  AdminAccessDenied,
  SystemPageShell,
  emptySecret,
  type LoadState,
} from "./shared"

type SecretForm = typeof emptySecret

type SecretInsight = {
  secretRef: string
  health: "healthy" | "missing" | "inactive" | "unused"
  provider: string
  referencedModels: AdminModelProfile[]
}

export function SystemSecretManagementPage() {
  const { accessToken, currentUser } = useAuthSession()
  const [secrets, setSecrets] = React.useState<AdminLlmSecret[]>([])
  const [models, setModels] = React.useState<AdminModelProfile[]>([])
  const [query, setQuery] = React.useState("")
  const [editingSecret, setEditingSecret] = React.useState<SecretForm | null>(null)
  const [expandedSecretRefs, setExpandedSecretRefs] = React.useState<Set<string>>(
    () => new Set()
  )
  const [dialogOpen, setDialogOpen] = React.useState(false)
  const [state, setState] = React.useState<LoadState>("idle")
  const [message, setMessage] = React.useState("")
  const [error, setError] = React.useState("")
  const isAdmin = currentUser?.role === "admin"

  const loadSecrets = React.useCallback(async () => {
    if (!accessToken || !isAdmin) return
    setState("loading")
    setError("")
    try {
      const [secretResult, modelResult] = await Promise.all([
        listAdminLlmSecrets(accessToken),
        listAdminModelProfiles(accessToken),
      ])
      setSecrets(secretResult.secrets)
      setModels(modelResult.profiles)
    } catch (loadError) {
      const appError = normalizeAppError(loadError, {
        fallbackMessage: "加载失败",
      })
      setError(appError.message)
      notify.error({
        title: "加载密钥失败",
        description: appError.message,
      })
    } finally {
      setState("idle")
    }
  }, [accessToken, isAdmin])

  React.useEffect(() => {
    void loadSecrets()
  }, [loadSecrets])

  const secretInsights = React.useMemo(
    () => buildSecretInsights(secrets, models),
    [models, secrets],
  )

  const filteredSecrets = React.useMemo(() => {
    const keyword = query.trim().toLowerCase()
    if (!keyword) return secrets
    return secrets.filter((secret) =>
      `${secret.secret_ref} ${secret.status} ${secretInsights.bySecretRef.get(secret.secret_ref)?.provider ?? ""}`
        .toLowerCase()
        .includes(keyword),
    )
  }, [query, secretInsights.bySecretRef, secrets])

  const metrics = React.useMemo(
    () => [
      {
        label: "Secrets",
        value: String(secrets.length),
        detail: `${secrets.filter((secret) => secret.has_secret).length} stored`,
        icon: KeyRoundIcon,
        tone: "blue" as const,
      },
      {
        label: "Active",
        value: String(secrets.filter((secret) => secret.status === "active").length),
        detail: "ready references",
        icon: CheckIcon,
        tone: "green" as const,
      },
      {
        label: "Missing",
        value: String(secrets.filter((secret) => !secret.has_secret).length),
        detail: "without secret value",
        icon: KeyRoundIcon,
        tone: "amber" as const,
      },
      {
        label: "Risk",
        value: String(secretInsights.riskySecrets),
        detail: "need attention",
        icon: AlertTriangleIcon,
        tone: "indigo" as const,
      },
    ],
    [secretInsights.riskySecrets, secrets],
  )

  function openCreateDialog() {
    setEditingSecret({ ...emptySecret, secret: "" })
    setDialogOpen(true)
  }

  function openEditDialog(secret: AdminLlmSecret) {
    setEditingSecret({
      secret_ref: secret.secret_ref,
      secret: "",
      status: secret.status,
      metadata_json: secret.metadata_json ?? {},
    })
    setDialogOpen(true)
  }

  function toggleExpandedSecret(secretRef: string) {
    setExpandedSecretRefs((current) => {
      const next = new Set(current)
      if (next.has(secretRef)) {
        next.delete(secretRef)
      } else {
        next.add(secretRef)
      }
      return next
    })
  }

  async function saveSecret(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!accessToken || !editingSecret) return
    setState("saving")
    setError("")
    try {
      const result = await upsertAdminLlmSecret(accessToken, editingSecret)
      setSecrets((current) => [
        result.secret,
        ...current.filter((item) => item.secret_ref !== result.secret.secret_ref),
      ])
      setMessage(`密钥已保存：${result.secret.secret_ref}`)
      notify.success({
        title: "密钥已保存",
        description: result.secret.secret_ref,
      })
      setDialogOpen(false)
    } catch (saveError) {
      const appError = normalizeAppError(saveError, {
        fallbackMessage: "保存失败",
      })
      setError(appError.message)
      notify.error({
        title: "保存密钥失败",
        description: appError.message,
      })
    } finally {
      setState("idle")
    }
  }

  if (!isAdmin) return <AdminAccessDenied />

  return (
    <SystemPageShell
      title="密钥管理"
      subtitle="集中维护上游模型密钥引用，模型档案只保存 secret_ref 或 env:NAME。"
      metrics={metrics}
      state={state}
      message={message}
      error={error}
      onRefresh={() => void loadSecrets()}
    >
      <AppSectionCard
        title="密钥健康概览"
        description="基于密钥状态和模型引用关系聚合；secret 级调用量和错误率需要后端日志聚合后接入。"
        icon={KeyRoundIcon}
      >
        <AppBarChart
          data={secretInsights.chartData}
          series={secretInsights.chartSeries}
          height={180}
          valueFormatter={formatCompactNumber}
          emptyTitle="暂无密钥健康数据"
          emptyDescription="新增密钥和模型引用后，这里会展示 key 健康分布。"
        />
      </AppSectionCard>

      <AppSectionCard
        title="密钥列表"
        description="主视图保持单列表格，安全说明和 metadata 通过行内展开查看。"
        icon={KeyRoundIcon}
      >
        <AppListToolbar
          search={
            <AppSearchBar
              value={query}
              onChange={setQuery}
              placeholder="搜索密钥..."
            />
          }
          actions={
            <Button type="button" onClick={openCreateDialog}>
              <PlusIcon />
              新增密钥
            </Button>
          }
          className="-mx-4 -mt-4 mb-4"
        />
        <div className="grid gap-3">
          {filteredSecrets.length > 0 ? (
            <DataTableShell>
              <DataTableHeader>
                <tr>
                  <th className="w-12 px-3 py-3 sm:px-4" />
                  <th className="w-auto px-3 py-3 sm:px-4">密钥引用</th>
                  <th className="hidden w-28 px-4 py-3 @2xl/table:table-cell">Provider</th>
                  <th className="hidden w-24 px-4 py-3 @3xl/table:table-cell">引用</th>
                  <th className="hidden w-28 px-4 py-3 @xl/table:table-cell">保存状态</th>
                  <th className="w-20 px-3 py-3 sm:w-24 sm:px-4">状态</th>
                  <th className="w-16 px-3 py-3 text-right sm:w-24 sm:px-4">操作</th>
                </tr>
              </DataTableHeader>
              <DataTableBody>
                {filteredSecrets.map((secret) => {
                  const expanded = expandedSecretRefs.has(secret.secret_ref)
                  const insight = secretInsights.bySecretRef.get(secret.secret_ref)
                  return (
                    <React.Fragment key={secret.secret_ref}>
                      <tr className="hover:bg-muted/20">
                        <td className="px-3 py-3 sm:px-4">
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon-sm"
                            aria-label={expanded ? "收起密钥详情" : "展开密钥详情"}
                            onClick={() => toggleExpandedSecret(secret.secret_ref)}
                          >
                            <ChevronDownIcon
                              className={`size-4 transition-transform ${expanded ? "rotate-180" : ""}`}
                            />
                          </Button>
                        </td>
                        <td className="min-w-0 px-3 py-3 sm:px-4">
                          <div className="truncate font-medium">{secret.secret_ref}</div>
                          <div className="mt-1 truncate text-xs text-muted-foreground">
                            密钥值保存后不会回显
                          </div>
                        </td>
                        <td className="hidden px-4 py-3 @2xl/table:table-cell">
                          {insight?.provider ?? "-"}
                        </td>
                        <td className="hidden px-4 py-3 @3xl/table:table-cell">
                          {insight?.referencedModels.length ?? 0} models
                        </td>
                        <td className="hidden px-4 py-3 @xl/table:table-cell">
                          <StatusBadge status={secret.has_secret ? "saved" : "missing"} />
                        </td>
                        <td className="px-3 py-3 sm:px-4">
                          <StatusBadge status={secret.status} />
                        </td>
                        <td className="px-3 py-3 sm:px-4">
                          <div className="flex justify-end">
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() => openEditDialog(secret)}
                            >
                              <Edit3Icon />
                              <span className="hidden sm:inline">编辑</span>
                            </Button>
                          </div>
                        </td>
                      </tr>
                      {expanded ? (
                        <tr>
                          <td colSpan={7} className="p-0">
                            <AppExpandablePanel>
                              <SecretDetail
                                insight={insight}
                                secret={secret}
                              />
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
          {filteredSecrets.length === 0 ? (
            <EmptyState title="暂无密钥" detail="新增上游密钥后会出现在这里。" />
          ) : null}
        </div>
      </AppSectionCard>

      <AppDialog
        open={dialogOpen}
        title={editingSecret?.secret_ref ? "编辑密钥" : "新增密钥"}
        description="编辑已有密钥时，密钥值留空表示不修改密钥内容。"
        onOpenChange={setDialogOpen}
      >
        {editingSecret ? (
          <SecretForm
            secret={editingSecret}
            state={state}
            onChange={setEditingSecret}
            onSubmit={saveSecret}
            onCancel={() => setDialogOpen(false)}
          />
        ) : null}
      </AppDialog>
    </SystemPageShell>
  )
}

function SecretDetail({
  insight,
  secret,
}: {
  insight?: SecretInsight
  secret: AdminLlmSecret
}) {
  const metadata =
    secret.metadata_json && Object.keys(secret.metadata_json).length > 0
      ? JSON.stringify(secret.metadata_json)
      : "无 metadata"

  return (
    <div className="grid gap-3">
      <div className="grid gap-3 md:grid-cols-4">
        <SecretInfoItem
          label="Health"
          value={insight?.health ?? "unknown"}
          detail={healthDetail(insight)}
        />
        <SecretInfoItem
          label="Provider"
          value={insight?.provider ?? "-"}
          detail="derived from model base url"
        />
        <SecretInfoItem
          label="Models"
          value={String(insight?.referencedModels.length ?? 0)}
          detail="referencing this key"
        />
        <SecretInfoItem
          label="Call Health"
          value="未接入"
          detail="需要后端 secret 级 usage/error 聚合"
        />
      </div>
      <div className="grid gap-3 md:grid-cols-3">
      <div className="rounded-md border border-border bg-background px-3 py-2">
        <div className="text-[11px] font-medium uppercase text-muted-foreground">
          安全说明
        </div>
        <p className="mt-1 text-sm leading-6">
          密钥值不会回显。编辑已有密钥时，留空表示不修改密钥内容。
        </p>
      </div>
      <div className="rounded-md border border-border bg-background px-3 py-2">
        <div className="text-[11px] font-medium uppercase text-muted-foreground">
          Secret value
        </div>
        <div className="mt-1 text-sm">{secret.has_secret ? "已保存" : "未保存"}</div>
      </div>
      <div className="rounded-md border border-border bg-background px-3 py-2">
        <div className="text-[11px] font-medium uppercase text-muted-foreground">
          Metadata
        </div>
        <div className="mt-1 truncate text-sm">{metadata}</div>
      </div>
      </div>
      <div className="grid gap-2">
        <div className="text-sm font-medium">引用模型</div>
        {insight?.referencedModels.map((model) => (
          <div
            key={model.id}
            className="grid gap-2 rounded-md border border-border bg-background px-3 py-2 text-sm md:grid-cols-[1fr_auto]"
          >
            <div>
              <div className="font-medium">{model.display_name}</div>
              <div className="text-muted-foreground">
                {model.upstream_model_name} / {model.upstream_base_url ?? "no base url"}
              </div>
            </div>
            <StatusBadge
              status={
                model.archived_at
                  ? "archived"
                  : model.enabled
                    ? "enabled"
                    : "disabled"
              }
            />
          </div>
        ))}
        {insight?.referencedModels.length ? null : (
          <EmptyState
            title="暂无模型引用"
            detail="没有模型档案引用该 secret_ref，可能是备用 key 或历史遗留。"
          />
        )}
      </div>
    </div>
  )
}

function buildSecretInsights(
  secrets: AdminLlmSecret[],
  models: AdminModelProfile[],
) {
  const bySecretRef = new Map<string, SecretInsight>()
  for (const secret of secrets) {
    const referencedModels = models.filter(
      (model) => model.upstream_api_key_ref === secret.secret_ref,
    )
    const activeReferencedModels = referencedModels.filter(
      (model) => model.enabled && !model.archived_at,
    )
    const health: SecretInsight["health"] = !secret.has_secret
      ? "missing"
      : secret.status !== "active"
        ? "inactive"
        : activeReferencedModels.length === 0
          ? "unused"
          : "healthy"

    bySecretRef.set(secret.secret_ref, {
      health,
      provider: inferProvider(referencedModels),
      referencedModels,
      secretRef: secret.secret_ref,
    })
  }

  const healthy = Array.from(bySecretRef.values()).filter(
    (item) => item.health === "healthy",
  ).length
  const missing = Array.from(bySecretRef.values()).filter(
    (item) => item.health === "missing",
  ).length
  const inactive = Array.from(bySecretRef.values()).filter(
    (item) => item.health === "inactive",
  ).length
  const unused = Array.from(bySecretRef.values()).filter(
    (item) => item.health === "unused",
  ).length
  const chartData: AppBarChartDatum[] = [
    {
      label: "Keys",
      healthy,
      missing,
      inactive,
      unused,
    },
  ]
  const chartSeries: AppBarChartSeries[] = [
    { key: "healthy", label: "Healthy", color: "var(--chart-1)" },
    { key: "missing", label: "Missing", color: "var(--chart-2)" },
    { key: "inactive", label: "Inactive", color: "var(--chart-3)" },
    { key: "unused", label: "Unused", color: "var(--chart-4)" },
  ]

  return {
    bySecretRef,
    chartData,
    chartSeries,
    riskySecrets: missing + inactive + unused,
  }
}

function inferProvider(models: AdminModelProfile[]) {
  const baseUrl = models.find((model) => model.upstream_base_url)?.upstream_base_url
  if (!baseUrl) return "-"
  try {
    return new URL(baseUrl).hostname.replace(/^api\./, "")
  } catch {
    return baseUrl
  }
}

function healthDetail(insight?: SecretInsight) {
  switch (insight?.health) {
    case "healthy":
      return "active models can use it"
    case "inactive":
      return "secret status is not active"
    case "missing":
      return "secret value is missing"
    case "unused":
      return "no active model references it"
    default:
      return "unknown key state"
  }
}

function SecretInfoItem({
  detail,
  label,
  value,
}: {
  detail: string
  label: string
  value: string
}) {
  return (
    <div className="rounded-md border border-border bg-background px-3 py-2 text-sm">
      <div className="text-[11px] font-medium uppercase text-muted-foreground">
        {label}
      </div>
      <div className="mt-1 font-medium">{value}</div>
      <div className="mt-1 text-xs text-muted-foreground">{detail}</div>
    </div>
  )
}

function formatCompactNumber(value: number) {
  return new Intl.NumberFormat(undefined, {
    notation: "compact",
    maximumFractionDigits: value >= 100 ? 1 : 2,
  }).format(value)
}

function SecretForm({
  secret,
  state,
  onChange,
  onSubmit,
  onCancel,
}: {
  secret: SecretForm
  state: LoadState
  onChange: React.Dispatch<React.SetStateAction<SecretForm | null>>
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => Promise<void>
  onCancel: () => void
}) {
  return (
    <form onSubmit={(event) => void onSubmit(event)} className="space-y-4">
      <AppDisclosureSection
        title="安全说明"
        description="密钥值不会回显；编辑已有密钥时留空表示不修改密钥内容。"
      >
        <p className="text-sm leading-6 text-muted-foreground">
          这里只维护 secret ref 和密钥状态。模型档案应引用 secret ref 或 env:NAME，不应保存原始 API key。
        </p>
      </AppDisclosureSection>
      <AppDisclosureSection title="密钥内容">
        <AppFieldGrid columns={1}>
          <FormField label="密钥引用">
            <Input
              value={secret.secret_ref}
              onChange={(event) =>
                onChange((current) =>
                  current ? { ...current, secret_ref: event.target.value } : current,
                )
              }
            />
          </FormField>
          <FormField label="密钥值">
            <Input
              type="password"
              value={secret.secret}
              placeholder="保存后不会回显"
              onChange={(event) =>
                onChange((current) =>
                  current ? { ...current, secret: event.target.value } : current,
                )
              }
            />
          </FormField>
          <FormField label="状态">
            <Input
              value={secret.status}
              onChange={(event) =>
                onChange((current) =>
                  current ? { ...current, status: event.target.value } : current,
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
          保存密钥
        </Button>
      </div>
    </form>
  )
}
