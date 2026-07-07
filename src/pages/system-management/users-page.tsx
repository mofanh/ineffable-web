import * as React from "react"
import { GaugeIcon, PackageIcon, SaveIcon, UsersIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  AppDialog,
  AppSearchBar,
  AppSectionCard,
  EmptyState,
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
  Field,
  SystemPageShell,
  type LoadState,
} from "./shared"

export function SystemUserManagementPage() {
  const { accessToken, currentUser } = useAuthSession()
  const [users, setUsers] = React.useState<AdminUser[]>([])
  const [plans, setPlans] = React.useState<AdminPlan[]>([])
  const [selectedUserId, setSelectedUserId] = React.useState("")
  const [selectedUserPlanId, setSelectedUserPlanId] = React.useState("")
  const [assignments, setAssignments] = React.useState<
    AdminUserPlanAssignment[]
  >([])
  const [usage, setUsage] = React.useState<AdminUserMonthlyUsage[]>([])
  const [query, setQuery] = React.useState("")
  const [editingUser, setEditingUser] = React.useState<AdminUser | null>(null)
  const [editingRole, setEditingRole] = React.useState<"user" | "admin">("user")
  const [dialogOpen, setDialogOpen] = React.useState(false)
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
      setSelectedUserId((current) =>
        userResult.users.some((user) => user.id === current)
          ? current
          : (userResult.users[0]?.id ?? ""),
      )
      setSelectedUserPlanId((current) =>
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

  React.useEffect(() => {
    if (!accessToken || !isAdmin || !selectedUserId) {
      setAssignments([])
      setUsage([])
      return
    }

    let cancelled = false
    void Promise.all([
      listAdminUserPlanAssignments(accessToken, selectedUserId),
      listAdminUserMonthlyUsage(accessToken, selectedUserId),
    ])
      .then(([planResult, usageResult]) => {
        if (!cancelled) {
          setAssignments(planResult.assignments)
          setUsage(usageResult.usage)
        }
      })
      .catch((loadError) => {
        if (!cancelled) {
          const appError = normalizeAppError(loadError, {
            fallbackMessage: "加载失败",
          })
          setError(appError.message)
          notify.error({
            title: "加载用户明细失败",
            description: appError.message,
          })
        }
      })

    return () => {
      cancelled = true
    }
  }, [accessToken, isAdmin, selectedUserId])

  const filteredUsers = React.useMemo(() => {
    const keyword = query.trim().toLowerCase()
    if (!keyword) return users
    return users.filter((user) =>
      `${user.id} ${user.email} ${user.display_name} ${user.role ?? ""} ${user.status}`
        .toLowerCase()
        .includes(keyword),
    )
  }, [query, users])

  const selectedUser = users.find((user) => user.id === selectedUserId)

  const metrics = React.useMemo(
    () => [
      {
        label: "Users",
        value: String(users.length),
        detail: `${users.filter((user) => user.role === "admin").length} admins`,
        icon: UsersIcon,
        tone: "blue" as const,
      },
      {
        label: "Assignments",
        value: String(assignments.length),
        detail: "for selected user",
        icon: PackageIcon,
        tone: "green" as const,
      },
      {
        label: "Usage",
        value: String(usage.length),
        detail: "monthly records",
        icon: GaugeIcon,
        tone: "amber" as const,
      },
    ],
    [assignments.length, usage.length, users],
  )

  function openEditDialog(user: AdminUser) {
    setEditingUser(user)
    setEditingRole(user.role === "admin" ? "admin" : "user")
    setSelectedUserId(user.id)
    setDialogOpen(true)
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

      if (selectedUserPlanId) {
        const planResult = await assignAdminUserPlan(accessToken, {
          user_id: editingUser.id,
          plan_id: selectedUserPlanId,
        })
        setAssignments((current) => [
          planResult.assignment,
          ...current.filter((item) => item.id !== planResult.assignment.id),
        ])
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
      <section className="grid gap-4 xl:grid-cols-[0.95fr_1.05fr]">
        <AppSectionCard
          title="用户列表"
          description="每张卡片代表一个账号。点击编辑可调整角色并分配套餐。"
          icon={UsersIcon}
          actions={
            <div className="hidden w-72 md:block">
              <AppSearchBar
                value={query}
                onChange={setQuery}
                placeholder="搜索用户..."
              />
            </div>
          }
        >
          <div className="mb-3 md:hidden">
            <AppSearchBar value={query} onChange={setQuery} placeholder="搜索用户..." />
          </div>
          <div className="grid gap-3">
            {filteredUsers.map((user) => (
              <div
                key={user.id}
                className={`rounded-md border bg-background/60 p-4 text-sm transition-colors hover:bg-muted/60 ${
                  user.id === selectedUserId ? "border-primary" : "border-border"
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="truncate font-medium">{user.display_name}</div>
                    <div className="mt-1 truncate text-muted-foreground">
                      {user.email}
                    </div>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      <UserTag>{user.role ?? "user"}</UserTag>
                      <UserTag>{user.status}</UserTag>
                    </div>
                  </div>
                </div>
                <div className="mt-4 flex justify-end gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setSelectedUserId(user.id)}
                  >
                    查看
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => openEditDialog(user)}
                  >
                    编辑
                  </Button>
                </div>
              </div>
            ))}
            {filteredUsers.length === 0 ? (
              <EmptyState title="暂无用户" detail="有用户注册后会出现在这里。" />
            ) : null}
          </div>
        </AppSectionCard>

        <div className="grid gap-4">
          <AppSectionCard
            title="套餐记录"
            description={selectedUser?.email ?? "选择一个用户查看套餐记录。"}
            icon={PackageIcon}
          >
            <div className="grid gap-2">
              {assignments.map((assignment) => (
                <div
                  key={assignment.id}
                  className="rounded-md border border-border bg-background/60 px-3 py-2 text-sm"
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
                  detail="为选中用户分配套餐后会出现在这里。"
                />
              ) : null}
            </div>
          </AppSectionCard>

          <AppSectionCard
            title="月度用量"
            description="用于核对用户维度 token 与 credit 消耗。"
            icon={GaugeIcon}
          >
            <div className="grid gap-2">
              {usage.map((item) => (
                <div
                  key={item.period_yyyymm}
                  className="grid gap-2 rounded-md border border-border bg-background/60 px-3 py-2 text-sm md:grid-cols-[1fr_auto]"
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
          </AppSectionCard>
        </div>
      </section>

      <AppDialog
        open={dialogOpen}
        title="编辑用户"
        description="用户基础身份来自账号系统，这里只维护角色和套餐分配。"
        onOpenChange={setDialogOpen}
      >
        {editingUser ? (
          <form onSubmit={(event) => void saveUser(event)} className="space-y-4">
            <div className="grid gap-3">
              <Field label="用户">
                <Input value={editingUser.email} readOnly />
              </Field>
              <Field label="角色">
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
              </Field>
              <Field label="分配套餐">
                <select
                  value={selectedUserPlanId}
                  onChange={(event) => setSelectedUserPlanId(event.target.value)}
                  className="h-9 rounded-md border bg-background px-2 text-sm"
                >
                  {plans.map((plan) => (
                    <option key={plan.id} value={plan.id}>
                      {plan.display_name}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
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

function UserTag({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded-md border bg-background px-2 py-0.5 text-xs text-muted-foreground">
      {children}
    </span>
  )
}
