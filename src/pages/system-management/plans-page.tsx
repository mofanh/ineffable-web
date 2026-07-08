import * as React from "react"
import {
  BotIcon,
  ChevronDownIcon,
  CheckIcon,
  Edit3Icon,
  PackageIcon,
  PlusIcon,
  SaveIcon,
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
  createAdminPlan,
  deleteAdminPlan,
  listAdminModelProfiles,
  listAdminPlanModelAccess,
  listAdminPlans,
  upsertAdminPlanModelAccess,
  updateAdminPlan,
  type AdminModelProfile,
  type AdminPlan,
  type AdminPlanPayload,
  type AdminPlanModelAccess,
} from "@/lib/api/api-client"
import { normalizeAppError } from "@/lib/app/api-errors"
import { confirm } from "@/lib/app/confirm"
import { notify } from "@/lib/app/notifications"

import {
  AdminAccessDenied,
  SystemPageShell,
  emptyPlan,
  modelAccessFor,
  normalizeAccess,
  numberOrNull,
  type LoadState,
} from "./shared"

export function SystemPlanManagementPage() {
  const { accessToken, currentUser } = useAuthSession()
  const [models, setModels] = React.useState<AdminModelProfile[]>([])
  const [plans, setPlans] = React.useState<AdminPlan[]>([])
  const [selectedPlanId, setSelectedPlanId] = React.useState("free")
  const [accessRows, setAccessRows] = React.useState<AdminPlanModelAccess[]>([])
  const [query, setQuery] = React.useState("")
  const [expandedPlanIds, setExpandedPlanIds] = React.useState<Set<string>>(
    () => new Set()
  )
  const [editingPlan, setEditingPlan] = React.useState<AdminPlanPayload | null>(
    null,
  )
  const [editingPlanId, setEditingPlanId] = React.useState<string | null>(null)
  const [dialogOpen, setDialogOpen] = React.useState(false)
  const [state, setState] = React.useState<LoadState>("idle")
  const [message, setMessage] = React.useState("")
  const [error, setError] = React.useState("")
  const isAdmin = currentUser?.role === "admin"

  const loadPlans = React.useCallback(async () => {
    if (!accessToken || !isAdmin) return
    setState("loading")
    setError("")
    try {
      const [modelResult, planResult] = await Promise.all([
        listAdminModelProfiles(accessToken),
        listAdminPlans(accessToken),
      ])
      setModels(modelResult.profiles)
      setPlans(planResult.plans)
      setSelectedPlanId((current) =>
        planResult.plans.some((plan) => plan.id === current && !plan.archived_at)
          ? current
          : (planResult.plans.find((plan) => !plan.archived_at)?.id ?? "free"),
      )
    } catch (loadError) {
      const appError = normalizeAppError(loadError, {
        fallbackMessage: "加载失败",
      })
      setError(appError.message)
      notify.error({
        title: "加载套餐失败",
        description: appError.message,
      })
    } finally {
      setState("idle")
    }
  }, [accessToken, isAdmin])

  React.useEffect(() => {
    void loadPlans()
  }, [loadPlans])

  React.useEffect(() => {
    if (!accessToken || !isAdmin || !selectedPlanId) {
      setAccessRows([])
      return
    }

    let cancelled = false
    void listAdminPlanModelAccess(accessToken, selectedPlanId)
      .then((result) => {
        if (!cancelled) setAccessRows(result.access.map(normalizeAccess))
      })
      .catch((loadError) => {
        if (!cancelled) {
          const appError = normalizeAppError(loadError, {
            fallbackMessage: "加载失败",
          })
          setError(appError.message)
          notify.error({
            title: "加载套餐权限失败",
            description: appError.message,
          })
        }
      })

    return () => {
      cancelled = true
    }
  }, [accessToken, isAdmin, selectedPlanId])

  const filteredPlans = React.useMemo(() => {
    const keyword = query.trim().toLowerCase()
    if (!keyword) return plans
    return plans.filter((plan) =>
      `${plan.id} ${plan.name} ${plan.display_name}`.toLowerCase().includes(keyword),
    )
  }, [plans, query])

  const activeModels = React.useMemo(
    () => models.filter((model) => !model.archived_at),
    [models],
  )

  const metrics = React.useMemo(
    () => [
      {
        label: "Plans",
        value: String(plans.length),
        detail: `${plans.filter((plan) => plan.enabled && !plan.archived_at).length} enabled`,
        icon: PackageIcon,
        tone: "blue" as const,
      },
      {
        label: "Models",
        value: String(models.length),
        detail: "available for grants",
        icon: BotIcon,
        tone: "green" as const,
      },
      {
        label: "Current",
        value: selectedPlanId || "-",
        detail: "selected plan",
        icon: CheckIcon,
        tone: "amber" as const,
      },
    ],
    [models.length, plans, selectedPlanId],
  )

  function openCreateDialog() {
    setEditingPlan({ ...emptyPlan })
    setEditingPlanId(null)
    setDialogOpen(true)
  }

  function openEditDialog(plan: AdminPlan) {
    setEditingPlan({
      name: plan.name,
      display_name: plan.display_name,
      monthly_credit_limit: plan.monthly_credit_limit ?? null,
      enabled: plan.enabled,
    })
    setEditingPlanId(plan.id)
    setSelectedPlanId(plan.id)
    setDialogOpen(true)
  }

  function toggleExpandedPlan(planId: string) {
    setSelectedPlanId(planId)
    setExpandedPlanIds((current) => {
      return current.has(planId) ? new Set() : new Set([planId])
    })
  }

  async function savePlan(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!accessToken || !editingPlan) return
    setState("saving")
    setError("")
    try {
      const result = editingPlanId
        ? await updateAdminPlan(accessToken, editingPlanId, editingPlan)
        : await createAdminPlan(accessToken, editingPlan)
      setPlans((current) => [
        result.plan,
        ...current.filter((item) => item.id !== result.plan.id),
      ])
      setSelectedPlanId(result.plan.id)
      setMessage(`套餐已保存：${result.plan.display_name}`)
      notify.success({
        title: "套餐已保存",
        description: result.plan.display_name,
      })
      setDialogOpen(false)
    } catch (saveError) {
      const appError = normalizeAppError(saveError, {
        fallbackMessage: "保存失败",
      })
      setError(appError.message)
      notify.error({
        title: "保存套餐失败",
        description: appError.message,
      })
    } finally {
      setState("idle")
    }
  }

  async function deletePlan(plan: AdminPlan) {
    if (!accessToken || plan.id === "free" || plan.archived_at) return
    const confirmed = await confirm({
      title: `删除套餐「${plan.display_name}」？`,
      description: "删除后，已有用户会在运行时自动回落到 Free 套餐。",
      confirmLabel: "删除套餐",
      variant: "destructive",
    })
    if (!confirmed) {
      return
    }
    setState("saving")
    setError("")
    try {
      const result = await deleteAdminPlan(accessToken, plan.id)
      setPlans((current) => [
        result.plan,
        ...current.filter((item) => item.id !== result.plan.id),
      ])
      setSelectedPlanId((current) => (current === plan.id ? "free" : current))
      setMessage(`套餐已删除：${result.plan.display_name}`)
      notify.success({
        title: "套餐已删除",
        description: result.plan.display_name,
      })
    } catch (deleteError) {
      const appError = normalizeAppError(deleteError, {
        fallbackMessage: "删除失败",
      })
      setError(appError.message)
      notify.error({
        title: "删除套餐失败",
        description: appError.message,
      })
    } finally {
      setState("idle")
    }
  }

  async function saveAccess(modelId: string, next: AdminPlanModelAccess) {
    if (!accessToken) return
    const payload = normalizeAccess(next)
    setState("saving")
    setError("")
    try {
      const result = await upsertAdminPlanModelAccess(accessToken, payload)
      const normalized = normalizeAccess(result.access)
      setAccessRows((current) => [
        normalized,
        ...current.filter((item) => item.model_profile_id !== modelId),
      ])
      setMessage(`权限已保存：${selectedPlanId} / ${modelId}`)
      notify.success({
        title: "套餐权限已保存",
        description: `${selectedPlanId} / ${modelId}`,
      })
    } catch (saveError) {
      const appError = normalizeAppError(saveError, {
        fallbackMessage: "保存失败",
      })
      setError(appError.message)
      notify.error({
        title: "保存套餐权限失败",
        description: appError.message,
      })
    } finally {
      setState("idle")
    }
  }

  if (!isAdmin) return <AdminAccessDenied />

  return (
    <SystemPageShell
      title="套餐管理"
      subtitle="配置套餐额度，并控制不同套餐可见、可用的模型范围。"
      metrics={metrics}
      state={state}
      message={message}
      error={error}
      onRefresh={() => void loadPlans()}
    >
      <AppSectionCard
        title="套餐列表"
        description="主视图保持单列表格，模型权限配置通过行内展开维护。"
        icon={PackageIcon}
      >
        <AppListToolbar
          search={
            <AppSearchBar
              value={query}
              onChange={setQuery}
              placeholder="搜索套餐..."
            />
          }
          actions={
            <Button type="button" onClick={openCreateDialog}>
              <PlusIcon />
              新增套餐
            </Button>
          }
          className="-mx-4 -mt-4 mb-4"
        />
        <div className="grid gap-3">
          {filteredPlans.length > 0 ? (
            <DataTableShell>
              <DataTableHeader>
                <tr>
                  <th className="w-10 px-4 py-3" />
                  <th className="px-4 py-3">套餐</th>
                  <th className="px-4 py-3">月额度</th>
                  <th className="px-4 py-3">模型权限</th>
                  <th className="px-4 py-3">状态</th>
                  <th className="px-4 py-3 text-right">操作</th>
                </tr>
              </DataTableHeader>
              <DataTableBody>
                {filteredPlans.map((plan) => {
                  const expanded = expandedPlanIds.has(plan.id)
                  const accessCount =
                    plan.id === selectedPlanId
                      ? accessRows.filter((item) => item.visible).length
                      : "-"
                  return (
                    <React.Fragment key={plan.id}>
                      <tr className="hover:bg-muted/20">
                        <td className="px-4 py-3">
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon-sm"
                            aria-label={expanded ? "收起套餐权限" : "展开套餐权限"}
                            disabled={Boolean(plan.archived_at)}
                            onClick={() => toggleExpandedPlan(plan.id)}
                          >
                            <ChevronDownIcon
                              className={`size-4 transition-transform ${expanded ? "rotate-180" : ""}`}
                            />
                          </Button>
                        </td>
                        <td className="px-4 py-3">
                          <div className="font-medium">{plan.display_name}</div>
                          <div className="mt-1 text-xs text-muted-foreground">
                            {plan.id} / {plan.name}
                          </div>
                        </td>
                        <td className="px-4 py-3">{plan.monthly_credit_limit ?? "不限额"}</td>
                        <td className="px-4 py-3">{accessCount}</td>
                        <td className="px-4 py-3">
                          <StatusBadge
                            status={
                              plan.archived_at
                                ? "archived"
                                : plan.enabled
                                  ? "enabled"
                                  : "disabled"
                            }
                          />
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex justify-end gap-2">
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() => openEditDialog(plan)}
                              disabled={Boolean(plan.archived_at)}
                            >
                              <Edit3Icon />
                              编辑
                            </Button>
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() => void deletePlan(plan)}
                              disabled={state !== "idle" || plan.id === "free" || Boolean(plan.archived_at)}
                            >
                              <Trash2Icon />
                              删除
                            </Button>
                          </div>
                        </td>
                      </tr>
                      {expanded ? (
                        <tr>
                          <td colSpan={6} className="p-0">
                            <AppExpandablePanel>
                              <PlanAccessPanel
                                activeModels={activeModels}
                                accessRows={plan.id === selectedPlanId ? accessRows : []}
                                planId={plan.id}
                                state={state}
                                onSaveAccess={saveAccess}
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
          {filteredPlans.length === 0 ? (
            <EmptyState title="暂无套餐" detail="新增套餐后会出现在这里。" />
          ) : null}
        </div>
      </AppSectionCard>

      <AppDialog
        open={dialogOpen}
        title={editingPlanId ? "编辑套餐" : "新增套餐"}
        description="套餐保存后可在权限区配置可见和可用模型。"
        onOpenChange={setDialogOpen}
      >
        {editingPlan ? (
          <PlanForm
            plan={editingPlan}
            state={state}
            onChange={setEditingPlan}
            onSubmit={savePlan}
            onCancel={() => setDialogOpen(false)}
          />
        ) : null}
      </AppDialog>
    </SystemPageShell>
  )
}

function PlanAccessPanel({
  activeModels,
  accessRows,
  planId,
  state,
  onSaveAccess,
}: {
  activeModels: AdminModelProfile[]
  accessRows: AdminPlanModelAccess[]
  planId: string
  state: LoadState
  onSaveAccess: (modelId: string, next: AdminPlanModelAccess) => Promise<void>
}) {
  return (
    <div className="grid gap-3">
      <div className="text-sm text-muted-foreground">
        不可见的模型会自动变成不可用。当前配置套餐：{planId}
      </div>
      {activeModels.map((model) => {
        const existing = accessRows.find((item) => item.model_profile_id === model.id)
        const access = normalizeAccess(existing ?? modelAccessFor(planId, model.id))

        return (
          <div
            key={model.id}
            className="grid gap-3 rounded-md border border-border bg-background p-3 md:grid-cols-[1fr_auto_auto_auto]"
          >
            <div>
              <div className="font-medium">{model.display_name}</div>
              <div className="text-sm text-muted-foreground">
                {model.id} / {model.upstream_model_name}
              </div>
            </div>
            <ToggleField
              label="可见"
              checked={access.visible}
              onCheckedChange={(checked) =>
                void onSaveAccess(model.id, {
                  ...access,
                  visible: checked,
                  usable: checked ? access.usable : false,
                })
              }
            />
            <ToggleField
              label="可用"
              checked={access.usable}
              disabled={!access.visible}
              onCheckedChange={(checked) =>
                void onSaveAccess(model.id, { ...access, usable: checked })
              }
            />
            <Button
              type="button"
              variant="outline"
              onClick={() => void onSaveAccess(model.id, access)}
              disabled={state !== "idle"}
            >
              <CheckIcon />
              授权
            </Button>
          </div>
        )
      })}
      {activeModels.length === 0 ? (
        <EmptyState title="暂无模型" detail="先创建模型档案后再配置套餐权限。" />
      ) : null}
    </div>
  )
}

function PlanForm({
  plan,
  state,
  onChange,
  onSubmit,
  onCancel,
}: {
  plan: AdminPlanPayload
  state: LoadState
  onChange: React.Dispatch<React.SetStateAction<AdminPlanPayload | null>>
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => Promise<void>
  onCancel: () => void
}) {
  return (
    <form onSubmit={(event) => void onSubmit(event)} className="space-y-4">
      <AppDisclosureSection title="套餐基础信息">
        <AppFieldGrid columns={1}>
          <FormField label="内部名称">
            <Input
              value={plan.name}
              onChange={(event) =>
                onChange((current) =>
                  current ? { ...current, name: event.target.value } : current,
                )
              }
            />
          </FormField>
          <FormField label="展示名">
            <Input
              value={plan.display_name}
              onChange={(event) =>
                onChange((current) =>
                  current
                    ? { ...current, display_name: event.target.value }
                    : current,
                )
              }
            />
          </FormField>
          <FormField label="月额度">
            <Input
              type="number"
              value={plan.monthly_credit_limit ?? ""}
              onChange={(event) =>
                onChange((current) =>
                  current
                    ? {
                        ...current,
                        monthly_credit_limit: numberOrNull(event.target.value),
                      }
                    : current,
                )
              }
            />
          </FormField>
          <ToggleField
            label="启用套餐"
            checked={plan.enabled}
            onCheckedChange={(checked) =>
              onChange((current) =>
                current ? { ...current, enabled: checked } : current,
              )
            }
          />
        </AppFieldGrid>
      </AppDisclosureSection>
      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={onCancel}>
          取消
        </Button>
        <Button type="submit" disabled={state !== "idle"}>
          <SaveIcon />
          保存套餐
        </Button>
      </div>
    </form>
  )
}
