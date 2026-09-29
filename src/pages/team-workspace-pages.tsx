import * as React from "react";
import { useTranslation } from "react-i18next";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  ArrowRightIcon,
  CheckCircle2Icon,
  CopyIcon,
  MailIcon,
  ShieldCheckIcon,
  SparklesIcon,
  Trash2Icon,
  UserPlusIcon,
  UsersIcon,
} from "lucide-react";

import {
  AppPage,
  AppListToolbar,
  AppSearchBar,
  AsyncButton,
  DataState,
  DataTableBody,
  DataTableHeader,
  DataTableShell,
  FormField,
  Notice,
  StatusBadge,
} from "@/components/app";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  useAuthSession,
  useWorkspaceSession,
} from "@/features/auth/app-session";
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
} from "@/features/workspace/api/workspace-api";
import { normalizeAppError, type AppError } from "@/lib/app/api-errors";
import { confirm } from "@/lib/app/confirm";
import { notify } from "@/lib/app/notifications";
import { useApiResource } from "@/lib/app/use-api-resource";
import { getCurrentLocale, i18n, normalizeLanguage } from "@/lib/i18n/i18n";
import { defaultPath } from "@/routes/navigation";
import { useActionScope } from "@/lib/app/use-action-scope";
import { getWorkspaceAccess } from "@/features/workspace/api/workspace-lifecycle";

const roleOptions = ["admin", "member", "viewer"] as const;
const purposeOptions = [
  "Engineering",
  "Marketing",
  "Operations",
  "Research",
] as const;
function roleLabel(role: string) {
  if (["owner", "admin", "member", "viewer"].includes(role)) {
    return i18n.t(`team.role.${role}`);
  }
  return role;
}

function invitationStatusLabel(status: string) {
  if (
    ["active", "pending", "accepted", "expired", "revoked"].includes(status)
  ) {
    return i18n.t(`team.status.${status}`);
  }
  return status;
}

function slugify(value: string) {
  const slug = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || `team-${Date.now()}`;
}

function initials(value: string) {
  const raw = value.trim();
  if (!raw) return "TS";
  const name = raw.includes("@") ? raw.split("@")[0] : raw;
  return name
    .split(/[\s._-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("")
    .padEnd(2, "A");
}

export function CreateTeamWorkspacePage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { accessToken, currentSessionId, refreshAppData } = useAuthSession();
  const captureScope = useActionScope(`${currentSessionId}:create-team`);
  const [teamName, setTeamName] = React.useState("");
  const [purpose, setPurpose] = React.useState<(typeof purposeOptions)[number]>("Engineering");
  const [error, setError] = React.useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [uncertain, setUncertain] = React.useState(false);
  const busy = React.useRef(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!accessToken || busy.current || uncertain || !teamName.trim()) return;
    const isCurrent = captureScope();
    busy.current = true; setIsSubmitting(true); setError(null);
    try {
      const created = await createWorkspace(accessToken, {
        name: teamName.trim(), slug: slugify(teamName.trim()), plan: "free", settings_json: { purpose },
      });
      // Creation is complete. Invitations are a separate action on the created team.
      void refreshAppData({ fresh: true }).then(ok => {
        if (!ok && isCurrent()) notify.error({ title: t("workspaceLifecycle.refreshFailed") });
      });
      if (!isCurrent()) return;
      notify.success({ title: t("team.create.success"), description: created.workspace.name });
      navigate(`/team-spaces/${created.workspace.id}/members`);
    } catch (caught) {
      if (!isCurrent()) return;
      const failure = normalizeAppError(caught);
      setError(failure.message);
      setUncertain(!failure.status || failure.status >= 500);
    } finally {
      busy.current = false;
      if (isCurrent()) setIsSubmitting(false);
    }
  }

  return <AppPage title={t("team.create.title")} description={t("interaction.createTeamHint")}>
    <form onSubmit={submit} className="max-w-2xl space-y-5 rounded-xl border bg-card p-5 sm:p-6">
      <fieldset disabled={isSubmitting || uncertain} className="space-y-5">
        <FormField htmlFor="team-workspace-name" label={t("team.create.name")}>
          <Input id="team-workspace-name" value={teamName} onChange={event => setTeamName(event.target.value)} placeholder={t("team.create.namePlaceholder")} autoComplete="organization" />
        </FormField>
        <FormField label={t("team.create.purpose")}>
          <select className="h-10 w-full rounded-md border bg-background px-3" value={purpose} onChange={event => setPurpose(event.target.value as typeof purpose)}>
            {purposeOptions.map(option => <option key={option} value={option}>{t(`team.purpose.${option}`)}</option>)}
          </select>
        </FormField>
      </fieldset>
      {error && <Notice tone="error">{error}</Notice>}
      {uncertain && <Notice tone="warning">{t("interaction.uncertainCreate")}</Notice>}
      <div className="flex justify-end gap-3">
        <Button type="button" variant="ghost" disabled={isSubmitting} onClick={() => navigate("/team-spaces")}>{t("common.cancel")}</Button>
        <AsyncButton type="submit" isLoading={isSubmitting} disabled={uncertain || !teamName.trim()} loadingLabel={t("team.create.creating")}>{t("team.create.submit")}</AsyncButton>
      </div>
    </form>
  </AppPage>;
}

export function TeamWorkspaceMembersPage() {
  const { workspaceId } = useParams();
  const { currentSessionId } = useAuthSession();
  return <TeamWorkspaceMembers key={`${currentSessionId}:${workspaceId}`} />;
}

function TeamWorkspaceMembers() {
  const { t } = useTranslation();
  const { workspaceId } = useParams();
  const { accessToken, currentSessionId, currentUser } = useAuthSession();
  const { currentWorkspace } = useWorkspaceSession();
  const [query, setQuery] = React.useState("");
  const [inviteEmail, setInviteEmail] = React.useState("");
  const [inviteRole, setInviteRole] = React.useState("member");
  const [lastInviteUrl, setLastInviteUrl] = React.useState<string | null>(null);
  const [actionError, setActionError] = React.useState<AppError | null>(null);
  const [isInviting, setIsInviting] = React.useState(false);
  const [updatingMemberId, setUpdatingMemberId] = React.useState<string | null>(
    null,
  );
  const [removingMemberId, setRemovingMemberId] = React.useState<string | null>(
    null,
  );
  const [revokingInvitationId, setRevokingInvitationId] = React.useState<
    string | null
  >(null);

  const targetWorkspaceId = workspaceId || currentWorkspace?.id || "";

  const captureScope = useActionScope(`${currentSessionId}:${targetWorkspaceId}`);
  const loadMemberResource = React.useCallback(async () => {
    const access = await getWorkspaceAccess(accessToken!, targetWorkspaceId);
    const memberResponse = await listWorkspaceMembers(accessToken!, targetWorkspaceId);
    const [invitationResponse, usageResponse] = await Promise.allSettled([
      access.can_manage_members ? listWorkspaceInvitations(accessToken!, targetWorkspaceId) : Promise.resolve({ invitations: [] as WorkspaceInvitation[] }),
      access.workspace.status === "active" ? getWorkspaceUsage(accessToken!, targetWorkspaceId) : Promise.resolve({ usage: null as WorkspaceUsage | null }),
    ]);
    return {
      access, members: memberResponse.members,
      invitations: invitationResponse.status === "fulfilled" ? invitationResponse.value.invitations : [],
      usage: usageResponse.status === "fulfilled" ? usageResponse.value.usage : null,
      detailsFailed: invitationResponse.status === "rejected" || usageResponse.status === "rejected",
    };
  }, [accessToken, targetWorkspaceId]);
  const memberResource = useApiResource({
    enabled: Boolean(accessToken && targetWorkspaceId),
    cacheKey: ["workspace-members", currentSessionId, targetWorkspaceId],
    load: loadMemberResource,
    errorMessage: t("team.members.loadFailed"),
  });
  const {
    data: memberData,
    error: memberLoadError,
    reload: reloadMembers,
    state: memberState,
  } = memberResource;
  const members = memberData?.members ?? [];
  const targetWorkspace = memberData?.access.workspace;
  const canManage = !memberLoadError && memberData?.access.can_manage_members === true;
  const [inviteUncertain, setInviteUncertain] = React.useState(false);
  const [emailError, setEmailError] = React.useState(false);
  const isOwner = members.some(member => member.user_id === currentUser?.id && member.role === "owner" && member.status === "active");
  const invitations = memberData?.invitations ?? [];
  const usage = memberData?.usage ?? null;

  const submitInvite = React.useCallback(
    async (event: React.FormEvent) => {
      event.preventDefault();
      if (!accessToken || !targetWorkspaceId || !canManage || isInviting || inviteUncertain) return;
      const isCurrent = captureScope();
      const email = inviteEmail.trim().toLowerCase();
      if (!email) {
        setActionError(
          normalizeAppError(t("team.members.emailRequired"), {
            fallbackMessage: t("team.members.emailRequired"),
          }),
        );
        return;
      }
      setActionError(null);
      setIsInviting(true);
      try {
        const response = await inviteWorkspaceMember(
          accessToken,
          targetWorkspaceId,
          {
            email,
            role: inviteRole,
            invite_base_url: `${window.location.origin}/workspace-invitations`,
          },
        );
        if (!isCurrent()) return;
        setLastInviteUrl(response.invite_url);
        setEmailError(Boolean(response.email_error));
        setInviteEmail("");
        await reloadMembers();
        if (!isCurrent()) return;
        notify.success({
          title: t(response.email_error ? "interaction.inviteCreated" : "team.members.inviteSent"),
          description: t("team.members.inviteSentDescription", { email }),
        });
      } catch (err) {
        if (!isCurrent()) return;
        const appError = normalizeAppError(err, {
          fallbackMessage: t("team.members.inviteFailed"),
        });
        setActionError(appError);
        setInviteUncertain(!appError.status || appError.status >= 500);
        notify.error({
          title: t("team.members.inviteFailedTitle"),
          description: appError.message,
        });
      } finally {
        if (isCurrent()) setIsInviting(false);
      }
    },
    [accessToken, canManage, captureScope, inviteEmail, inviteRole, inviteUncertain, isInviting, reloadMembers, t, targetWorkspaceId],
  );

  const updateMemberRole = React.useCallback(
    async (member: WorkspaceMembership, role: string) => {
      if (!accessToken || !targetWorkspaceId || !canManage) return;
      const isCurrent = captureScope();
      if (role === "owner" && !await confirm({ title: t("interaction.grantOwner"), description: t("interaction.grantOwnerHint"), confirmLabel: t("common.confirm") })) return;
      if (!isCurrent()) return;
      setActionError(null);
      setUpdatingMemberId(member.id);
      try {
        await updateWorkspaceMemberRole(
          accessToken,
          targetWorkspaceId,
          member.user_id,
          role,
        );
        await reloadMembers();
        if (!isCurrent()) return;
        notify.success({
          title: t("team.members.roleUpdated"),
          description: t("team.members.roleUpdatedDescription", {
            role: roleLabel(role),
          }),
        });
      } catch (err) {
        if (!isCurrent()) return;
        const appError = normalizeAppError(err, {
          fallbackMessage: t("team.members.roleUpdateFailed"),
        });
        setActionError(appError);
        notify.error({
          title: t("team.members.roleUpdateFailedTitle"),
          description: appError.message,
        });
      } finally {
        if (isCurrent()) setUpdatingMemberId(null);
      }
    },
    [accessToken, canManage, captureScope, reloadMembers, t, targetWorkspaceId],
  );

  const removeMember = React.useCallback(
    async (member: WorkspaceMembership) => {
      if (!accessToken || !targetWorkspaceId || !canManage) return;
      const isCurrent = captureScope();
      const confirmed = await confirm({
        title: t("team.members.removeTitle"),
        description: t("team.members.removeDescription"),
        confirmLabel: t("team.members.removeConfirm"),
        variant: "destructive",
      });
      if (!confirmed || !isCurrent()) return;

      setActionError(null);
      setRemovingMemberId(member.id);
      try {
        await removeWorkspaceMember(
          accessToken,
          targetWorkspaceId,
          member.user_id,
        );
        await reloadMembers();
        if (!isCurrent()) return;
        notify.success({ title: t("team.members.removed") });
      } catch (err) {
        if (!isCurrent()) return;
        const appError = normalizeAppError(err, {
          fallbackMessage: t("team.members.removeFailed"),
        });
        setActionError(appError);
        notify.error({
          title: t("team.members.removeFailedTitle"),
          description: appError.message,
        });
      } finally {
        if (isCurrent()) setRemovingMemberId(null);
      }
    },
    [accessToken, canManage, captureScope, reloadMembers, t, targetWorkspaceId],
  );

  const revokeInvitation = React.useCallback(
    async (invitation: WorkspaceInvitation) => {
      if (!accessToken || !targetWorkspaceId || !canManage) return;
      const isCurrent = captureScope();
      const confirmed = await confirm({
        title: t("team.members.revokeTitle"),
        description: t("team.members.revokeDescription", {
          email: invitation.email,
        }),
        confirmLabel: t("team.members.revokeConfirm"),
        variant: "destructive",
      });
      if (!confirmed || !isCurrent()) return;

      setActionError(null);
      setRevokingInvitationId(invitation.id);
      try {
        await revokeWorkspaceInvitation(
          accessToken,
          targetWorkspaceId,
          invitation.id,
        );
        await reloadMembers();
        if (!isCurrent()) return;
        notify.success({ title: t("team.members.revoked") });
      } catch (err) {
        if (!isCurrent()) return;
        const appError = normalizeAppError(err, {
          fallbackMessage: t("team.members.revokeFailed"),
        });
        setActionError(appError);
        notify.error({
          title: t("team.members.revokeFailedTitle"),
          description: appError.message,
        });
      } finally {
        if (isCurrent()) setRevokingInvitationId(null);
      }
    },
    [accessToken, canManage, captureScope, reloadMembers, t, targetWorkspaceId],
  );

  const filteredMembers = members.filter((member) => {
    const needle = query.trim().toLowerCase();
    return (
      !needle ||
      member.user_id.toLowerCase().includes(needle) ||
      member.role.toLowerCase().includes(needle)
    );
  });
  const pendingInvitations = invitations.filter(
    (item) => item.status === "pending",
  );
  return (
    <AppPage
      title={t("team.members.title")}
      description={t("team.members.description", {
        name: targetWorkspace?.name || t("team.members.currentWorkspace"),
      })}
    >
      <div className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border bg-border lg:grid-cols-4">
        <Metric
          label={t("team.members.currentMembers")}
          value={`${members.length}`}
          suffix={t("team.members.people")}
        />
        <Metric
          label={t("team.members.pendingInvites")}
          value={String(pendingInvitations.length)}
          suffix={t("team.members.items")}
        />
        <Metric
          label={t("team.members.storage")}
          value={formatWorkspaceStorage(usage)}
          suffix={formatWorkspaceStorageSuffix(usage)}
          compact
        />
        <Metric
          label={t("team.members.files")}
          value={usage ? String(usage.file_count) : "—"}
          suffix={
            usage
              ? t("team.members.objects", { count: usage.object_count })
              : undefined
          }
        />
      </div>

      {canManage && <section className="overflow-hidden rounded-xl border">
        <div className="border-b bg-muted/20 px-4 py-3">
          <h2 className="font-medium">{t("team.members.inviteMembers")}</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            {t("team.members.inviteDescription")}
          </p>
        </div>
        <form
          onSubmit={submitInvite}
          className="grid gap-3 p-4 sm:grid-cols-[minmax(0,1fr)_140px_auto]"
        >
          <Input
            disabled={isInviting || inviteUncertain}
            value={inviteEmail}
            onChange={(event) => setInviteEmail(event.target.value)}
            placeholder={t("team.members.memberEmail")}
            type="email"
            className="h-10"
            aria-label={t("team.members.memberEmail")}
          />
          <select
            disabled={isInviting || inviteUncertain}
            value={inviteRole}
            onChange={(event) => setInviteRole(event.target.value)}
            className="h-10 rounded-lg border border-border bg-background px-3 text-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
            aria-label={t("team.members.inviteRole")}
          >
            {roleOptions.map((role) => (
              <option key={role} value={role}>
                {roleLabel(role)}
              </option>
            ))}
          </select>
          <AsyncButton
            disabled={inviteUncertain}
            className="h-10"
            isLoading={isInviting}
            loadingLabel={t("team.members.sending")}
          >
            <UserPlusIcon className="size-4" />
            {t("team.members.sendInvite")}
          </AsyncButton>
        </form>
      </section>}
      {memberData?.detailsFailed && <Notice tone="warning">{t("interaction.detailsFailed")} <Button variant="link" onClick={() => void reloadMembers()}>{t("common.retry")}</Button></Notice>}
      {emailError && <Notice tone="warning">{t("interaction.emailFailed")}</Notice>}
      {inviteUncertain && <Notice tone="warning">{t("interaction.uncertainCreate")}</Notice>}

      {lastInviteUrl ? (
        <Button
          type="button"
          variant="outline"
          onClick={() => {
            void navigator.clipboard?.writeText(lastInviteUrl);
            notify.info({ title: t("team.members.linkCopied") });
          }}
          className="flex h-auto w-full justify-between px-4 py-3 text-left"
        >
          <span className="truncate text-muted-foreground">
            {t("team.members.copyLatestLink")}
          </span>
          <CopyIcon className="ml-3 size-4 shrink-0" />
        </Button>
      ) : null}

      {actionError ? <Notice tone="error">{actionError.message}</Notice> : null}

      <section className="overflow-hidden rounded-lg border border-border">
        <div className="border-b bg-muted/25 px-4 py-3">
          <h2 className="text-base font-semibold">
            {t("team.members.memberList")}
          </h2>
        </div>
        <AppListToolbar
          search={
            <AppSearchBar
              value={query}
              onChange={setQuery}
              placeholder={t("team.members.search")}
            />
          }
        />
        <div className="p-4">
          <DataState
            state={memberState}
            error={memberLoadError}
            empty={filteredMembers.length === 0}
            emptyTitle={t("team.members.noMatches")}
            onRetry={() => void reloadMembers()}
          >
            <DataTableShell>
              <DataTableHeader>
                <tr>
                  <th className="px-4 py-3">{t("team.members.member")}</th>
                  <th className="px-4 py-3">{t("team.members.role")}</th>
                  <th className="hidden px-4 py-3 @[36rem]/table:table-cell">
                    {t("team.members.status")}
                  </th>
                  <th className="hidden px-4 py-3 @[46rem]/table:table-cell">
                    {t("team.members.joinedAt")}
                  </th>
                  <th className="px-4 py-3" />
                </tr>
              </DataTableHeader>
              <DataTableBody>
                {filteredMembers.map((member) => (
                  <tr key={member.id} className="hover:bg-muted/20">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-bold">
                          {initials(member.user_id)}
                        </div>
                        <div className="min-w-0">
                          <div className="font-medium">
                            {member.user_id.slice(0, 8)}
                          </div>
                          <div className="truncate text-[11px] text-muted-foreground">
                            {member.user_id}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <select
                        value={member.role}
                        onChange={(event) => {
                          void updateMemberRole(member, event.target.value);
                        }}
                        className="h-8 w-32 rounded border border-border bg-background px-2 text-sm"
                        disabled={
                          !canManage || member.role === "owner" ||
                          updatingMemberId === member.id
                        }
                        aria-label={t("team.members.changeRole", {
                          id: member.user_id,
                        })}
                      >
                        {[
                          ...(isOwner || member.role === "owner" ? ["owner"] : []),
                          ...roleOptions,
                        ].map((role) => (
                          <option key={role} value={role}>
                            {roleLabel(role)}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="hidden px-4 py-3 @[36rem]/table:table-cell">
                      <StatusBadge
                        status={member.status}
                        label={invitationStatusLabel(member.status)}
                      />
                    </td>
                    <td className="hidden px-4 py-3 text-muted-foreground @[46rem]/table:table-cell">
                      {formatDate(member.joined_at)}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <AsyncButton
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => void removeMember(member)}
                        isLoading={removingMemberId === member.id}
                        loadingLabel={t("team.members.removing")}
                        disabled={!canManage || member.role === "owner" || member.user_id === currentUser?.id}
                      >
                        <Trash2Icon className="size-4" />
                        <span className="hidden @[32rem]/table:inline">
                          {t("team.members.remove")}
                        </span>
                      </AsyncButton>
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
          <h2 className="text-base font-semibold">
            {t("team.members.inviteHistory")}
          </h2>
          <span className="rounded bg-muted px-2 py-0.5 text-[10px] font-bold text-muted-foreground">
            {t("team.members.pendingCount", {
              count: pendingInvitations.length,
            })}
          </span>
        </div>
        <div className="p-4">
          <DataState
            state={memberState}
            error={memberLoadError}
            empty={invitations.length === 0}
            emptyTitle={t("team.members.noInvites")}
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
                      {t("team.members.invitedBy", {
                        id: invitation.invited_by.slice(0, 8),
                      })}
                    </div>
                  </div>
                  <div>{roleLabel(invitation.role)}</div>
                  <StatusBadge
                    status={invitation.status}
                    label={invitationStatusLabel(invitation.status)}
                  />
                  <div className="text-muted-foreground">
                    {formatDate(invitation.expires_at)}
                  </div>
                  <AsyncButton
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => void revokeInvitation(invitation)}
                    isLoading={revokingInvitationId === invitation.id}
                    loadingLabel={t("team.members.revoking")}
                    disabled={invitation.status !== "pending"}
                  >
                    {t("team.members.revoke")}
                  </AsyncButton>
                </div>
              ))}
            </div>
          </DataState>
        </div>
      </section>
    </AppPage>
  );
}

function Metric({
  label,
  value,
  suffix,
  compact,
}: {
  label: string;
  value: string;
  suffix?: string;
  compact?: boolean;
}) {
  return (
    <div className="min-w-0 bg-background p-4 sm:p-5">
      <div className="text-xs font-medium text-muted-foreground">{label}</div>
      <div
        className={
          compact
            ? "mt-1 truncate text-base font-semibold sm:text-lg"
            : "mt-1 text-2xl font-semibold"
        }
      >
        {value}
        {suffix ? (
          <span className="ml-1 text-xs font-normal text-muted-foreground sm:text-sm">
            {suffix}
          </span>
        ) : null}
      </div>
    </div>
  );
}

function formatWorkspaceStorage(usage: WorkspaceUsage | null) {
  if (!usage) return "-";
  if (usage.storage_limit_bytes && usage.storage_limit_bytes > 0) {
    const ratio =
      usage.storage_usage_ratio == null
        ? usage.storage_bytes / usage.storage_limit_bytes
        : usage.storage_usage_ratio;
    return `${Math.round(ratio * 100)}%`;
  }
  return formatBytes(usage.storage_bytes);
}

function formatWorkspaceStorageSuffix(usage: WorkspaceUsage | null) {
  if (!usage) return undefined;
  const recalculated = formatUsageRecalculatedAt(usage);
  if (usage.storage_limit_bytes && usage.storage_limit_bytes > 0) {
    return `${formatBytes(usage.storage_bytes)} / ${formatBytes(usage.storage_limit_bytes)}${recalculated}`;
  }
  return i18n.t("team.members.used", { recalculated });
}

function formatUsageRecalculatedAt(usage: WorkspaceUsage) {
  if (!usage.recalculated_at) return "";
  const date = new Date(usage.recalculated_at);
  if (Number.isNaN(date.getTime())) return "";
  return ` · ${date.toLocaleString(
    normalizeLanguage(i18n.resolvedLanguage || i18n.language),
    {
      month: "2-digit",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    },
  )}`;
}

function formatDate(value: string) {
  return new Date(value).toLocaleDateString(
    normalizeLanguage(i18n.resolvedLanguage || i18n.language),
  );
}

function formatBytes(value: number) {
  if (value >= 1024 * 1024 * 1024) {
    return `${formatMetricNumber(value / 1024 / 1024 / 1024)} GB`;
  }
  if (value >= 1024 * 1024) {
    return `${formatMetricNumber(value / 1024 / 1024)} MB`;
  }
  if (value >= 1024) {
    return `${formatMetricNumber(value / 1024)} KB`;
  }
  return `${formatMetricNumber(value)} B`;
}

function formatMetricNumber(value: number) {
  return new Intl.NumberFormat(getCurrentLocale(), {
    maximumFractionDigits: value >= 10 ? 1 : 2,
  }).format(value);
}

export function WorkspaceNotificationsPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { accessToken, currentSessionId, refreshAppData } = useAuthSession();
  const captureScope = useActionScope(`${currentSessionId}:invitations`);
  const [actionError, setActionError] = React.useState<AppError | null>(null);
  const [acceptingId, setAcceptingId] = React.useState<string | null>(null);

  const loadInvitations = React.useCallback(async () => {
    if (!accessToken) return { invitations: [] };
    return listIncomingWorkspaceInvitations(accessToken);
  }, [accessToken]);
  const invitationsResource = useApiResource({
    enabled: Boolean(accessToken),
    cacheKey: ["workspace-invitations", currentSessionId],
    load: loadInvitations,
    errorMessage: t("team.notifications.loadFailed"),
  });
  const {
    data: invitationsData,
    error: invitationsError,
    reload: reloadInvitations,
    state: invitationsState,
  } = invitationsResource;
  const items = invitationsData?.invitations ?? [];

  const acceptInvitation = React.useCallback(
    async (item: IncomingWorkspaceInvitation) => {
      if (!accessToken || acceptingId) return;
      const isCurrent = captureScope();

      setAcceptingId(item.invitation.id);
      setActionError(null);
      try {
        const response = await acceptWorkspaceInvitationById(
          accessToken,
          item.invitation.id,
        );
        void refreshAppData({ fresh: true });
        void reloadInvitations();
        if (!isCurrent()) return;
        notify.success({
          title: t("team.notifications.joined"),
          description: t("team.notifications.joinedDescription", {
            name: response.workspace.name,
          }),
        });
        navigate(`/team-spaces/${response.workspace.id}/members`);
      } catch (err) {
        if (!isCurrent()) return;
        const appError = normalizeAppError(err, {
          fallbackMessage: t("team.notifications.acceptFailed"),
        });
        setActionError(appError);
        notify.error({
          title: t("team.notifications.acceptFailedTitle"),
          description: appError.message,
        });
      } finally {
        if (isCurrent()) setAcceptingId(null);
      }
    },
    [
      accessToken,
      navigate,
      refreshAppData,
      reloadInvitations,
      acceptingId,
      captureScope,
      t,
    ],
  );

  return (
    <AppPage
      title={t("team.notifications.title")}
      description={t("team.notifications.description")}
    >
      {actionError ? <Notice tone="error">{actionError.message}</Notice> : null}

      <section className="overflow-hidden rounded-lg border border-border">
        <div className="flex items-center justify-between border-b border-border bg-muted/25 p-4">
          <h2 className="text-base font-semibold">
            {t("team.notifications.section")}
          </h2>
          <span className="rounded bg-muted px-2 py-0.5 text-[10px] font-bold text-muted-foreground">
            {t("team.notifications.pendingCount", { count: items.length })}
          </span>
        </div>
        <div className="p-4">
          <DataState
            state={invitationsState}
            error={invitationsError}
            empty={items.length === 0}
            emptyTitle={t("team.notifications.empty")}
            emptyDescription={t("team.notifications.emptyDescription")}
            onRetry={() => void reloadInvitations()}
          >
            <div className="divide-y divide-border overflow-hidden rounded-md border border-border">
              {items.map((item) => (
                <div
                  key={item.invitation.id}
                  className="grid gap-4 px-4 py-4 text-sm sm:grid-cols-[1fr_140px_140px_auto]"
                >
                  <div className="min-w-0">
                    <div className="truncate font-medium">
                      {item.workspace.name}
                    </div>
                    <div className="mt-1 truncate text-xs text-muted-foreground">
                      {t("team.notifications.invitedRole", {
                        role: roleLabel(item.invitation.role),
                        email: item.invitation.email,
                      })}
                    </div>
                  </div>
                  <StatusBadge
                    status={item.invitation.status}
                    label={invitationStatusLabel(item.invitation.status)}
                  />
                  <div className="text-muted-foreground">
                    {t("team.notifications.expiresAt", {
                      date: formatDate(item.invitation.expires_at),
                    })}
                  </div>
                  <AsyncButton
                    type="button"
                    onClick={() => void acceptInvitation(item)}
                    isLoading={acceptingId === item.invitation.id}
                    loadingLabel={t("team.notifications.accepting")}
                  >
                    {t("team.notifications.accept")}
                  </AsyncButton>
                </div>
              ))}
            </div>
          </DataState>
        </div>
      </section>
    </AppPage>
  );
}

export function AcceptWorkspaceInvitationPage() {
  const { t } = useTranslation();
  const { token } = useParams();
  const navigate = useNavigate();
  const { accessToken, currentSessionId, refreshAppData } = useAuthSession();
  const captureScope = useActionScope(`${currentSessionId}:${token}`);
  const [acceptedWorkspaceId, setAcceptedWorkspaceId] = React.useState<string | null>(null);
  const [status, setStatus] = React.useState<
    "idle" | "accepting" | "accepted" | "error"
  >("idle");
  const [error, setError] = React.useState<string | null>(null);
  const [workspaceName, setWorkspaceName] = React.useState(() =>
    t("team.invitation.workspaceFallback"),
  );

  const accept = React.useCallback(async () => {
    if (!accessToken || !token || status === "accepting") return;
    const isCurrent = captureScope();
    setStatus("accepting");
    setError(null);
    try {
      const response = await acceptWorkspaceInvitation(accessToken, token);
      void refreshAppData({ fresh: true });
      if (!isCurrent()) return;
      setWorkspaceName(response.workspace.name);
      setAcceptedWorkspaceId(response.workspace.id);
      setStatus("accepted");
      notify.success({
        title: t("team.invitation.accepted"),
        description: t("team.invitation.acceptedDescription", {
          name: response.workspace.name,
        }),
      });
    } catch (err) {
      if (!isCurrent()) return;
      setStatus("error");
      const appError = normalizeAppError(err, {
        fallbackMessage: t("team.invitation.failed"),
      });
      setError(appError.message);
      notify.error({
        title: t("team.invitation.failedTitle"),
        description: appError.message,
      });
    }
  }, [accessToken, refreshAppData, captureScope, status, t, token]);

  return (
    <AppPage
      title={t("team.invitation.pageTitle")}
      description={t("team.invitation.pageDescription")}
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
              ? t("team.invitation.acceptedHeading", { name: workspaceName })
              : t("team.invitation.heading")}
          </h1>
          <p className="mt-3 text-sm leading-6 text-muted-foreground">
            {t("team.invitation.description")}
          </p>
        </div>

        <div className="mt-8 grid gap-3">
          <AccessRow
            icon={<ShieldCheckIcon className="size-5" />}
            title={t("team.invitation.permissionTitle")}
            description={t("team.invitation.permissionDescription")}
          />
          <AccessRow
            icon={<SparklesIcon className="size-5" />}
            title={t("team.invitation.contextTitle")}
            description={t("team.invitation.contextDescription")}
          />
          <AccessRow
            icon={<UsersIcon className="size-5" />}
            title={t("team.invitation.collaborationTitle")}
            description={t("team.invitation.collaborationDescription")}
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
              onClick={() => navigate(acceptedWorkspaceId ? `/workspace/${acceptedWorkspaceId}/objects` : defaultPath)}
              className="h-12 w-full gap-2"
            >
              {t("team.invitation.enter")}
              <ArrowRightIcon className="size-4" />
            </Button>
          ) : (
            <AsyncButton
              type="button"
              onClick={accept}
              isLoading={status === "accepting"}
              loadingLabel={t("team.invitation.accepting")}
              className="h-12 w-full gap-2"
            >
              {t("team.invitation.accept")}
              <ArrowRightIcon className="size-4" />
            </AsyncButton>
          )}
          <Button asChild variant="ghost" className="h-11 w-full">
            <Link to={defaultPath}>{t("team.invitation.later")}</Link>
          </Button>
        </div>
      </div>
    </AppPage>
  );
}

function AccessRow({
  icon,
  title,
  description,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
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
  );
}
