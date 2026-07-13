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
  ToggleField,
} from "@/components/app"
import { useAuthSession } from "@/features/auth/app-session"
import {
  createAdminPlan,
  deleteAdminPlan,
  listAdminUserMonthlyUsage,
  listAdminUserPlanAssignments,
  listAdminUsers,
  listAdminWorkspaceUsage,
  listAdminModelProfiles,
  listAdminPlanModelAccess,
  listAdminPlans,
  upsertAdminPlanModelAccess,
  updateAdminPlan,
  type AdminModelProfile,
  type AdminPlan,
  type AdminPlanPayload,
  type AdminPlanModelAccess,
  type AdminUser,
  type AdminUserMonthlyUsage,
  type AdminUserPlanAssignment,
  type AdminWorkspaceUsage,
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
  systemStatusLabel,
  type LoadState,
} from "./shared"

type PlanInsight = {
  planId: string
  assignedUsers: number
  currentCredits: number
  storageBytes: number
  creditPressurePercent: number
  storagePressurePercent?: number
}

export function SystemPlanManagementPage() {
  const { accessToken, currentUser } = useAuthSession()
  const [models, setModels] = React.useState<AdminModelProfile[]>([])
  const [plans, setPlans] = React.useState<AdminPlan[]>([])
  const [users, setUsers] = React.useState<AdminUser[]>([])
  const [userAssignments, setUserAssignments] = React.useState<
    AdminUserPlanAssignment[]
  >([])
  const [userUsageRows, setUserUsageRows] = React.useState<
    AdminUserMonthlyUsage[]
  >([])
  const [workspaceUsage, setWorkspaceUsage] = React.useState<
    AdminWorkspaceUsage[]
  >([])
  const [selectedPlanId, setSelectedPlanId] = React.useState("free")
  const [accessRowsByPlanId, setAccessRowsByPlanId] = React.useState<
    Record<string, AdminPlanModelAccess[]>
  >({})
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
      const [modelResult, planResult, userResult, workspaceUsageResult] =
        await Promise.all([
        listAdminModelProfiles(accessToken),
        listAdminPlans(accessToken),
          listAdminUsers(accessToken),
          listAdminWorkspaceUsage(accessToken),
      ])
      const userDetailResults = await Promise.all(
        userResult.users.map(async (user) => {
          const [assignmentResult, usageResult] = await Promise.all([
            listAdminUserPlanAssignments(accessToken, user.id),
            listAdminUserMonthlyUsage(accessToken, user.id, 1),
          ])
          return {
            assignments: assignmentResult.assignments,
            usage: usageResult.usage,
          }
        }),
      )
      setModels(modelResult.profiles)
      setPlans(planResult.plans)
      setUsers(userResult.users)
      setWorkspaceUsage(workspaceUsageResult.usage)
      setUserAssignments(
        userDetailResults.flatMap((result) => result.assignments),
      )
      setUserUsageRows(userDetailResults.flatMap((result) => result.usage))
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
      return
    }

    let cancelled = false
    const planId = selectedPlanId
    void listAdminPlanModelAccess(accessToken, selectedPlanId)
      .then((result) => {
        if (!cancelled) {
          setAccessRowsByPlanId((current) => ({
            ...current,
            [planId]: result.access.map(normalizeAccess),
          }))
        }
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

  const planInsights = React.useMemo(
    () =>
      buildPlanInsights({
        assignments: userAssignments,
        plans,
        userUsageRows,
        users,
        workspaceUsage,
      }),
    [plans, userAssignments, userUsageRows, users, workspaceUsage],
  )

  const metrics = React.useMemo(
    () => [
      {
        label: "套餐数量",
        value: String(plans.length),
        detail: `${plans.filter((plan) => plan.enabled && !plan.archived_at).length} 个已启用`,
        icon: PackageIcon,
        tone: "blue" as const,
      },
      {
        label: "模型数量",
        value: String(models.length),
        detail: "可配置授权",
        icon: BotIcon,
        tone: "green" as const,
      },
      {
        label: "当前查看",
        value: selectedPlanId || "-",
        detail: "已选择套餐",
        icon: CheckIcon,
        tone: "amber" as const,
      },
      {
        label: "已分配用户",
        value: formatCompactNumber(planInsights.assignedUsers),
        detail: "有效分配",
        icon: PackageIcon,
        tone: "indigo" as const,
      },
    ],
    [models.length, planInsights.assignedUsers, plans, selectedPlanId],
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
      workspace_storage_limit_bytes: plan.workspace_storage_limit_bytes ?? null,
      max_workspace_count: plan.max_workspace_count ?? null,
      max_members_per_workspace: plan.max_members_per_workspace ?? null,
      workspace_object_count_limit: plan.workspace_object_count_limit ?? null,
      max_file_size_bytes: plan.max_file_size_bytes ?? null,
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
      setAccessRowsByPlanId((current) => ({
        ...current,
        [payload.plan_id]: [
          normalized,
          ...(current[payload.plan_id] ?? []).filter(
            (item) => item.model_profile_id !== modelId,
          ),
        ],
      }))
      setMessage(`权限已保存：${payload.plan_id} / ${modelId}`)
      notify.success({
        title: "套餐权限已保存",
        description: `${payload.plan_id} / ${modelId}`,
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
        title="套餐压力概览"
        description="按套餐聚合有效用户数、本月点数和工作区存储，用于判断额度与套餐设计是否匹配。"
        icon={PackageIcon}
      >
        <AppBarChart
          data={planInsights.chartData}
          series={planInsights.chartSeries}
          height={220}
          valueFormatter={formatCompactNumber}
          emptyTitle="暂无套餐压力数据"
          emptyDescription="产生用户分配、usage 或 workspace storage 后，这里会展示套餐压力。"
        />
      </AppSectionCard>

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
                  <th className="w-12 px-3 py-3 sm:px-4" />
                  <th className="w-auto px-3 py-3 sm:px-4">套餐</th>
                  <th className="hidden w-32 px-4 py-3 @xl/table:table-cell">月额度</th>
                  <th className="hidden w-32 px-4 py-3 @3xl/table:table-cell">工作区</th>
                  <th className="hidden w-24 px-4 py-3 @4xl/table:table-cell">模型权限</th>
                  <th className="hidden w-32 px-4 py-3 @5xl/table:table-cell">消耗压力</th>
                  <th className="w-20 px-3 py-3 sm:w-24 sm:px-4">状态</th>
                  <th className="w-24 px-3 py-3 text-right sm:w-40 sm:px-4">操作</th>
                </tr>
              </DataTableHeader>
              <DataTableBody>
                {filteredPlans.map((plan) => {
                  const expanded = expandedPlanIds.has(plan.id)
                  const accessRows = accessRowsByPlanId[plan.id]
                  const insight = planInsights.byPlanId.get(plan.id)
                  const accessCount = accessRows
                    ? accessRows.filter((item) => item.visible).length
                    : "-"
                  return (
                    <React.Fragment key={plan.id}>
                      <tr className="hover:bg-muted/20">
                        <td className="px-3 py-3 sm:px-4">
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
                        <td className="min-w-0 px-3 py-3 sm:px-4">
                          <div className="truncate font-medium">{plan.display_name}</div>
                          <div className="mt-1 truncate text-xs text-muted-foreground">
                            {plan.id} / {plan.name}
                          </div>
                        </td>
                        <td className="hidden px-4 py-3 @xl/table:table-cell">{plan.monthly_credit_limit ?? "不限额"}</td>
                        <td className="hidden px-4 py-3 @3xl/table:table-cell">
                          <div>{formatBytesLimit(plan.workspace_storage_limit_bytes)}</div>
                          <div className="mt-1 text-xs text-muted-foreground">
                            {formatLimitCount(plan.max_workspace_count)} 空间 /{" "}
                            {formatLimitCount(plan.max_members_per_workspace)} 成员
                          </div>
                          <div className="mt-1 text-xs text-muted-foreground">
                            {formatLimitCount(plan.workspace_object_count_limit)} 对象 /{" "}
                            {formatBytesLimit(plan.max_file_size_bytes)} 单文件
                          </div>
                        </td>
                        <td className="hidden px-4 py-3 @4xl/table:table-cell">{accessCount}</td>
                        <td className="hidden px-4 py-3 @5xl/table:table-cell">
                          <div>{formatCompactNumber(insight?.assignedUsers ?? 0)} users</div>
                          <div className="mt-1 text-xs text-muted-foreground">
                            {formatCompactNumber(insight?.currentCredits ?? 0)} credits
                          </div>
                          <div className="mt-1 text-xs text-muted-foreground">
                            {formatBytesLimit(insight?.storageBytes ?? 0)} used
                          </div>
                        </td>
                        <td className="px-3 py-3 sm:px-4">
                          <StatusBadge
                            status={
                              plan.archived_at
                                ? "archived"
                                : plan.enabled
                                  ? "enabled"
                                  : "disabled"
                            }
                            label={systemStatusLabel(
                              plan.archived_at
                                ? "archived"
                                : plan.enabled
                                  ? "enabled"
                                  : "disabled"
                            )}
                          />
                        </td>
                        <td className="px-3 py-3 sm:px-4">
                          <div className="flex justify-end gap-1 sm:gap-2">
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() => openEditDialog(plan)}
                              disabled={Boolean(plan.archived_at)}
                            >
                              <Edit3Icon />
                              <span className="hidden sm:inline">编辑</span>
                            </Button>
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() => void deletePlan(plan)}
                              disabled={state !== "idle" || plan.id === "free" || Boolean(plan.archived_at)}
                            >
                              <Trash2Icon />
                              <span className="hidden sm:inline">删除</span>
                            </Button>
                          </div>
                        </td>
                      </tr>
                      {expanded ? (
                        <tr>
                          <td colSpan={8} className="p-0">
                            <AppExpandablePanel>
                              <PlanAccessPanel
                                activeModels={activeModels}
                                accessRows={accessRows}
                                insight={insight}
                                plan={plan}
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

function buildPlanInsights({
  assignments,
  plans,
  userUsageRows,
  users,
  workspaceUsage,
}: {
  assignments: AdminUserPlanAssignment[]
  plans: AdminPlan[]
  userUsageRows: AdminUserMonthlyUsage[]
  users: AdminUser[]
  workspaceUsage: AdminWorkspaceUsage[]
}) {
  const byPlanId = new Map<string, PlanInsight>()
  const activePlanByUserId = new Map<string, string>()
  const userIds = new Set(users.map((user) => user.id))

  for (const assignment of assignments) {
    if (assignment.status !== "active" || !userIds.has(assignment.user_id)) {
      continue
    }
    const currentPlanId = activePlanByUserId.get(assignment.user_id)
    if (!currentPlanId) {
      activePlanByUserId.set(assignment.user_id, assignment.plan_id)
      continue
    }
    const currentAssignment = assignments.find(
      (item) =>
        item.user_id === assignment.user_id &&
        item.plan_id === currentPlanId &&
        item.status === "active",
    )
    if (
      currentAssignment &&
      assignment.effective_from.localeCompare(currentAssignment.effective_from) > 0
    ) {
      activePlanByUserId.set(assignment.user_id, assignment.plan_id)
    }
  }

  for (const plan of plans) {
    const assignedUsers = Array.from(activePlanByUserId.values()).filter(
      (planId) => planId === plan.id,
    ).length
    const assignedUserIds = new Set(
      Array.from(activePlanByUserId.entries())
        .filter(([, planId]) => planId === plan.id)
        .map(([userId]) => userId),
    )
    const currentCredits = userUsageRows
      .filter((row) => assignedUserIds.has(row.user_id))
      .reduce((total, row) => total + row.charged_credits, 0)
    const storageBytes = workspaceUsage
      .filter((row) => row.plan_id === plan.id)
      .reduce((total, row) => total + row.storage_bytes, 0)
    const aggregateCreditLimit =
      plan.monthly_credit_limit == null
        ? null
        : plan.monthly_credit_limit * Math.max(assignedUsers, 1)
    const aggregateStorageLimit =
      plan.workspace_storage_limit_bytes == null
        ? null
        : plan.workspace_storage_limit_bytes *
          Math.max(
            workspaceUsage.filter((row) => row.plan_id === plan.id).length,
            1,
          )

    byPlanId.set(plan.id, {
      planId: plan.id,
      assignedUsers,
      currentCredits,
      storageBytes,
      creditPressurePercent:
        aggregateCreditLimit && aggregateCreditLimit > 0
          ? Math.round((currentCredits / aggregateCreditLimit) * 100)
          : 0,
      storagePressurePercent:
        aggregateStorageLimit && aggregateStorageLimit > 0
          ? Math.round((storageBytes / aggregateStorageLimit) * 100)
          : undefined,
    })
  }

  const chartData: AppBarChartDatum[] = plans
    .filter((plan) => !plan.archived_at)
    .slice(0, 8)
    .map((plan) => {
      const insight = byPlanId.get(plan.id)
      return {
        label: plan.display_name,
        users: insight?.assignedUsers ?? 0,
        credits: insight?.currentCredits ?? 0,
        storage_gb: (insight?.storageBytes ?? 0) / 1024 / 1024 / 1024,
      }
    })
  const chartSeries: AppBarChartSeries[] = [
    {
      key: "users",
      label: "用户",
      color: "var(--chart-1)",
    },
    {
      key: "credits",
      label: "点数",
      color: "var(--chart-2)",
    },
    {
      key: "storage_gb",
      label: "存储 GB",
      color: "var(--chart-3)",
    },
  ]

  return {
    assignedUsers: Array.from(byPlanId.values()).reduce(
      (total, item) => total + item.assignedUsers,
      0,
    ),
    byPlanId,
    chartData,
    chartSeries,
  }
}

function PlanAccessPanel({
  activeModels,
  accessRows,
  insight,
  plan,
  planId,
  state,
  onSaveAccess,
}: {
  activeModels: AdminModelProfile[]
  accessRows?: AdminPlanModelAccess[]
  insight?: PlanInsight
  plan: AdminPlan
  planId: string
  state: LoadState
  onSaveAccess: (modelId: string, next: AdminPlanModelAccess) => Promise<void>
}) {
  if (!accessRows) {
    return <EmptyState title="正在加载套餐权限" detail="权限数据返回后再维护模型可见和可用范围。" />
  }

  return (
    <div className="grid gap-3">
      <div className="grid gap-2 md:grid-cols-3">
        <InsightItem
          label="分配用户"
          value={formatCompactNumber(insight?.assignedUsers ?? 0)}
          detail="active assignments"
        />
        <InsightItem
          label="本月 Credits"
          value={formatCompactNumber(insight?.currentCredits ?? 0)}
          detail={
            plan.monthly_credit_limit
              ? `${formatCompactNumber(insight?.creditPressurePercent ?? 0)}% of aggregate limit`
              : "未设置 credit limit"
          }
        />
        <InsightItem
          label="Workspace Storage"
          value={formatBytesLimit(insight?.storageBytes ?? 0)}
          detail={
            insight?.storagePressurePercent == null
              ? "未设置 storage limit"
              : `${formatCompactNumber(insight.storagePressurePercent)}% of aggregate limit`
          }
        />
      </div>
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

function InsightItem({
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
      <AppDisclosureSection title="点数限额" description="控制用户每个自然月可消耗的 LLM 计费点数。">
        <AppFieldGrid columns={1}>
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
        </AppFieldGrid>
      </AppDisclosureSection>
      <AppDisclosureSection title="工作区限额" description="控制工作区数量、成员数、对象数、单文件大小和总存储容量。">
        <AppFieldGrid columns={1}>
          <FormField label="存储容量（GB）">
            <Input
              type="number"
              min={0}
              step="0.1"
              value={bytesToGigabytesInput(plan.workspace_storage_limit_bytes)}
              onChange={(event) =>
                onChange((current) =>
                  current
                    ? {
                        ...current,
                        workspace_storage_limit_bytes: gigabytesToBytesOrNull(
                          event.target.value,
                        ),
                      }
                    : current,
                )
              }
            />
          </FormField>
          <FormField label="Workspace 数量">
            <Input
              type="number"
              min={0}
              step={1}
              value={plan.max_workspace_count ?? ""}
              onChange={(event) =>
                onChange((current) =>
                  current
                    ? {
                        ...current,
                        max_workspace_count: numberOrNull(event.target.value),
                      }
                    : current,
                )
              }
            />
          </FormField>
          <FormField label="每个 Workspace 成员数">
            <Input
              type="number"
              min={0}
              step={1}
              value={plan.max_members_per_workspace ?? ""}
              onChange={(event) =>
                onChange((current) =>
                  current
                    ? {
                        ...current,
                        max_members_per_workspace: numberOrNull(event.target.value),
                      }
                    : current,
                )
              }
            />
          </FormField>
          <FormField label="每个 Workspace 对象数">
            <Input
              type="number"
              min={0}
              step={1}
              value={plan.workspace_object_count_limit ?? ""}
              onChange={(event) =>
                onChange((current) =>
                  current
                    ? {
                        ...current,
                        workspace_object_count_limit: numberOrNull(
                          event.target.value,
                        ),
                      }
                    : current,
                )
              }
            />
          </FormField>
          <FormField label="单文件大小（MB）">
            <Input
              type="number"
              min={0}
              step="0.1"
              value={bytesToMegabytesInput(plan.max_file_size_bytes)}
              onChange={(event) =>
                onChange((current) =>
                  current
                    ? {
                        ...current,
                        max_file_size_bytes: megabytesToBytesOrNull(
                          event.target.value,
                        ),
                      }
                    : current,
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
          保存套餐
        </Button>
      </div>
    </form>
  )
}

function bytesToGigabytesInput(value?: number | null) {
  if (value == null) return ""
  return String(Number((value / 1024 / 1024 / 1024).toFixed(2)))
}

function gigabytesToBytesOrNull(value: string) {
  const parsed = numberOrNull(value)
  if (parsed == null) return null
  return Math.round(parsed * 1024 * 1024 * 1024)
}

function bytesToMegabytesInput(value?: number | null) {
  if (value == null) return ""
  return String(Number((value / 1024 / 1024).toFixed(2)))
}

function megabytesToBytesOrNull(value: string) {
  const parsed = numberOrNull(value)
  if (parsed == null) return null
  return Math.round(parsed * 1024 * 1024)
}

function formatBytesLimit(value?: number | null) {
  if (value == null) return "不限额"
  if (value >= 1024 * 1024 * 1024) {
    return `${formatCompactNumber(value / 1024 / 1024 / 1024)} GB`
  }
  if (value >= 1024 * 1024) {
    return `${formatCompactNumber(value / 1024 / 1024)} MB`
  }
  return `${formatCompactNumber(value)} B`
}

function formatLimitCount(value?: number | null) {
  return value == null ? "不限额" : formatCompactNumber(value)
}

function formatCompactNumber(value: number) {
  return new Intl.NumberFormat(undefined, {
    maximumFractionDigits: value >= 10 ? 1 : 2,
  }).format(value)
}
