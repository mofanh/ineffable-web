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

import { useAppSession } from "@/features/auth/app-session"
import {
  acceptWorkspaceInvitationById,
  acceptWorkspaceInvitation,
  createWorkspace,
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
} from "@/features/workspace/api/workspace-api"

const roleOptions = ["admin", "member", "viewer"] as const
const purposeOptions = ["Engineering", "Marketing", "Operations", "Research"] as const

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

function PageShell({
  title,
  description,
  children,
}: {
  title: string
  description: string
  children: React.ReactNode
}) {
  return (
    <main className="flex min-h-full flex-col overflow-y-auto bg-background px-6 py-8">
      <div className="mx-auto w-full max-w-5xl space-y-8">
        <div className="space-y-2">
          <h1 className="text-2xl font-semibold text-foreground">{title}</h1>
          <p className="max-w-2xl text-sm leading-6 text-muted-foreground">
            {description}
          </p>
        </div>
        {children}
      </div>
    </main>
  )
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <label className="text-xs font-semibold uppercase tracking-normal text-foreground">
      {children}
    </label>
  )
}

function TextInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={[
        "h-11 w-full rounded-lg border border-border bg-muted/40 px-3 text-sm outline-none",
        "transition-colors placeholder:text-muted-foreground/55 focus:border-foreground",
        props.className,
      ]
        .filter(Boolean)
        .join(" ")}
    />
  )
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
      setError("Enter a valid email address.")
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
        setError("Team name is required.")
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
        navigate(`/team-spaces/${workspaceId}/members`)
      } catch (err) {
        setError(err instanceof Error ? err.message : "Create workspace failed.")
      } finally {
        setIsSubmitting(false)
      }
    },
    [accessToken, members, navigate, purpose, refreshAppData, selectWorkspace, teamName]
  )

  return (
    <PageShell
      title="Create Team Workspace"
      description="Initialize a shared environment for collaborators, team memory, workspace artifacts, and future AI teammate configuration."
    >
      <form onSubmit={submit} className="max-w-2xl space-y-8">
        <div className="space-y-2">
          <FieldLabel>Team Name</FieldLabel>
          <TextInput
            value={teamName}
            onChange={(event) => setTeamName(event.target.value)}
            placeholder="e.g. Core Engineering"
          />
        </div>

        <div className="space-y-3">
          <FieldLabel>Primary Purpose</FieldLabel>
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
                {option}
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-4">
          <div className="flex items-center justify-between gap-3">
            <FieldLabel>Initial Members</FieldLabel>
            <span className="font-mono text-[11px] text-muted-foreground">
              {members.length}/20 USERS
            </span>
          </div>
          <div className="flex gap-2">
            <TextInput
              value={memberEmail}
              onChange={(event) => setMemberEmail(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault()
                  addMember()
                }
              }}
              placeholder="Invite by email..."
              type="email"
            />
            <button
              type="button"
              onClick={addMember}
              className="h-11 rounded-lg bg-muted px-5 text-sm font-semibold text-foreground hover:bg-muted/80"
            >
              Add
            </button>
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
                <button
                  type="button"
                  onClick={() =>
                    setMembers((current) => current.filter((item) => item !== email))
                  }
                  className="text-muted-foreground hover:text-foreground"
                  aria-label={`Remove ${email}`}
                >
                  <XIcon className="size-4" />
                </button>
              </div>
            ))}
          </div>
        </div>

        {error ? <p className="text-sm text-destructive">{error}</p> : null}

        <div className="flex justify-end gap-3 border-t border-border pt-6">
          <button
            type="button"
            onClick={() => navigate(-1)}
            className="h-10 px-5 text-sm font-semibold text-muted-foreground hover:text-foreground"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={isSubmitting}
            className="h-10 rounded-lg bg-foreground px-8 text-sm font-semibold text-background disabled:opacity-60"
          >
            {isSubmitting ? "Creating..." : "Create Workspace"}
          </button>
        </div>
      </form>
    </PageShell>
  )
}

export function TeamWorkspaceMembersPage() {
  const { workspaceId } = useParams()
  const { accessToken, currentWorkspace } = useAppSession()
  const [members, setMembers] = React.useState<WorkspaceMembership[]>([])
  const [invitations, setInvitations] = React.useState<WorkspaceInvitation[]>([])
  const [query, setQuery] = React.useState("")
  const [inviteEmail, setInviteEmail] = React.useState("")
  const [inviteRole, setInviteRole] = React.useState("member")
  const [lastInviteUrl, setLastInviteUrl] = React.useState<string | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  const [isLoading, setIsLoading] = React.useState(false)

  const targetWorkspaceId = workspaceId || currentWorkspace?.id || ""

  const load = React.useCallback(async () => {
    if (!accessToken || !targetWorkspaceId) return
    setIsLoading(true)
    setError(null)
    try {
      const [memberResponse, invitationResponse] = await Promise.all([
        listWorkspaceMembers(accessToken, targetWorkspaceId),
        listWorkspaceInvitations(accessToken, targetWorkspaceId),
      ])
      setMembers(memberResponse.members)
      setInvitations(invitationResponse.invitations)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load workspace members.")
    } finally {
      setIsLoading(false)
    }
  }, [accessToken, targetWorkspaceId])

  React.useEffect(() => {
    void load()
  }, [load])

  const submitInvite = React.useCallback(
    async (event: React.FormEvent) => {
      event.preventDefault()
      if (!accessToken || !targetWorkspaceId) return
      setError(null)
      try {
        const response = await inviteWorkspaceMember(accessToken, targetWorkspaceId, {
          email: inviteEmail,
          role: inviteRole,
          invite_base_url: `${window.location.origin}/workspace-invitations`,
        })
        setLastInviteUrl(response.invite_url)
        setInviteEmail("")
        await load()
      } catch (err) {
        setError(err instanceof Error ? err.message : "Invite failed.")
      }
    },
    [accessToken, inviteEmail, inviteRole, load, targetWorkspaceId]
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
    <PageShell
      title="Team Workspace Members"
      description="Manage access for collaborators and keep pending invitations visible while Team Workspace work is shared across users."
    >
      <div className="grid gap-px overflow-hidden rounded-lg border border-border bg-border sm:grid-cols-4">
        <Metric label="Total Seats" value={`${members.length}`} suffix="/ 50" />
        <Metric label="Active Now" value={String(Math.min(members.length, 12))} />
        <Metric label="Pending Invites" value={String(pendingInvitations.length)} />
        <Metric label="Workspace" value={currentWorkspace?.name || "Team"} compact />
      </div>

      <form
        onSubmit={submitInvite}
        className="flex flex-col gap-3 rounded-lg border border-border bg-muted/20 p-4 sm:flex-row"
      >
        <TextInput
          value={inviteEmail}
          onChange={(event) => setInviteEmail(event.target.value)}
          placeholder="Invite by email..."
          type="email"
          className="sm:flex-1"
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
        <button className="inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-foreground px-5 text-sm font-semibold text-background">
          <UserPlusIcon className="size-4" />
          Invite
        </button>
      </form>

      {lastInviteUrl ? (
        <button
          type="button"
          onClick={() => navigator.clipboard?.writeText(lastInviteUrl)}
          className="flex w-full items-center justify-between rounded-lg border border-border bg-muted/20 px-4 py-3 text-left text-sm"
        >
          <span className="truncate text-muted-foreground">{lastInviteUrl}</span>
          <CopyIcon className="ml-3 size-4 shrink-0" />
        </button>
      ) : null}

      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      <section className="overflow-hidden rounded-lg border border-border">
        <div className="flex items-center justify-between border-b border-border bg-muted/25 p-4">
          <h2 className="text-base font-semibold">Current Members</h2>
          <div className="relative">
            <SearchIcon className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              className="h-9 w-64 rounded border border-border bg-background pl-9 pr-3 text-sm outline-none"
              placeholder="Search members..."
            />
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-border bg-muted/20 text-[10px] uppercase text-muted-foreground">
              <tr>
                <th className="px-4 py-3">Member</th>
                <th className="px-4 py-3">Role</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Joined</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filteredMembers.map((member) => (
                <tr key={member.id} className="hover:bg-muted/20">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <div className="flex size-8 items-center justify-center rounded-full bg-amber-500 text-xs font-bold text-black">
                        {initials(member.user_id)}
                      </div>
                      <div>
                        <div className="font-medium">{member.user_id.slice(0, 8)}</div>
                        <div className="text-[11px] text-muted-foreground">{member.user_id}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <select
                      value={member.role}
                      onChange={async (event) => {
                        if (!accessToken || !targetWorkspaceId) return
                        await updateWorkspaceMemberRole(
                          accessToken,
                          targetWorkspaceId,
                          member.user_id,
                          event.target.value
                        )
                        await load()
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
                    <button
                      type="button"
                      onClick={async () => {
                        if (!accessToken || !targetWorkspaceId) return
                        await removeWorkspaceMember(accessToken, targetWorkspaceId, member.user_id)
                        await load()
                      }}
                      className="text-muted-foreground hover:text-destructive"
                    >
                      <Trash2Icon className="size-4" />
                    </button>
                  </td>
                </tr>
              ))}
              {!filteredMembers.length ? (
                <tr>
                  <td colSpan={5} className="px-4 py-6 text-muted-foreground">
                    {isLoading ? "Loading..." : "No members found."}
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>

      <section className="overflow-hidden rounded-lg border border-border">
        <div className="flex items-center justify-between border-b border-border bg-muted/25 p-4">
          <h2 className="text-base font-semibold">Pending Invitations</h2>
          <span className="rounded bg-muted px-2 py-0.5 text-[10px] font-bold text-muted-foreground">
            {pendingInvitations.length} UNRESOLVED
          </span>
        </div>
        <div className="divide-y divide-border">
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
              <button
                type="button"
                onClick={async () => {
                  if (!accessToken || !targetWorkspaceId) return
                  await revokeWorkspaceInvitation(accessToken, targetWorkspaceId, invitation.id)
                  await load()
                }}
                className="text-xs font-semibold uppercase text-muted-foreground hover:text-destructive"
              >
                Revoke
              </button>
            </div>
          ))}
          {!invitations.length ? (
            <div className="px-4 py-6 text-sm text-muted-foreground">
              No invitations yet.
            </div>
          ) : null}
        </div>
      </section>
    </PageShell>
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

function StatusBadge({ status }: { status: string }) {
  const color =
    status === "active" || status === "accepted"
      ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-400"
      : status === "pending"
        ? "border-orange-500/20 bg-orange-500/10 text-orange-400"
        : "border-destructive/20 bg-destructive/10 text-destructive"
  return (
    <span className={`inline-flex w-fit rounded border px-2 py-0.5 text-[10px] font-bold uppercase ${color}`}>
      {status}
    </span>
  )
}

export function WorkspaceNotificationsPage() {
  const navigate = useNavigate()
  const { accessToken, refreshAppData, selectWorkspace } = useAppSession()
  const [items, setItems] = React.useState<IncomingWorkspaceInvitation[]>([])
  const [error, setError] = React.useState<string | null>(null)
  const [isLoading, setIsLoading] = React.useState(false)
  const [acceptingId, setAcceptingId] = React.useState<string | null>(null)

  const load = React.useCallback(async () => {
    if (!accessToken) {
      setItems([])
      return
    }

    setIsLoading(true)
    setError(null)
    try {
      const response = await listIncomingWorkspaceInvitations(accessToken)
      setItems(response.invitations)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load notifications.")
    } finally {
      setIsLoading(false)
    }
  }, [accessToken])

  React.useEffect(() => {
    void load()
  }, [load])

  const acceptInvitation = React.useCallback(
    async (item: IncomingWorkspaceInvitation) => {
      if (!accessToken) return

      setAcceptingId(item.invitation.id)
      setError(null)
      try {
        const response = await acceptWorkspaceInvitationById(
          accessToken,
          item.invitation.id
        )
        await refreshAppData()
        await selectWorkspace(response.workspace.id)
        await load()
        navigate(`/team-spaces/${response.workspace.id}/members`)
      } catch (err) {
        setError(err instanceof Error ? err.message : "Accept invitation failed.")
      } finally {
        setAcceptingId(null)
      }
    },
    [accessToken, load, navigate, refreshAppData, selectWorkspace]
  )

  return (
    <PageShell
      title="Notifications"
      description="Review workspace invitations that are addressed to your account and accept access inside Ineffable."
    >
      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      <section className="overflow-hidden rounded-lg border border-border">
        <div className="flex items-center justify-between border-b border-border bg-muted/25 p-4">
          <h2 className="text-base font-semibold">Workspace Invitations</h2>
          <span className="rounded bg-muted px-2 py-0.5 text-[10px] font-bold text-muted-foreground">
            {items.length} PENDING
          </span>
        </div>
        <div className="divide-y divide-border">
          {items.map((item) => (
            <div
              key={item.invitation.id}
              className="grid gap-4 px-4 py-4 text-sm sm:grid-cols-[1fr_140px_140px_auto]"
            >
              <div className="min-w-0">
                <div className="truncate font-medium">{item.workspace.name}</div>
                <div className="mt-1 truncate text-xs text-muted-foreground">
                  Invited as {item.invitation.role} · {item.invitation.email}
                </div>
              </div>
              <StatusBadge status={item.invitation.status} />
              <div className="text-muted-foreground">
                {new Date(item.invitation.expires_at).toLocaleDateString()}
              </div>
              <button
                type="button"
                onClick={() => void acceptInvitation(item)}
                disabled={acceptingId === item.invitation.id}
                className="inline-flex h-9 items-center justify-center rounded-lg bg-foreground px-4 text-sm font-semibold text-background disabled:opacity-60"
              >
                {acceptingId === item.invitation.id ? "Accepting..." : "Accept"}
              </button>
            </div>
          ))}
          {!items.length ? (
            <div className="px-4 py-8 text-sm text-muted-foreground">
              {isLoading ? "Loading..." : "No pending workspace invitations."}
            </div>
          ) : null}
        </div>
      </section>
    </PageShell>
  )
}

export function AcceptWorkspaceInvitationPage() {
  const { token } = useParams()
  const navigate = useNavigate()
  const { accessToken, refreshAppData, selectWorkspace } = useAppSession()
  const [status, setStatus] = React.useState<"idle" | "accepting" | "accepted" | "error">("idle")
  const [error, setError] = React.useState<string | null>(null)
  const [workspaceName, setWorkspaceName] = React.useState("Team Workspace")

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
    } catch (err) {
      setStatus("error")
      setError(err instanceof Error ? err.message : "Accept invitation failed.")
    }
  }, [accessToken, refreshAppData, selectWorkspace, token])

  return (
    <PageShell
      title="Incoming Invitation"
      description="Review and accept access to a shared Team Workspace. Your agent will use this workspace context after acceptance."
    >
      <div className="mx-auto max-w-xl rounded-xl border border-border bg-muted/20 p-8 shadow-2xl">
        <div className="flex flex-col items-center text-center">
          <div className="flex size-20 items-center justify-center rounded-full border border-border bg-muted">
            {status === "accepted" ? (
              <CheckCircle2Icon className="size-10 text-emerald-400" />
            ) : (
              <MailIcon className="size-10 text-muted-foreground" />
            )}
          </div>
          <p className="mt-6 text-xs font-semibold uppercase tracking-normal text-muted-foreground">
            Workspace Access Level
          </p>
          <h1 className="mt-2 text-2xl font-semibold">
            {status === "accepted"
              ? `You're in ${workspaceName}`
              : "You've been invited to join a Team Workspace"}
          </h1>
          <p className="mt-3 text-sm leading-6 text-muted-foreground">
            Team Workspace access enables shared files, artifacts, member context,
            and selected sandbox collaboration for your own agent.
          </p>
        </div>

        <div className="mt-8 grid gap-3">
          <AccessRow icon={<ShieldCheckIcon className="size-5" />} title="Workspace Context" />
          <AccessRow icon={<SparklesIcon className="size-5" />} title="Shared Agent Memory" />
          <AccessRow icon={<UsersIcon className="size-5" />} title="Team Collaboration" />
        </div>

        {error ? <p className="mt-5 text-sm text-destructive">{error}</p> : null}

        <div className="mt-8 space-y-3">
          {status === "accepted" ? (
            <button
              onClick={() => navigate("/console/world")}
              className="flex h-12 w-full items-center justify-center gap-2 rounded-lg bg-foreground text-sm font-semibold text-background"
            >
              Continue
              <ArrowRightIcon className="size-4" />
            </button>
          ) : (
            <button
              onClick={accept}
              disabled={status === "accepting"}
              className="flex h-12 w-full items-center justify-center gap-2 rounded-lg bg-foreground text-sm font-semibold text-background disabled:opacity-60"
            >
              {status === "accepting" ? "Accepting..." : "Accept and Setup Profile"}
              <ArrowRightIcon className="size-4" />
            </button>
          )}
          <Link
            to="/console/world"
            className="flex h-11 items-center justify-center rounded-lg text-sm font-semibold text-muted-foreground hover:bg-muted/40 hover:text-foreground"
          >
            Maybe later
          </Link>
        </div>
      </div>
    </PageShell>
  )
}

function AccessRow({ icon, title }: { icon: React.ReactNode; title: string }) {
  return (
    <div className="flex items-center gap-3 rounded-lg border border-border bg-background/60 p-4">
      <div className="flex size-9 items-center justify-center rounded bg-muted text-muted-foreground">
        {icon}
      </div>
      <div>
        <div className="text-sm font-semibold">{title}</div>
        <div className="text-xs text-muted-foreground">Granted after invitation acceptance.</div>
      </div>
    </div>
  )
}
