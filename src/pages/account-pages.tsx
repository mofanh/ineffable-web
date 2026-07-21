import * as React from "react";
import { useTranslation } from "react-i18next";
import {
  BadgeCheckIcon,
  LaptopIcon,
  ShieldCheckIcon,
  SmartphoneIcon,
} from "lucide-react";

import {
  AppFieldGrid,
  AppPage,
  AsyncButton,
  DataState,
  StatusBadge,
} from "@/components/app";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  useAuthSession,
  useWorkspaceSession,
} from "@/features/auth/app-session";
import {
  fetchAuthSessions,
  revokeAuthSession,
  type UserSessionRecord,
} from "@/features/auth/api/auth-api";
import { normalizeAppError } from "@/lib/app/api-errors";
import { confirm } from "@/lib/app/confirm";
import { notify } from "@/lib/app/notifications";
import { useApiResource } from "@/lib/app/use-api-resource";
import { i18n, normalizeLanguage } from "@/lib/i18n/i18n";

function buildAvatarFallback(name: string, email: string) {
  const base = name || email || "IU";
  return base
    .split(" ")
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

function formatTimestamp(value?: string | null) {
  if (!value) return i18n.t("account.unknown");

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;

  return new Intl.DateTimeFormat(
    normalizeLanguage(i18n.resolvedLanguage || i18n.language),
    {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    },
  ).format(date);
}

function isMobileUserAgent(userAgent?: string | null) {
  const ua = (userAgent || "").toLowerCase();
  return (
    ua.includes("iphone") || ua.includes("android") || ua.includes("mobile")
  );
}

function browserName(userAgent: string) {
  if (/edg\//i.test(userAgent)) return "Microsoft Edge";
  if (/firefox\//i.test(userAgent)) return "Firefox";
  if (/chrome\//i.test(userAgent)) return "Chrome";
  if (/safari\//i.test(userAgent)) return "Safari";
  return i18n.t("account.unknownBrowser");
}

function operatingSystem(userAgent: string) {
  if (/iphone|ipad/i.test(userAgent)) return "iOS";
  if (/android/i.test(userAgent)) return "Android";
  if (/macintosh|mac os x/i.test(userAgent)) return "macOS";
  if (/windows/i.test(userAgent)) return "Windows";
  if (/linux/i.test(userAgent)) return "Linux";
  return i18n.t("account.unknownSystem");
}

function buildSessionLabel(session: UserSessionRecord) {
  const userAgent = session.user_agent || "";
  const device = userAgent
    ? `${browserName(userAgent)} · ${operatingSystem(userAgent)}`
    : i18n.t("account.unknownClient");
  return session.ip_address ? `${device} · ${session.ip_address}` : device;
}

function statusLabel(status: string) {
  if (["active", "revoked", "expired"].includes(status)) {
    return i18n.t(`account.status.${status}`);
  }
  return status;
}

function roleLabel(role?: string) {
  if (role === "admin" || role === "user")
    return i18n.t(`account.role.${role}`);
  return role || i18n.t("account.role.user");
}

function workspaceTypeLabel(workspaceType?: string) {
  if (workspaceType === "personal" || workspaceType === "team") {
    return i18n.t(`account.workspaceType.${workspaceType}`);
  }
  return workspaceType || i18n.t("account.workspaceType.unset");
}

export function AccountPage() {
  const { t } = useTranslation();
  const { accessToken, currentSessionId, currentUser, refreshAppData } =
    useAuthSession();
  const { currentWorkspace } = useWorkspaceSession();
  const [revokingSessionId, setRevokingSessionId] = React.useState<
    string | null
  >(null);

  const loadSessions = React.useCallback(async () => {
    if (!accessToken) return { sessions: [] as UserSessionRecord[] };
    return fetchAuthSessions(accessToken, currentWorkspace?.id);
  }, [accessToken, currentWorkspace?.id]);

  const sessionsResource = useApiResource({
    enabled: Boolean(accessToken),
    load: loadSessions,
    errorMessage: t("account.feedback.loadFailed"),
  });
  const sessions = sessionsResource.data?.sessions ?? [];

  if (!currentUser) {
    return (
      <AppPage
        title={t("account.page.title")}
        description={t("account.page.loadingDescription")}
      >
        <DataState
          state="loading"
          empty={false}
          loadingLabel={t("account.page.loadingProfile")}
        >
          <span />
        </DataState>
      </AppPage>
    );
  }

  const displayName = currentUser.display_name || currentUser.email;
  const avatarFallback = buildAvatarFallback(displayName, currentUser.email);
  const accountFacts = [
    { label: t("account.page.email"), value: currentUser.email, wide: true },
    { label: t("account.page.role"), value: roleLabel(currentUser.role) },
    {
      label: t("account.page.phone"),
      value: currentUser.phone || t("account.page.unset"),
    },
    {
      label: t("account.page.workspace"),
      value: currentWorkspace?.name || t("account.page.noWorkspace"),
    },
    {
      label: t("account.page.workspaceType"),
      value: workspaceTypeLabel(currentWorkspace?.workspace_type),
    },
    {
      label: t("account.page.plan"),
      value: currentWorkspace?.plan || t("account.page.unset"),
    },
  ];

  async function handleRevokeSession(sessionId: string) {
    if (!accessToken) return;

    const confirmed = await confirm({
      title: t("account.feedback.revokeTitle"),
      description: t("account.feedback.revokeDescription"),
      confirmLabel: t("account.feedback.revokeConfirm"),
      variant: "destructive",
    });
    if (!confirmed) return;

    setRevokingSessionId(sessionId);
    try {
      await revokeAuthSession(accessToken, sessionId, currentWorkspace?.id);
      await Promise.all([sessionsResource.reload(), refreshAppData()]);
      notify.success({ title: t("account.feedback.revoked") });
    } catch (error) {
      const appError = normalizeAppError(error, {
        fallbackMessage: t("account.feedback.revokeFailed"),
      });
      notify.error({
        title: t("account.feedback.revokeFailedTitle"),
        description: appError.message,
      });
    } finally {
      setRevokingSessionId(null);
    }
  }

  return (
    <AppPage
      title={t("account.page.title")}
      description={t("account.page.description")}
    >
      <Card className="gap-0 overflow-hidden py-0">
        <CardHeader className="flex flex-row flex-wrap items-center gap-4 bg-muted/25 px-5 py-5 md:grid md:grid-cols-[auto_minmax(0,1fr)_auto] md:px-6">
          <Avatar className="size-16 rounded-2xl border border-border/80">
            <AvatarImage src={currentUser.avatar_url || ""} alt={displayName} />
            <AvatarFallback className="rounded-2xl text-lg">
              {avatarFallback}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0 flex-1 md:block">
            <CardTitle className="truncate text-xl">{displayName}</CardTitle>
            <CardDescription className="mt-1 truncate">
              {currentUser.email}
            </CardDescription>
          </div>
          <div className="flex w-full flex-wrap gap-2 pl-20 md:w-auto md:justify-end md:pl-0">
            <StatusBadge
              status={currentUser.status}
              label={statusLabel(currentUser.status)}
            />
            <StatusBadge
              status={currentUser.role || "user"}
              label={roleLabel(currentUser.role)}
              tone="neutral"
            />
          </div>
        </CardHeader>
        <CardContent className="p-5 md:p-6">
          <AppFieldGrid columns={3} className="grid-cols-2">
            {accountFacts.map((fact) => (
              <div
                key={fact.label}
                className={`rounded-lg border bg-muted/20 p-3 ${fact.wide ? "col-span-2 md:col-span-1" : ""}`}
              >
                <p className="text-xs text-muted-foreground">{fact.label}</p>
                <p
                  className="mt-1 truncate text-sm font-medium"
                  title={fact.value}
                >
                  {fact.value}
                </p>
              </div>
            ))}
          </AppFieldGrid>
        </CardContent>
      </Card>

      <Card className="gap-0 py-0">
        <CardHeader className="border-b px-5 py-5 md:px-6">
          <CardTitle className="flex items-center gap-2 text-base">
            <ShieldCheckIcon className="size-4" />
            {t("account.page.devices")}
          </CardTitle>
          <CardDescription className="mt-1">
            {t("account.page.devicesDescription")}
          </CardDescription>
        </CardHeader>
        <CardContent className="p-5 md:p-6">
          <DataState
            state={sessionsResource.state}
            error={sessionsResource.error}
            empty={sessions.length === 0}
            emptyTitle={t("account.page.emptyDevices")}
            emptyDescription={t("account.page.emptyDevicesDescription")}
            loadingLabel={t("account.page.loadingDevices")}
            onRetry={() => void sessionsResource.reload()}
          >
            <div className="grid gap-3">
              {sessions.map((session) => (
                <SessionRow
                  key={session.id}
                  session={session}
                  isCurrent={currentSessionId === session.id}
                  isRevoking={revokingSessionId === session.id}
                  onRevoke={() => void handleRevokeSession(session.id)}
                />
              ))}
            </div>
          </DataState>
        </CardContent>
      </Card>
    </AppPage>
  );
}

function SessionRow({
  session,
  isCurrent,
  isRevoking,
  onRevoke,
}: {
  session: UserSessionRecord;
  isCurrent: boolean;
  isRevoking: boolean;
  onRevoke: () => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="flex flex-col gap-4 rounded-xl border bg-background p-4 md:flex-row md:items-center md:justify-between">
      <div className="flex min-w-0 items-start gap-3">
        <div className="flex size-10 shrink-0 items-center justify-center rounded-lg border bg-muted/50">
          <SessionDeviceIcon userAgent={session.user_agent} />
        </div>
        <div className="min-w-0 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-medium">
              {isCurrent
                ? t("account.session.currentDevice")
                : t("account.session.device")}
            </p>
            {isCurrent ? (
              <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                <BadgeCheckIcon className="size-3.5" />
                {t("account.session.inUse")}
              </span>
            ) : null}
            <StatusBadge
              status={session.status}
              label={statusLabel(session.status)}
            />
          </div>
          <p
            className="truncate text-sm text-muted-foreground"
            title={session.user_agent || undefined}
          >
            {buildSessionLabel(session)}
          </p>
          <p className="text-xs leading-5 text-muted-foreground">
            {t("account.session.lastActive", {
              time: formatTimestamp(session.last_seen_at),
            })}
            <span className="hidden sm:inline">
              {" · "}
              {t("account.session.expiresAt", {
                time: formatTimestamp(session.expires_at),
              })}
            </span>
          </p>
        </div>
      </div>

      <AsyncButton
        type="button"
        variant="outline"
        size="sm"
        onClick={onRevoke}
        isLoading={isRevoking}
        loadingLabel={t("account.session.processing")}
        disabled={isCurrent}
      >
        {isCurrent
          ? t("account.session.currentDevice")
          : t("account.session.revoke")}
      </AsyncButton>
    </div>
  );
}

function SessionDeviceIcon({ userAgent }: { userAgent?: string | null }) {
  if (isMobileUserAgent(userAgent))
    return <SmartphoneIcon className="size-4" />;
  return <LaptopIcon className="size-4" />;
}
