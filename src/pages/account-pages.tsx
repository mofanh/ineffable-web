import * as React from "react"
import {
  BadgeCheckIcon,
  LaptopIcon,
  ShieldCheckIcon,
  SmartphoneIcon,
} from "lucide-react"

import {
  AppFieldGrid,
  AppPage,
  AsyncButton,
  DataState,
  StatusBadge,
} from "@/components/app"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { useAppSession } from "@/features/auth/app-session"
import {
  fetchAuthSessions,
  revokeAuthSession,
  type UserSessionRecord,
} from "@/features/auth/api/auth-api"
import { normalizeAppError } from "@/lib/app/api-errors"
import { confirm } from "@/lib/app/confirm"
import { notify } from "@/lib/app/notifications"
import { useApiResource } from "@/lib/app/use-api-resource"

function buildAvatarFallback(name: string, email: string) {
  const base = name || email || "IU"
  return base
    .split(" ")
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase()
}

function formatTimestamp(value?: string | null) {
  if (!value) return "未知"

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value

  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date)
}

function isMobileUserAgent(userAgent?: string | null) {
  const ua = (userAgent || "").toLowerCase()
  return ua.includes("iphone") || ua.includes("android") || ua.includes("mobile")
}

function browserName(userAgent: string) {
  if (/edg\//i.test(userAgent)) return "Microsoft Edge"
  if (/firefox\//i.test(userAgent)) return "Firefox"
  if (/chrome\//i.test(userAgent)) return "Chrome"
  if (/safari\//i.test(userAgent)) return "Safari"
  return "未知浏览器"
}

function operatingSystem(userAgent: string) {
  if (/iphone|ipad/i.test(userAgent)) return "iOS"
  if (/android/i.test(userAgent)) return "Android"
  if (/macintosh|mac os x/i.test(userAgent)) return "macOS"
  if (/windows/i.test(userAgent)) return "Windows"
  if (/linux/i.test(userAgent)) return "Linux"
  return "未知系统"
}

function buildSessionLabel(session: UserSessionRecord) {
  const userAgent = session.user_agent || ""
  const device = userAgent
    ? `${browserName(userAgent)} · ${operatingSystem(userAgent)}`
    : "未知客户端"
  return session.ip_address ? `${device} · ${session.ip_address}` : device
}

function statusLabel(status: string) {
  if (status === "active") return "正常"
  if (status === "revoked") return "已吊销"
  if (status === "expired") return "已过期"
  return status
}

function roleLabel(role?: string) {
  if (role === "admin") return "管理员"
  if (role === "user") return "用户"
  return role || "用户"
}

function workspaceTypeLabel(workspaceType?: string) {
  if (workspaceType === "personal") return "个人空间"
  if (workspaceType === "team") return "团队空间"
  return workspaceType || "未设置"
}

export function AccountPage() {
  const {
    accessToken,
    currentSessionId,
    currentUser,
    currentWorkspace,
    refreshAppData,
  } = useAppSession()
  const [revokingSessionId, setRevokingSessionId] = React.useState<string | null>(
    null,
  )

  const loadSessions = React.useCallback(async () => {
    if (!accessToken) return { sessions: [] as UserSessionRecord[] }
    return fetchAuthSessions(accessToken, currentWorkspace?.id)
  }, [accessToken, currentWorkspace?.id])

  const sessionsResource = useApiResource({
    enabled: Boolean(accessToken),
    load: loadSessions,
    errorMessage: "加载登录会话失败。",
  })
  const sessions = sessionsResource.data?.sessions ?? []

  if (!currentUser) {
    return (
      <AppPage title="账号" description="查看账号身份与登录设备。">
        <DataState state="loading" empty={false} loadingLabel="正在加载账号资料">
          <span />
        </DataState>
      </AppPage>
    )
  }

  const displayName = currentUser.display_name || currentUser.email
  const avatarFallback = buildAvatarFallback(displayName, currentUser.email)
  const accountFacts = [
    { label: "登录邮箱", value: currentUser.email, wide: true },
    { label: "账号角色", value: roleLabel(currentUser.role) },
    { label: "联系电话", value: currentUser.phone || "未设置" },
    { label: "当前工作区", value: currentWorkspace?.name || "未选择" },
    {
      label: "空间类型",
      value: workspaceTypeLabel(currentWorkspace?.workspace_type),
    },
    { label: "当前套餐", value: currentWorkspace?.plan || "未设置" },
  ]

  async function handleRevokeSession(sessionId: string) {
    if (!accessToken) return

    const confirmed = await confirm({
      title: "吊销这个登录会话？",
      description: "该设备需要重新登录才能继续访问 Ineffable。",
      confirmLabel: "吊销会话",
      variant: "destructive",
    })
    if (!confirmed) return

    setRevokingSessionId(sessionId)
    try {
      await revokeAuthSession(accessToken, sessionId, currentWorkspace?.id)
      await Promise.all([sessionsResource.reload(), refreshAppData()])
      notify.success({ title: "登录会话已吊销" })
    } catch (error) {
      const appError = normalizeAppError(error, {
        fallbackMessage: "吊销会话失败。",
      })
      notify.error({
        title: "吊销会话失败",
        description: appError.message,
      })
    } finally {
      setRevokingSessionId(null)
    }
  }

  return (
    <AppPage title="账号" description="查看账号身份、当前工作区和登录设备。">
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
                <p className="mt-1 truncate text-sm font-medium" title={fact.value}>
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
            登录设备
          </CardTitle>
          <CardDescription className="mt-1">
            查看当前账号的有效会话，并吊销不再使用的设备。
          </CardDescription>
        </CardHeader>
        <CardContent className="p-5 md:p-6">
          <DataState
            state={sessionsResource.state}
            error={sessionsResource.error}
            empty={sessions.length === 0}
            emptyTitle="没有可展示的登录会话"
            emptyDescription="新的登录设备会在这里出现。"
            loadingLabel="正在加载登录设备"
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
  )
}

function SessionRow({
  session,
  isCurrent,
  isRevoking,
  onRevoke,
}: {
  session: UserSessionRecord
  isCurrent: boolean
  isRevoking: boolean
  onRevoke: () => void
}) {
  return (
    <div className="flex flex-col gap-4 rounded-xl border bg-background p-4 md:flex-row md:items-center md:justify-between">
      <div className="flex min-w-0 items-start gap-3">
        <div className="flex size-10 shrink-0 items-center justify-center rounded-lg border bg-muted/50">
          <SessionDeviceIcon userAgent={session.user_agent} />
        </div>
        <div className="min-w-0 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-medium">{isCurrent ? "当前设备" : "登录设备"}</p>
            {isCurrent ? (
              <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                <BadgeCheckIcon className="size-3.5" />
                正在使用
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
            最近活跃：{formatTimestamp(session.last_seen_at)}
            <span className="hidden sm:inline">
              {" · "}过期时间：{formatTimestamp(session.expires_at)}
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
        loadingLabel="处理中..."
        disabled={isCurrent}
      >
        {isCurrent ? "当前设备" : "吊销"}
      </AsyncButton>
    </div>
  )
}

function SessionDeviceIcon({ userAgent }: { userAgent?: string | null }) {
  if (isMobileUserAgent(userAgent)) return <SmartphoneIcon className="size-4" />
  return <LaptopIcon className="size-4" />
}
