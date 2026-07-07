import * as React from "react"
import {
  BadgeCheckIcon,
  BellIcon,
  LaptopIcon,
  ShieldCheckIcon,
  SmartphoneIcon,
} from "lucide-react"

import {
  AppPage,
  AsyncButton,
  DataState,
  FormField,
  FormSection,
  Notice,
  StatusBadge,
} from "@/components/app"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Separator } from "@/components/ui/separator"
import { Switch } from "@/components/ui/switch"
import { useAppSession } from "@/features/auth/app-session"
import {
  fetchAuthSessions,
  revokeAuthSession,
  type UserSessionRecord,
} from "@/features/auth/api/auth-api"
import { normalizeAppError } from "@/lib/app/api-errors"
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
  if (!value) {
    return "未知"
  }

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return value
  }

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

function buildSessionLabel(session: UserSessionRecord) {
  const userAgent = session.user_agent || "未知客户端"
  const trimmedAgent =
    userAgent.length > 56 ? `${userAgent.slice(0, 56)}...` : userAgent
  const ip = session.ip_address ? ` · ${session.ip_address}` : ""
  return `${trimmedAgent}${ip}`
}

export function AccountPage() {
  const {
    accessToken,
    currentSessionId,
    currentUser,
    currentWorkspace,
    refreshAppData,
  } = useAppSession()
  const [actionError, setActionError] = React.useState<string | null>(null)
  const [revokingSessionId, setRevokingSessionId] = React.useState<string | null>(
    null
  )

  const loadSessions = React.useCallback(async () => {
    if (!accessToken) {
      return { sessions: [] as UserSessionRecord[] }
    }

    return fetchAuthSessions(accessToken, currentWorkspace?.id)
  }, [accessToken, currentWorkspace?.id])

  const sessionsResource = useApiResource({
    enabled: Boolean(accessToken),
    load: loadSessions,
    errorMessage: "加载登录会话失败。",
  })
  const sessions = sessionsResource.data?.sessions ?? []

  const displayName = currentUser?.display_name || currentUser?.email || ""
  const avatarFallback = buildAvatarFallback(displayName, currentUser?.email || "")

  async function handleRevokeSession(sessionId: string) {
    if (!accessToken) {
      return
    }

    setRevokingSessionId(sessionId)
    setActionError(null)

    try {
      await revokeAuthSession(accessToken, sessionId, currentWorkspace?.id)
      await Promise.all([sessionsResource.reload(), refreshAppData()])
      notify.success({ title: "登录会话已吊销" })
    } catch (error) {
      const appError = normalizeAppError(error, {
        fallbackMessage: "吊销会话失败。",
      })
      setActionError(appError.message)
      notify.error({
        title: "吊销会话失败",
        description: appError.message,
      })
    } finally {
      setRevokingSessionId(null)
    }
  }

  if (!currentUser) {
    return (
      <AppPage title="账号设置" description="正在读取当前登录用户和工作区上下文。">
        <DataState state="loading" empty={false}>正在加载账号资料…</DataState>
      </AppPage>
    )
  }

  return (
    <AppPage
      title="账号设置"
      description="管理当前账号资料、登录会话和安全偏好。"
    >
      <div className="grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
        <Card className="bg-muted/35">
          <CardHeader className="gap-4 md:grid md:grid-cols-[auto_1fr_auto] md:items-center">
            <Avatar className="size-16 rounded-2xl border border-border/80">
              <AvatarImage src={currentUser.avatar_url || ""} alt={displayName} />
              <AvatarFallback className="rounded-2xl">
                {avatarFallback}
              </AvatarFallback>
            </Avatar>
            <div>
              <CardTitle className="text-xl">{displayName}</CardTitle>
              <CardDescription className="mt-1">
                {currentWorkspace?.name || "未选择 Workspace"} · {currentUser.email}
              </CardDescription>
            </div>
            <Button size="lg" className="md:justify-self-end" disabled>
              暂未开放资料修改
            </Button>
          </CardHeader>
          <CardContent>
            <FormSection>
              <div className="grid gap-4 md:grid-cols-2">
                <FormField
                  label="显示名称"
                  description="当前直接读取 /auth/me 返回的用户资料。"
                >
                  <Input id="account-name" value={displayName} readOnly />
                </FormField>
                <FormField
                  label="联系电话"
                  description="后续可接真实资料更新接口。"
                >
                  <Input
                    id="account-phone"
                    value={currentUser.phone || "未设置"}
                    readOnly
                  />
                </FormField>
              </div>

              <FormField label="登录邮箱" description="当前账号主标识。">
                <Input
                  id="account-email"
                  type="email"
                  value={currentUser.email}
                  readOnly
                />
              </FormField>

              <FormField
                label="当前 Workspace"
                description="Workspace 信息来自当前登录上下文。"
              >
                <Input
                  id="account-workspace"
                  value={currentWorkspace?.name || "未绑定"}
                  readOnly
                />
              </FormField>
            </FormSection>
          </CardContent>
        </Card>

        <div className="space-y-4">
          <PreferenceCard
            icon={ShieldCheckIcon}
            title="安全设置"
            description="账号保护项和登录策略。"
            items={[
              {
                label: "双重验证",
                description: "当前仅保留前端占位，后续接真实安全接口。",
                checked: false,
                disabled: true,
              },
              {
                label: "陌生设备提醒",
                description: "当前会话列表已接通，可作为风控基础数据来源。",
                checked: true,
                disabled: true,
              },
            ]}
            footer={
              <Button variant="outline" className="w-full" disabled>
                密码修改接口待接入
              </Button>
            }
          />

          <PreferenceCard
            icon={BellIcon}
            title="通知偏好"
            description="账号级别通知和审批提醒。"
            items={[
              {
                label: "邮件通知",
                description: "后续可与 workspace 邀请、账单和权限变更联动。",
                checked: true,
                disabled: true,
              },
              {
                label: "产品内提醒",
                description: "当前为静态配置位，待接偏好保存接口。",
                checked: true,
                disabled: true,
              },
            ]}
          />
        </div>
      </div>

      {actionError ? <Notice tone="error">{actionError}</Notice> : null}

      <Card className="bg-muted/35">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <BadgeCheckIcon className="size-4" />
            登录会话
          </CardTitle>
          <CardDescription>
            当前直接读取 /auth/sessions 返回的真实会话列表。
          </CardDescription>
        </CardHeader>
        <CardContent>
          <DataState
            state={sessionsResource.state}
            error={sessionsResource.error}
            empty={sessions.length === 0}
            emptyTitle="当前没有可展示的登录会话。"
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

function PreferenceCard({
  icon: Icon,
  title,
  description,
  items,
  footer,
}: {
  icon: React.ComponentType<{ className?: string }>
  title: string
  description: string
  items: Array<{
    label: string
    description: string
    checked: boolean
    disabled?: boolean
  }>
  footer?: React.ReactNode
}) {
  return (
    <Card className="bg-muted/35">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Icon className="size-4" />
          {title}
        </CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {items.map((item, index) => (
          <React.Fragment key={item.label}>
            {index > 0 ? <Separator /> : null}
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="font-medium">{item.label}</p>
                <p className="text-sm leading-6 text-muted-foreground">
                  {item.description}
                </p>
              </div>
              <Switch checked={item.checked} disabled={item.disabled} />
            </div>
          </React.Fragment>
        ))}
        {footer ? (
          <>
            <Separator />
            {footer}
          </>
        ) : null}
      </CardContent>
    </Card>
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
    <div className="flex flex-col gap-4 rounded-lg border border-border/70 bg-background/80 p-4 md:flex-row md:items-center md:justify-between">
      <div className="flex items-start gap-3">
        <div className="flex size-10 items-center justify-center rounded-md bg-muted text-foreground">
          <SessionDeviceIcon userAgent={session.user_agent} />
        </div>
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-medium">{isCurrent ? "当前会话" : "历史会话"}</p>
            <StatusBadge status={session.status} />
          </div>
          <p className="text-sm leading-6 text-muted-foreground">
            {buildSessionLabel(session)}
          </p>
          <p className="text-xs leading-5 text-muted-foreground">
            最近活跃：{formatTimestamp(session.last_seen_at)}
            {" · "}
            过期时间：{formatTimestamp(session.expires_at)}
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
        {isCurrent ? "当前会话" : "吊销"}
      </AsyncButton>
    </div>
  )
}

function SessionDeviceIcon({ userAgent }: { userAgent?: string | null }) {
  if (isMobileUserAgent(userAgent)) {
    return <SmartphoneIcon className="size-4" />
  }

  return <LaptopIcon className="size-4" />
}
