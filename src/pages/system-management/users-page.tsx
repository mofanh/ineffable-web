import * as React from "react"
import { ChevronDownIcon, Edit3Icon, GaugeIcon, PackageIcon, SaveIcon, UsersIcon } from "lucide-react"

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
} from "@/components/app"
import { useAuthSession } from "@/features/auth/app-session"
import {
  assignAdminUserPlan,
  listAdminPlans,
  listAdminUserMonthlyUsage,
  listAdminUserPlanAssignments,
  listAdminUsers,
  setAdminUserRole,
  type AdminPlan,
  type AdminUser,
  type AdminUserMonthlyUsage,
  type AdminUserPlanAssignment,
} from "@/lib/api/api-client"
import { normalizeAppError } from "@/lib/app/api-errors"
import { notify } from "@/lib/app/notifications"

import {
  AdminAccessDenied,
  SystemPageShell,
  type LoadState,
} from "./shared"

type UserDetails = {
  assignments: AdminUserPlanAssignment[]
  usage: AdminUserMonthlyUsage[]
}

export function SystemUserManagementPage() {
  const { accessToken, currentUser } = useAuthSession()
  const [users, setUsers] = React.useState<AdminUser[]>([])
  const [plans, setPlans] = React.useState<AdminPlan[]>([])
  const [userDetailsByUserId, setUserDetailsByUserId] = React.useState<
    Record<string, UserDetails>
  >({})
  const [query, setQuery] = React.useState("")
  const [expandedUserIds, setExpandedUserIds] = React.useState<Set<string>>(
    () => new Set()
  )
  const [editingUser, setEditingUser] = React.useState<AdminUser | null>(null)
  const [editingRole, setEditingRole] = React.useState<"user" | "admin">("user")
  const [editingUserPlanId, setEditingUserPlanId] = React.useState("")
  const [dialogOpen, setDialogOpen] = React.useState(false)
  const editingUserIdRef = React.useRef("")
  const [state, setState] = React.useState<LoadState>("idle")
  const [message, setMessage] = React.useState("")
  const [error, setError] = React.useState("")
  const isAdmin = currentUser?.role === "admin"

  const loadUsers = React.useCallback(async () => {
    if (!accessToken || !isAdmin) return
    setState("loading")
    setError("")
    try {
      const [userResult, planResult] = await Promise.all([
        listAdminUsers(accessToken),
        listAdminPlans(accessToken),
      ])
      setUsers(userResult.users)
      setPlans(planResult.plans)
      setEditingUserPlanId((current) =>
        planResult.plans.some((plan) => plan.id === current)
          ? current
          : (planResult.plans[0]?.id ?? ""),
      )
    } catch (loadError) {
      const appError = normalizeAppError(loadError, {
        fallbackMessage: "加载失败",
      })
      setError(appError.message)
      notify.error({
        title: "加载用户失败",
        description: appError.message,
      })
    } finally {
      setState("idle")
    }
  }, [accessToken, isAdmin])

  React.useEffect(() => {
    void loadUsers()
  }, [loadUsers])

  const loadUserDetails = React.useCallback(
    async (userId: string) => {
      if (!accessToken || !isAdmin || !userId) return null
      try {
        const [planResult, usageResult] = await Promise.all([
          listAdminUserPlanAssignments(accessToken, userId),
          listAdminUserMonthlyUsage(accessToken, userId),
        ])
        const details = {
          assignments: planResult.assignments,
          usage: usageResult.usage,
        }
        setUserDetailsByUserId((current) => ({
          ...current,
          [userId]: details,
        }))
        return details
      } catch (loadError) {
        const appError = normalizeAppError(loadError, {
          fallbackMessage: "加载失败",
        })
        setError(appError.message)
        notify.error({
          title: "加载用户明细失败",
          description: appError.message,
        })
        return null
      }
    },
    [accessToken, isAdmin],
  )

  const filteredUsers = React.useMemo(() => {
    const keyword = query.trim().toLowerCase()
    if (!keyword) return users
    return users.filter((user) =>
      `${user.id} ${user.email} ${user.display_name} ${user.role ?? ""} ${user.status}`
        .toLowerCase()
        .includes(keyword),
    )
  }, [query, users])

  const metrics = React.useMemo(
    () => {
      const cachedDetails = Object.values(userDetailsByUserId)
      return [
        {
          label: "Users",
          value: String(users.length),
          detail: `${users.filter((user) => user.role === "admin").length} admins`,
          icon: UsersIcon,
          tone: "blue" as const,
        },
        {
          label: "Assignments",
          value: String(
            cachedDetails.reduce(
              (total, details) => total + details.assignments.length,
              0,
            ),
          ),
          detail: "cached records",
          icon: PackageIcon,
          tone: "green" as const,
        },
        {
          label: "Usage",
          value: String(
            cachedDetails.reduce(
              (total, details) => total + details.usage.length,
              0,
            ),
          ),
          detail: "cached records",
          icon: GaugeIcon,
          tone: "amber" as const,
        },
      ]
    },
    [userDetailsByUserId, users],
  )

  function openEditDialog(user: AdminUser) {
    const cachedDetails = userDetailsByUserId[user.id]
    editingUserIdRef.current = user.id
    setEditingUser(user)
    setEditingRole(user.role === "admin" ? "admin" : "user")
    setEditingUserPlanId(
      getActiveUserPlanId(cachedDetails?.assignments) ?? plans[0]?.id ?? "",
    )
    setDialogOpen(true)

    void loadUserDetails(user.id).then((details) => {
      if (!details) return
      if (editingUserIdRef.current !== user.id) return
      setEditingUserPlanId(
        getActiveUserPlanId(details.assignments) ?? plans[0]?.id ?? "",
      )
    })
  }

  function toggleExpandedUser(userId: string) {
    setExpandedUserIds((current) => {
      const next = current.has(userId) ? new Set<string>() : new Set([userId])
      if (next.has(userId) && !userDetailsByUserId[userId]) {
        void loadUserDetails(userId)
      }
      return next
    })
  }

  async function saveUser(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!accessToken || !editingUser) return
    setState("saving")
    setError("")
    try {
      const roleResult = await setAdminUserRole(accessToken, {
        user_id: editingUser.id,
        role: editingRole,
      })
      setUsers((current) =>
        current.map((item) =>
          item.id === editingUser.id ? roleResult.user : item,
        ),
      )

      if (editingUserPlanId) {
        const planResult = await assignAdminUserPlan(accessToken, {
          user_id: editingUser.id,
          plan_id: editingUserPlanId,
        })
        setUserDetailsByUserId((current) => {
          const details = current[editingUser.id] ?? {
            assignments: [],
            usage: [],
          }
          return {
            ...current,
            [editingUser.id]: {
              ...details,
              assignments: [
                planResult.assignment,
                ...details.assignments.filter(
                  (item) => item.id !== planResult.assignment.id,
                ),
              ],
            },
          }
        })
      }

      setMessage(`用户已保存：${roleResult.user.email}`)
      notify.success({
        title: "用户已保存",
        description: roleResult.user.email,
      })
      setDialogOpen(false)
    } catch (saveError) {
      const appError = normalizeAppError(saveError, {
        fallbackMessage: "保存失败",
      })
      setError(appError.message)
      notify.error({
        title: "保存用户失败",
        description: appError.message,
      })
    } finally {
      setState("idle")
    }
  }

  if (!isAdmin) return <AdminAccessDenied />

  return (
    <SystemPageShell
      title="用户管理"
      subtitle="管理用户角色、套餐分配和月度 token/credit 使用情况。"
      metrics={metrics}
      state={state}
      message={message}
      error={error}
      onRefresh={() => void loadUsers()}
    >
      <AppSectionCard
        title="用户列表"
        description="主视图保持单列表格，用户套餐记录和月度用量通过行内展开查看。"
        icon={UsersIcon}
      >
        <AppListToolbar
          search={
            <AppSearchBar
              value={query}
              onChange={setQuery}
              placeholder="搜索用户..."
            />
          }
          className="-mx-4 -mt-4 mb-4"
        />
        <div className="grid gap-3">
          {filteredUsers.length > 0 ? (
            <DataTableShell>
              <DataTableHeader>
                <tr>
                  <th className="w-12 px-3 py-3 sm:px-4" />
                  <th className="w-auto px-3 py-3 sm:px-4">用户</th>
                  <th className="hidden w-20 px-4 py-3 @xl/table:table-cell">角色</th>
                  <th className="w-20 px-3 py-3 sm:w-24 sm:px-4">状态</th>
                  <th className="hidden w-28 px-4 py-3 @3xl/table:table-cell">套餐记录</th>
                  <th className="hidden w-28 px-4 py-3 @4xl/table:table-cell">本月用量</th>
                  <th className="w-16 px-3 py-3 text-right sm:w-24 sm:px-4">操作</th>
                </tr>
              </DataTableHeader>
              <DataTableBody>
                {filteredUsers.map((user) => {
                  const expanded = expandedUserIds.has(user.id)
                  const userDetails = userDetailsByUserId[user.id]
                  const rowAssignments = userDetails?.assignments ?? []
                  const rowUsage = userDetails?.usage ?? []

                  return (
                    <React.Fragment key={user.id}>
                      <tr className="hover:bg-muted/20">
                        <td className="px-3 py-3 sm:px-4">
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon-sm"
                            aria-label={expanded ? "收起用户详情" : "展开用户详情"}
                            onClick={() => toggleExpandedUser(user.id)}
                          >
                            <ChevronDownIcon
                              className={`size-4 transition-transform ${expanded ? "rotate-180" : ""}`}
                            />
                          </Button>
                        </td>
                        <td className="min-w-0 px-3 py-3 sm:px-4">
                          <div className="truncate font-medium">{user.display_name || user.email}</div>
                          <div className="mt-1 truncate text-xs text-muted-foreground">
                            {user.email}
                          </div>
                        </td>
                        <td className="hidden px-4 py-3 @xl/table:table-cell">
                          <StatusBadge status={user.role ?? "user"} />
                        </td>
                        <td className="px-3 py-3 sm:px-4">
                          <StatusBadge status={user.status} />
                        </td>
                        <td className="hidden px-4 py-3 @3xl/table:table-cell">
                          {userDetails ? rowAssignments.length : "-"}
                        </td>
                        <td className="hidden px-4 py-3 @4xl/table:table-cell">
                          {userDetails ? rowUsage.length : "-"}
                        </td>
                        <td className="px-3 py-3 sm:px-4">
                          <div className="flex justify-end">
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() => openEditDialog(user)}
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
                              {userDetails ? (
                                <UserDetail
                                  assignments={rowAssignments}
                                  usage={rowUsage}
                                  user={user}
                                />
                              ) : (
                                <EmptyState
                                  title="正在加载用户明细"
                                  detail="套餐记录和月度用量返回后会显示在这里。"
                                />
                              )}
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
          {filteredUsers.length === 0 ? (
            <EmptyState title="暂无用户" detail="有用户注册后会出现在这里。" />
          ) : null}
        </div>
      </AppSectionCard>

      <AppDialog
        open={dialogOpen}
        title="编辑用户"
        description="用户基础身份来自账号系统，这里只维护角色和套餐分配。"
        onOpenChange={setDialogOpen}
      >
        {editingUser ? (
          <form onSubmit={(event) => void saveUser(event)} className="space-y-4">
            <AppDisclosureSection title="用户角色和套餐">
              <AppFieldGrid columns={1}>
                <FormField label="用户">
                  <Input value={editingUser.email} readOnly />
                </FormField>
                <FormField label="角色">
                  <select
                    value={editingRole}
                    disabled={state !== "idle"}
                    onChange={(event) =>
                      setEditingRole(
                        event.target.value === "admin" ? "admin" : "user",
                      )
                    }
                    className="h-9 rounded-md border bg-background px-2 text-sm"
                  >
                    <option value="user">user</option>
                    <option value="admin">admin</option>
                  </select>
                </FormField>
                <FormField label="分配套餐">
                  <select
                    value={editingUserPlanId}
                    onChange={(event) =>
                      setEditingUserPlanId(event.target.value)
                    }
                    className="h-9 rounded-md border bg-background px-2 text-sm"
                  >
                    {plans.map((plan) => (
                      <option key={plan.id} value={plan.id}>
                        {plan.display_name}
                      </option>
                    ))}
                  </select>
                </FormField>
              </AppFieldGrid>
            </AppDisclosureSection>
            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setDialogOpen(false)}
              >
                取消
              </Button>
              <Button type="submit" disabled={state !== "idle"}>
                <SaveIcon />
                保存用户
              </Button>
            </div>
          </form>
        ) : null}
      </AppDialog>
    </SystemPageShell>
  )
}

function getActiveUserPlanId(assignments?: AdminUserPlanAssignment[]) {
  return assignments
    ?.filter((assignment) => assignment.status === "active")
    .sort((a, b) => b.effective_from.localeCompare(a.effective_from))[0]?.plan_id
}

function UserDetail({
  assignments,
  usage,
  user,
}: {
  assignments: AdminUserPlanAssignment[]
  usage: AdminUserMonthlyUsage[]
  user: AdminUser
}) {
  return (
    <div className="grid gap-4">
      <div className="grid gap-2">
        <div className="flex items-center gap-2 text-sm font-medium">
          <PackageIcon className="size-4 text-muted-foreground" />
          套餐记录
        </div>
        {assignments.map((assignment) => (
          <div
            key={assignment.id}
            className="rounded-md border border-border bg-background px-3 py-2 text-sm"
          >
            <div className="font-medium">{assignment.plan_id}</div>
            <div className="text-muted-foreground">
              {assignment.status} / {assignment.effective_from}
            </div>
          </div>
        ))}
        {assignments.length === 0 ? (
          <EmptyState
            title="暂无套餐记录"
            detail={`为 ${user.email} 分配套餐后会出现在这里。`}
          />
        ) : null}
      </div>
      <div className="grid gap-2">
        <div className="flex items-center gap-2 text-sm font-medium">
          <GaugeIcon className="size-4 text-muted-foreground" />
          月度用量
        </div>
        {usage.map((item) => (
          <div
            key={item.period_yyyymm}
            className="grid gap-2 rounded-md border border-border bg-background px-3 py-2 text-sm md:grid-cols-[1fr_auto]"
          >
            <div>
              <div className="font-medium">{item.period_yyyymm}</div>
              <div className="text-muted-foreground">
                token {item.raw_total_tokens}
              </div>
            </div>
            <div className="text-right">
              {item.charged_credits.toFixed(4)} credits
            </div>
          </div>
        ))}
        {usage.length === 0 ? (
          <EmptyState
            title="暂无用量记录"
            detail="用户产生 LLM 调用后会按月汇总。"
          />
        ) : null}
      </div>
    </div>
  )
}
