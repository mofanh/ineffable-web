import * as React from "react"
import { Link, useNavigate, useParams } from "react-router-dom"
import {
  ArrowRightIcon,
  CheckCircle2Icon,
  CopyIcon,
  MailIcon,
  SearchIcon,
  ShieldCheckIcon,
  SparklesIcon,
  Trash2Icon,
  UserPlusIcon,
  UsersIcon,
  XIcon,
} from "lucide-react"

import {
  AppPage,
  AsyncButton,
  DataState,
  DataTableBody,
  DataTableHeader,
  DataTableShell,
  FormField,
  FormSection,
  Notice,
  StatusBadge,
} from "@/components/app"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { useAppSession } from "@/features/auth/app-session"
import {
  acceptWorkspaceInvitationById,
  acceptWorkspaceInvitation,
  createWorkspace,
  getWorkspaceUsage,
  inviteWorkspaceMember,
  listIncomingWorkspaceInvitations,
  listWorkspaceInvitations,
  listWorkspaceMembers,
  removeWorkspaceMember,
  revokeWorkspaceInvitation,
  updateWorkspaceMemberRole,
  type IncomingWorkspaceInvitation,
  type WorkspaceInvitation,
  type WorkspaceMembership,
  type WorkspaceUsage,
} from "@/features/workspace/api/workspace-api"
import { normalizeAppError, type AppError } from "@/lib/app/api-errors"
import { confirm } from "@/lib/app/confirm"
import { notify } from "@/lib/app/notifications"
import { useApiResource } from "@/lib/app/use-api-resource"
import { defaultPath } from "@/routes/navigation"

const roleOptions = ["admin", "member", "viewer"] as const
const purposeOptions = ["Engineering", "Marketing", "Operations", "Research"] as const
const purposeLabels: Record<(typeof purposeOptions)[number], string> = {
  Engineering: "工程研发",
  Marketing: "市场营销",
  Operations: "运营协作",
  Research: "研究分析",
}

function roleLabel(role: string) {
  if (role === "owner") return "所有者"
  if (role === "admin") return "管理员"
  if (role === "member") return "成员"
  if (role === "viewer") return "访客"
  return role
}

function invitationStatusLabel(status: string) {
  if (status === "pending") return "待接受"
  if (status === "accepted") return "已接受"
  if (status === "expired") return "已过期"
  if (status === "revoked") return "已撤销"
  return status
}

function slugify(value: string) {
  const slug = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
  return slug || `team-${Date.now()}`
}

function initials(value: string) {
  const raw = value.trim()
  if (!raw) return "TS"
  const name = raw.includes("@") ? raw.split("@")[0] : raw
  return name
    .split(/[\s._-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("")
    .padEnd(2, "A")
}

export function CreateTeamWorkspacePage() {
  const navigate = useNavigate()
  const { accessToken, refreshAppData, selectWorkspace } = useAppSession()
  const [teamName, setTeamName] = React.useState("")
  const [purpose, setPurpose] =
    React.useState<(typeof purposeOptions)[number]>("Engineering")
  const [memberEmail, setMemberEmail] = React.useState("")
  const [members, setMembers] = React.useState<string[]>([])
  const [error, setError] = React.useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = React.useState(false)

  const addMember = React.useCallback(() => {
    const email = memberEmail.trim().toLowerCase()
    if (!email || !email.includes("@")) {
      setError("请输入有效的邮箱地址。")
      return
    }
    setMembers((current) =>
      current.includes(email) ? current : [...current, email].slice(0, 20)
    )
    setMemberEmail("")
    setError(null)
  }, [memberEmail])

  const submit = React.useCallback(
    async (event: React.FormEvent) => {
      event.preventDefault()
      if (!accessToken) return
      const name = teamName.trim()
      if (!name) {
        setError("请输入团队空间名称。")
        return
      }

      setIsSubmitting(true)
      setError(null)
      try {
        const created = await createWorkspace(accessToken, {
          name,
          slug: slugify(name),
          plan: "free",
          settings_json: { purpose },
        })
        const workspaceId = created.workspace.id
        const inviteBaseUrl = `${window.location.origin}/workspace-invitations`
        await Promise.all(
          members.map((email) =>
            inviteWorkspaceMember(accessToken, workspaceId, {
              email,
              role: "member",
              invite_base_url: inviteBaseUrl,
            })
          )
        )
        await refreshAppData()
        await selectWorkspace(workspaceId)
        notify.success({
          title: "团队空间已创建",
          description: `${name} 已可以开始协作。`,
        })
        navigate(`/team-spaces/${workspaceId}/members`)
      } catch (err) {
        const appError = normalizeAppError(err, {
          fallbackMessage: "创建团队空间失败。",
        })
        setError(appError.message)
        notify.error({
          title: "创建团队空间失败",
          description: appError.message,
        })
      } finally {
        setIsSubmitting(false)
      }
    },
    [accessToken, members, navigate, purpose, refreshAppData, selectWorkspace, teamName]
  )

  return (
    <AppPage
      title="创建团队空间"
      description="为团队文件、成员协作和共享的 AI 工作上下文创建独立空间。"
    >
      <form
        onSubmit={submit}
        className="max-w-2xl space-y-7 rounded-xl border bg-card p-5 sm:p-6"
      >
        <FormField htmlFor="team-workspace-name" label="空间名称">
          <Input
            id="team-workspace-name"
            value={teamName}
            onChange={(event) => setTeamName(event.target.value)}
            placeholder="例如：核心研发团队"
            autoComplete="organization"
            className="h-10"
          />
        </FormField>

        <FormSection title="主要用途" description="用于初始化空间的基础分类。">
          <div className="grid gap-3 sm:grid-cols-2">
            {purposeOptions.map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => setPurpose(option)}
                className={[
                  "flex h-14 items-center gap-3 rounded-lg border px-4 text-left text-sm transition-colors",
                  purpose === option
                    ? "border-foreground bg-muted text-foreground"
                    : "border-border bg-muted/35 text-muted-foreground hover:bg-muted/60",
                ].join(" ")}
              >
                <span
                  className={[
                    "size-4 rounded-full border",
                    purpose === option ? "border-4 border-foreground" : "border-border",
                  ].join(" ")}
                />
                {purposeLabels[option]}
              </button>
            ))}
          </div>
        </FormSection>

        <FormSection>
          <div className="flex items-center justify-between gap-3">
            <label className="text-xs font-semibold uppercase tracking-normal text-foreground">
              初始成员（可选）
            </label>
            <span className="font-mono text-[11px] text-muted-foreground">
              {members.length}/20 人
            </span>
          </div>
          <div className="flex gap-2">
            <Input
              value={memberEmail}
              onChange={(event) => setMemberEmail(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault()
                  addMember()
                }
              }}
              placeholder="输入成员邮箱"
              type="email"
              className="h-11 bg-muted/40"
            />
            <Button
              type="button"
              onClick={addMember}
              variant="secondary"
              className="h-11 px-5"
            >
              添加
            </Button>
          </div>
          <div className="space-y-2">
            {members.map((email) => (
              <div
                key={email}
                className="flex items-center justify-between rounded-lg border border-border bg-muted/35 p-3"
              >
                <div className="flex min-w-0 items-center gap-3">
                  <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-indigo-500 text-xs font-bold text-white">
                    {initials(email)}
                  </div>
                  <span className="truncate text-sm">{email}</span>
                </div>
                <Button
                  type="button"
                  onClick={() =>
                    setMembers((current) => current.filter((item) => item !== email))
                  }
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`移除 ${email}`}
                >
                  <XIcon className="size-4" />
                </Button>
              </div>
            ))}
          </div>
        </FormSection>

        {error ? <Notice tone="error">{error}</Notice> : null}

        <div className="flex justify-end gap-3 border-t border-border pt-6">
          <Button
            type="button"
            onClick={() => navigate(-1)}
            variant="ghost"
          >
            取消
          </Button>
          <AsyncButton
            type="submit"
            isLoading={isSubmitting}
            loadingLabel="创建中..."
            className="px-8"
          >
            创建团队空间
          </AsyncButton>
        </div>
      </form>
    </AppPage>
  )
}

export function TeamWorkspaceMembersPage() {
  const { workspaceId } = useParams()
  const { accessToken, currentWorkspace } = useAppSession()
  const [query, setQuery] = React.useState("")
  const [inviteEmail, setInviteEmail] = React.useState("")
  const [inviteRole, setInviteRole] = React.useState("member")
  const [lastInviteUrl, setLastInviteUrl] = React.useState<string | null>(null)
  const [actionError, setActionError] = React.useState<AppError | null>(null)

  const targetWorkspaceId = workspaceId || currentWorkspace?.id || ""

  const loadMemberResource = React.useCallback(async () => {
    if (!accessToken || !targetWorkspaceId) {
      return {
        members: [] as WorkspaceMembership[],
        invitations: [] as WorkspaceInvitation[],
        usage: null as WorkspaceUsage | null,
      }
    }

    const [memberResponse, invitationResponse, usageResponse] = await Promise.all([
      listWorkspaceMembers(accessToken, targetWorkspaceId),
      listWorkspaceInvitations(accessToken, targetWorkspaceId),
      getWorkspaceUsage(accessToken, targetWorkspaceId),
    ])
    return {
      members: memberResponse.members,
      invitations: invitationResponse.invitations,
      usage: usageResponse.usage,
    }
  }, [accessToken, targetWorkspaceId])
  const memberResource = useApiResource({
    enabled: Boolean(accessToken && targetWorkspaceId),
    load: loadMemberResource,
    errorMessage: "Failed to load workspace members.",
  })
  const {
    data: memberData,
    error: memberLoadError,
    reload: reloadMembers,
    state: memberState,
  } = memberResource
  const members = memberData?.members ?? []
  const invitations = memberData?.invitations ?? []
  const usage = memberData?.usage ?? null

  const submitInvite = React.useCallback(
    async (event: React.FormEvent) => {
      event.preventDefault()
      if (!accessToken || !targetWorkspaceId) return
      setActionError(null)
      try {
        const response = await inviteWorkspaceMember(accessToken, targetWorkspaceId, {
          email: inviteEmail,
          role: inviteRole,
          invite_base_url: `${window.location.origin}/workspace-invitations`,
        })
        setLastInviteUrl(response.invite_url)
        setInviteEmail("")
        await reloadMembers()
        notify.success({
          title: "Invitation sent",
          description: `Invite sent to ${inviteEmail}.`,
        })
      } catch (err) {
        const appError = normalizeAppError(err, {
          fallbackMessage: "Invite failed.",
        })
        setActionError(appError)
        notify.error({
          title: "Invite failed",
          description: appError.message,
        })
      }
    },
    [accessToken, inviteEmail, inviteRole, reloadMembers, targetWorkspaceId]
  )

  const updateMemberRole = React.useCallback(
    async (member: WorkspaceMembership, role: string) => {
      if (!accessToken || !targetWorkspaceId) return
      setActionError(null)
      try {
        await updateWorkspaceMemberRole(
          accessToken,
          targetWorkspaceId,
          member.user_id,
          role
        )
        await reloadMembers()
        notify.success({
          title: "Role updated",
          description: `Member role changed to ${role}.`,
        })
      } catch (err) {
        const appError = normalizeAppError(err, {
          fallbackMessage: "Failed to update member role.",
        })
        setActionError(appError)
        notify.error({
          title: "Role update failed",
          description: appError.message,
        })
      }
    },
    [accessToken, reloadMembers, targetWorkspaceId]
  )

  const removeMember = React.useCallback(
    async (member: WorkspaceMembership) => {
      if (!accessToken || !targetWorkspaceId) return
      const confirmed = await confirm({
        title: "Remove workspace member?",
        description: "This member will lose access to the team workspace.",
        confirmLabel: "Remove",
        variant: "destructive",
      })
      if (!confirmed) return

      setActionError(null)
      try {
        await removeWorkspaceMember(accessToken, targetWorkspaceId, member.user_id)
        await reloadMembers()
        notify.success({ title: "Member removed" })
      } catch (err) {
        const appError = normalizeAppError(err, {
          fallbackMessage: "Failed to remove member.",
        })
        setActionError(appError)
        notify.error({
          title: "Remove member failed",
          description: appError.message,
        })
      }
    },
    [accessToken, reloadMembers, targetWorkspaceId]
  )

  const revokeInvitation = React.useCallback(
    async (invitation: WorkspaceInvitation) => {
      if (!accessToken || !targetWorkspaceId) return
      const confirmed = await confirm({
        title: "Revoke invitation?",
        description: `The invitation for ${invitation.email} will stop working.`,
        confirmLabel: "Revoke",
        variant: "destructive",
      })
      if (!confirmed) return

      setActionError(null)
      try {
        await revokeWorkspaceInvitation(
          accessToken,
          targetWorkspaceId,
          invitation.id
        )
        await reloadMembers()
        notify.success({ title: "Invitation revoked" })
      } catch (err) {
        const appError = normalizeAppError(err, {
          fallbackMessage: "Failed to revoke invitation.",
        })
        setActionError(appError)
        notify.error({
          title: "Revoke invitation failed",
          description: appError.message,
        })
      }
    },
    [accessToken, reloadMembers, targetWorkspaceId]
  )

  const filteredMembers = members.filter((member) => {
    const needle = query.trim().toLowerCase()
    return (
      !needle ||
      member.user_id.toLowerCase().includes(needle) ||
      member.role.toLowerCase().includes(needle)
    )
  })
  const pendingInvitations = invitations.filter((item) => item.status === "pending")
  return (
    <AppPage
      title="Team Workspace Members"
      description="Manage access for collaborators and keep pending invitations visible while Team Workspace work is shared across users."
    >
      <div className="grid gap-px overflow-hidden rounded-lg border border-border bg-border sm:grid-cols-5">
        <Metric label="Total Seats" value={`${members.length}`} suffix="/ 50" />
        <Metric label="Active Now" value={String(Math.min(members.length, 12))} />
        <Metric label="Pending Invites" value={String(pendingInvitations.length)} />
        <Metric
          label="Storage"
          value={formatWorkspaceStorage(usage)}
          suffix={formatWorkspaceStorageSuffix(usage)}
          compact
        />
        <Metric label="Workspace" value={currentWorkspace?.name || "Team"} compact />
      </div>

      <form
        onSubmit={submitInvite}
        className="flex flex-col gap-3 rounded-lg border border-border bg-muted/20 p-4 sm:flex-row"
      >
        <Input
          value={inviteEmail}
          onChange={(event) => setInviteEmail(event.target.value)}
          placeholder="Invite by email..."
          type="email"
          className="h-11 bg-muted/40 sm:flex-1"
        />
        <select
          value={inviteRole}
          onChange={(event) => setInviteRole(event.target.value)}
          className="h-11 rounded-lg border border-border bg-muted/40 px-3 text-sm outline-none"
        >
          {roleOptions.map((role) => (
            <option key={role} value={role}>
              {role}
            </option>
          ))}
        </select>
        <Button className="h-11 gap-2 px-5">
          <UserPlusIcon className="size-4" />
          Invite
        </Button>
      </form>

      {lastInviteUrl ? (
        <Button
          type="button"
          variant="outline"
          onClick={() => {
            void navigator.clipboard?.writeText(lastInviteUrl)
            notify.info({ title: "Invite link copied" })
          }}
          className="flex h-auto w-full justify-between px-4 py-3 text-left"
        >
          <span className="truncate text-muted-foreground">{lastInviteUrl}</span>
          <CopyIcon className="ml-3 size-4 shrink-0" />
        </Button>
      ) : null}

      {actionError ? <Notice tone="error">{actionError.message}</Notice> : null}

      <section className="overflow-hidden rounded-lg border border-border">
        <div className="flex items-center justify-between border-b border-border bg-muted/25 p-4">
          <h2 className="text-base font-semibold">Current Members</h2>
          <div className="relative">
            <SearchIcon className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              className="h-9 w-64 bg-background pl-9"
              placeholder="Search members..."
            />
          </div>
        </div>
        <div className="p-4">
          <DataState
            state={memberState}
            error={memberLoadError}
            empty={filteredMembers.length === 0}
            emptyTitle="No members found."
            onRetry={() => void reloadMembers()}
          >
            <DataTableShell>
              <DataTableHeader>
                <tr>
                  <th className="px-4 py-3">Member</th>
                  <th className="px-4 py-3">Role</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Joined</th>
                  <th className="px-4 py-3" />
                </tr>
              </DataTableHeader>
              <DataTableBody>
                {filteredMembers.map((member) => (
                  <tr key={member.id} className="hover:bg-muted/20">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className="flex size-8 items-center justify-center rounded-full bg-amber-500 text-xs font-bold text-black">
                          {initials(member.user_id)}
                        </div>
                        <div>
                          <div className="font-medium">{member.user_id.slice(0, 8)}</div>
                          <div className="text-[11px] text-muted-foreground">
                            {member.user_id}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <select
                        value={member.role}
                        onChange={(event) => {
                          void updateMemberRole(member, event.target.value)
                        }}
                        className="h-8 w-32 rounded border border-border bg-background px-2 text-sm"
                      >
                        {["owner", ...roleOptions].map((role) => (
                          <option key={role} value={role}>
                            {role}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge status={member.status} />
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {new Date(member.joined_at).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        onClick={() => void removeMember(member)}
                        aria-label={`Remove ${member.user_id}`}
                      >
                        <Trash2Icon className="size-4" />
                      </Button>
                    </td>
                  </tr>
                ))}
              </DataTableBody>
            </DataTableShell>
          </DataState>
        </div>
      </section>

      <section className="overflow-hidden rounded-lg border border-border">
        <div className="flex items-center justify-between border-b border-border bg-muted/25 p-4">
          <h2 className="text-base font-semibold">Pending Invitations</h2>
          <span className="rounded bg-muted px-2 py-0.5 text-[10px] font-bold text-muted-foreground">
            {pendingInvitations.length} UNRESOLVED
          </span>
        </div>
        <div className="p-4">
          <DataState
            state={memberState}
            error={memberLoadError}
            empty={invitations.length === 0}
            emptyTitle="No invitations yet."
            onRetry={() => void reloadMembers()}
          >
            <div className="divide-y divide-border overflow-hidden rounded-md border border-border">
              {invitations.map((invitation) => (
                <div
                  key={invitation.id}
                  className="grid gap-3 px-4 py-3 text-sm sm:grid-cols-[1fr_120px_120px_130px_auto]"
                >
                  <div>
                    <div className="font-medium">{invitation.email}</div>
                    <div className="text-[11px] text-muted-foreground">
                      Invited by {invitation.invited_by.slice(0, 8)}
                    </div>
                  </div>
                  <div>{invitation.role}</div>
                  <StatusBadge status={invitation.status} />
                  <div className="text-muted-foreground">
                    {new Date(invitation.expires_at).toLocaleDateString()}
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => void revokeInvitation(invitation)}
                  >
                    Revoke
                  </Button>
                </div>
              ))}
            </div>
          </DataState>
        </div>
      </section>
    </AppPage>
  )
}

function Metric({
  label,
  value,
  suffix,
  compact,
}: {
  label: string
  value: string
  suffix?: string
  compact?: boolean
}) {
  return (
    <div className="bg-background p-5">
      <div className="text-xs font-medium text-muted-foreground">{label}</div>
      <div className={compact ? "mt-1 truncate text-lg font-semibold" : "mt-1 text-2xl font-semibold"}>
        {value}
        {suffix ? (
          <span className="ml-1 text-sm font-normal text-muted-foreground">{suffix}</span>
        ) : null}
      </div>
    </div>
  )
}

function formatWorkspaceStorage(usage: WorkspaceUsage | null) {
  if (!usage) return "-"
  if (usage.storage_limit_bytes && usage.storage_limit_bytes > 0) {
    const ratio =
      usage.storage_usage_ratio == null
        ? usage.storage_bytes / usage.storage_limit_bytes
        : usage.storage_usage_ratio
    return `${Math.round(ratio * 100)}%`
  }
  return formatBytes(usage.storage_bytes)
}

function formatWorkspaceStorageSuffix(usage: WorkspaceUsage | null) {
  if (!usage) return undefined
  const recalculated = formatUsageRecalculatedAt(usage)
  if (usage.storage_limit_bytes && usage.storage_limit_bytes > 0) {
    return `${formatBytes(usage.storage_bytes)} / ${formatBytes(usage.storage_limit_bytes)}${recalculated}`
  }
  return `used${recalculated}`
}

function formatUsageRecalculatedAt(usage: WorkspaceUsage) {
  if (!usage.recalculated_at) return ""
  const date = new Date(usage.recalculated_at)
  if (Number.isNaN(date.getTime())) return ""
  return ` · ${date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })}`
}

function formatBytes(value: number) {
  if (value >= 1024 * 1024 * 1024) {
    return `${formatMetricNumber(value / 1024 / 1024 / 1024)} GB`
  }
  if (value >= 1024 * 1024) {
    return `${formatMetricNumber(value / 1024 / 1024)} MB`
  }
  if (value >= 1024) {
    return `${formatMetricNumber(value / 1024)} KB`
  }
  return `${formatMetricNumber(value)} B`
}

function formatMetricNumber(value: number) {
  return new Intl.NumberFormat(undefined, {
    maximumFractionDigits: value >= 10 ? 1 : 2,
  }).format(value)
}

export function WorkspaceNotificationsPage() {
  const navigate = useNavigate()
  const { accessToken, refreshAppData, selectWorkspace } = useAppSession()
  const [actionError, setActionError] = React.useState<AppError | null>(null)
  const [acceptingId, setAcceptingId] = React.useState<string | null>(null)

  const loadInvitations = React.useCallback(async () => {
    if (!accessToken) return { invitations: [] }
    return listIncomingWorkspaceInvitations(accessToken)
  }, [accessToken])
  const invitationsResource = useApiResource({
    enabled: Boolean(accessToken),
    load: loadInvitations,
    errorMessage: "加载团队邀请失败。",
  })
  const {
    data: invitationsData,
    error: invitationsError,
    reload: reloadInvitations,
    state: invitationsState,
  } = invitationsResource
  const items = invitationsData?.invitations ?? []

  const acceptInvitation = React.useCallback(
    async (item: IncomingWorkspaceInvitation) => {
      if (!accessToken) return

      setAcceptingId(item.invitation.id)
      setActionError(null)
      try {
        const response = await acceptWorkspaceInvitationById(
          accessToken,
          item.invitation.id
        )
        await refreshAppData()
        await selectWorkspace(response.workspace.id)
        await reloadInvitations()
        notify.success({
          title: "已加入团队空间",
          description: `你现在可以访问 ${response.workspace.name}。`,
        })
        navigate(`/team-spaces/${response.workspace.id}/members`)
      } catch (err) {
        const appError = normalizeAppError(err, {
          fallbackMessage: "接受邀请失败。",
        })
        setActionError(appError)
        notify.error({
          title: "接受邀请失败",
          description: appError.message,
        })
      } finally {
        setAcceptingId(null)
      }
    },
    [accessToken, navigate, refreshAppData, reloadInvitations, selectWorkspace]
  )

  return (
    <AppPage
      title="通知"
      description="查看发送到当前账号的团队空间邀请。"
    >
      {actionError ? <Notice tone="error">{actionError.message}</Notice> : null}

      <section className="overflow-hidden rounded-lg border border-border">
        <div className="flex items-center justify-between border-b border-border bg-muted/25 p-4">
          <h2 className="text-base font-semibold">团队空间邀请</h2>
          <span className="rounded bg-muted px-2 py-0.5 text-[10px] font-bold text-muted-foreground">
            {items.length} 条待处理
          </span>
        </div>
        <div className="p-4">
          <DataState
            state={invitationsState}
            error={invitationsError}
            empty={items.length === 0}
            emptyTitle="没有待处理的团队邀请"
            emptyDescription="新的团队空间邀请会出现在这里。"
            onRetry={() => void reloadInvitations()}
          >
            <div className="divide-y divide-border overflow-hidden rounded-md border border-border">
              {items.map((item) => (
                <div
                  key={item.invitation.id}
                  className="grid gap-4 px-4 py-4 text-sm sm:grid-cols-[1fr_140px_140px_auto]"
                >
                  <div className="min-w-0">
                    <div className="truncate font-medium">{item.workspace.name}</div>
                    <div className="mt-1 truncate text-xs text-muted-foreground">
                      邀请角色：{roleLabel(item.invitation.role)} · {item.invitation.email}
                    </div>
                  </div>
                  <StatusBadge
                    status={item.invitation.status}
                    label={invitationStatusLabel(item.invitation.status)}
                  />
                  <div className="text-muted-foreground">
                    有效期至 {new Date(item.invitation.expires_at).toLocaleDateString("zh-CN")}
                  </div>
                  <AsyncButton
                    type="button"
                    onClick={() => void acceptInvitation(item)}
                    isLoading={acceptingId === item.invitation.id}
                    loadingLabel="接受中..."
                  >
                    接受邀请
                  </AsyncButton>
                </div>
              ))}
            </div>
          </DataState>
        </div>
      </section>
    </AppPage>
  )
}

export function AcceptWorkspaceInvitationPage() {
  const { token } = useParams()
  const navigate = useNavigate()
  const { accessToken, refreshAppData, selectWorkspace } = useAppSession()
  const [status, setStatus] = React.useState<"idle" | "accepting" | "accepted" | "error">("idle")
  const [error, setError] = React.useState<string | null>(null)
  const [workspaceName, setWorkspaceName] = React.useState("团队空间")

  const accept = React.useCallback(async () => {
    if (!accessToken || !token) return
    setStatus("accepting")
    setError(null)
    try {
      const response = await acceptWorkspaceInvitation(accessToken, token)
      setWorkspaceName(response.workspace.name)
      await refreshAppData()
      await selectWorkspace(response.workspace.id)
      setStatus("accepted")
      notify.success({
        title: "邀请已接受",
        description: `你现在可以访问 ${response.workspace.name}。`,
      })
    } catch (err) {
      setStatus("error")
      const appError = normalizeAppError(err, {
        fallbackMessage: "接受邀请失败。",
      })
      setError(appError.message)
      notify.error({
        title: "接受邀请失败",
        description: appError.message,
      })
    }
  }, [accessToken, refreshAppData, selectWorkspace, token])

  return (
    <AppPage
      title="团队邀请"
      description="接受邀请后，你和 Agent 都可以在该团队空间的权限范围内继续工作。"
    >
      <div className="mx-auto max-w-xl rounded-2xl border bg-card p-6 shadow-sm sm:p-8">
        <div className="flex flex-col items-center text-center">
          <div className="flex size-20 items-center justify-center rounded-full border border-border bg-muted">
            {status === "accepted" ? (
              <CheckCircle2Icon className="size-10 text-emerald-400" />
            ) : (
              <MailIcon className="size-10 text-muted-foreground" />
            )}
          </div>
          <p className="mt-6 text-xs font-semibold uppercase tracking-normal text-muted-foreground">
            Team Workspace
          </p>
          <h1 className="mt-2 text-2xl font-semibold">
            {status === "accepted"
              ? `已加入 ${workspaceName}`
              : "你收到了一份团队空间邀请"}
          </h1>
          <p className="mt-3 text-sm leading-6 text-muted-foreground">
            加入后可以访问团队共享文件、成员协作信息，并让 Agent 在该空间上下文中继续任务。
          </p>
        </div>

        <div className="mt-8 grid gap-3">
          <AccessRow
            icon={<ShieldCheckIcon className="size-5" />}
            title="空间权限"
            description="按邀请角色访问团队空间。"
          />
          <AccessRow
            icon={<SparklesIcon className="size-5" />}
            title="Agent 上下文"
            description="在共享文件范围内延续 AI 任务。"
          />
          <AccessRow
            icon={<UsersIcon className="size-5" />}
            title="团队协作"
            description="与空间成员共同维护项目内容。"
          />
        </div>

        {error ? (
          <Notice tone="error" className="mt-5">
            {error}
          </Notice>
        ) : null}

        <div className="mt-8 space-y-3">
          {status === "accepted" ? (
            <Button
              type="button"
              onClick={() => navigate(defaultPath)}
              className="h-12 w-full gap-2"
            >
              进入工作台
              <ArrowRightIcon className="size-4" />
            </Button>
          ) : (
            <AsyncButton
              type="button"
              onClick={accept}
              isLoading={status === "accepting"}
              loadingLabel="接受中..."
              className="h-12 w-full gap-2"
            >
              接受邀请
              <ArrowRightIcon className="size-4" />
            </AsyncButton>
          )}
          <Button asChild variant="ghost" className="h-11 w-full">
            <Link to={defaultPath}>稍后处理</Link>
          </Button>
        </div>
      </div>
    </AppPage>
  )
}

function AccessRow({
  icon,
  title,
  description,
}: {
  icon: React.ReactNode
  title: string
  description: string
}) {
  return (
    <div className="flex items-center gap-3 rounded-lg border border-border bg-background/60 p-4">
      <div className="flex size-9 items-center justify-center rounded bg-muted text-muted-foreground">
        {icon}
      </div>
      <div>
        <div className="text-sm font-semibold">{title}</div>
        <div className="text-xs text-muted-foreground">{description}</div>
      </div>
    </div>
  )
}
