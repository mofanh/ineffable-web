import * as React from "react"
import {
  BotIcon,
  CheckIcon,
  PackageIcon,
  PlusIcon,
  SaveIcon,
  Trash2Icon,
} from "lucide-react"

import { ToggleField } from "@/components/app"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  EmptyState,
  SearchBar,
  StatusBadge,
  WorkbenchCard,
  WorkbenchDialog,
} from "@/components/workbench"
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
  Field,
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

  const activePlans = React.useMemo(
    () => plans.filter((plan) => !plan.archived_at),
    [plans],
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
      <section className="grid gap-4 xl:grid-cols-[0.9fr_1.1fr]">
        <WorkbenchCard
          title="套餐列表"
          description="每张卡片代表一个套餐。点击编辑可调整基础额度。"
          icon={PackageIcon}
          actions={
            <div className="flex items-center gap-2">
              <div className="hidden w-64 md:block">
                <SearchBar
                  value={query}
                  onChange={setQuery}
                  placeholder="搜索套餐..."
                />
              </div>
              <Button type="button" onClick={openCreateDialog}>
                <PlusIcon />
                新增套餐
              </Button>
            </div>
          }
        >
          <div className="mb-3 md:hidden">
            <SearchBar value={query} onChange={setQuery} placeholder="搜索套餐..." />
          </div>
          <div className="grid gap-3">
            {filteredPlans.map((plan) => (
              <div
                key={plan.id}
                className={`rounded-md border bg-background/60 p-4 text-sm transition-colors hover:bg-muted/60 ${
                  plan.id === selectedPlanId ? "border-primary" : "border-border"
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="truncate font-medium">{plan.display_name}</div>
                    <div className="mt-1 truncate text-muted-foreground">
                      {plan.id} / {plan.monthly_credit_limit ?? "不限额"}
                    </div>
                    <div className="mt-2 text-xs text-muted-foreground">
                      内部名称：{plan.name}
                    </div>
                  </div>
                  <StatusBadge
                    status={
                      plan.archived_at
                        ? "archived"
                        : plan.enabled
                          ? "enabled"
                          : "disabled"
                    }
                  />
                </div>
                <div className="mt-4 flex justify-end gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setSelectedPlanId(plan.id)}
                    disabled={Boolean(plan.archived_at)}
                  >
                    权限
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => void deletePlan(plan)}
                    disabled={
                      state !== "idle" || plan.id === "free" || Boolean(plan.archived_at)
                    }
                  >
                    <Trash2Icon />
                    删除
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => openEditDialog(plan)}
                    disabled={Boolean(plan.archived_at)}
                  >
                    编辑
                  </Button>
                </div>
              </div>
            ))}
            {filteredPlans.length === 0 ? (
              <EmptyState title="暂无套餐" detail="新增套餐后会出现在这里。" />
            ) : null}
          </div>
        </WorkbenchCard>

        <WorkbenchCard
          title="套餐模型权限"
          description="不可见的模型会自动变成不可用。"
          icon={BotIcon}
          actions={
            <select
              value={selectedPlanId}
              onChange={(event) => setSelectedPlanId(event.target.value)}
              className="h-8 rounded-md border bg-background px-2 text-sm"
            >
              {activePlans.map((plan) => (
                <option key={plan.id} value={plan.id}>
                  {plan.display_name}
                </option>
              ))}
            </select>
          }
        >
          <div className="grid gap-2">
            {activeModels.map((model) => {
              const existing = accessRows.find(
                (item) => item.model_profile_id === model.id,
              )
              const access = normalizeAccess(
                existing ?? modelAccessFor(selectedPlanId, model.id),
              )

              return (
                <div
                  key={model.id}
                  className="grid gap-3 rounded-md border border-border bg-background/60 p-3 md:grid-cols-[1fr_auto_auto_auto]"
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
                      void saveAccess(model.id, {
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
                      void saveAccess(model.id, { ...access, usable: checked })
                    }
                  />
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => void saveAccess(model.id, access)}
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
        </WorkbenchCard>
      </section>

      <WorkbenchDialog
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
      </WorkbenchDialog>
    </SystemPageShell>
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
      <div className="grid gap-3">
        <Field label="内部名称">
          <Input
            value={plan.name}
            onChange={(event) =>
              onChange((current) =>
                current ? { ...current, name: event.target.value } : current,
              )
            }
          />
        </Field>
        <Field label="展示名">
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
        </Field>
        <Field label="月额度">
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
        </Field>
        <ToggleField
          label="启用套餐"
          checked={plan.enabled}
          onCheckedChange={(checked) =>
            onChange((current) =>
              current ? { ...current, enabled: checked } : current,
            )
          }
        />
      </div>
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
