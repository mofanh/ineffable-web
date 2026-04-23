import * as React from "react"

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Separator } from "@/components/ui/separator"
import { Switch } from "@/components/ui/switch"
import { useAppSession } from "@/contexts/app-session"
import {
  fetchAuthSessions,
  revokeAuthSession,
  type UserSessionRecord,
} from "@/lib/api/gateway-client"
import {
  BadgeCheckIcon,
  BellIcon,
  LaptopIcon,
  ShieldCheckIcon,
  SmartphoneIcon,
} from "lucide-react"

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

function detectDeviceIcon(userAgent?: string | null) {
  const ua = (userAgent || "").toLowerCase()
  if (ua.includes("iphone") || ua.includes("android") || ua.includes("mobile")) {
    return SmartphoneIcon
  }

  return LaptopIcon
}

function buildSessionLabel(session: UserSessionRecord) {
  const userAgent = session.user_agent || "未知客户端"
  const trimmedAgent = userAgent.length > 56 ? `${userAgent.slice(0, 56)}...` : userAgent
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

  const [sessions, setSessions] = React.useState<UserSessionRecord[]>([])
  const [sessionsError, setSessionsError] = React.useState<string | null>(null)
  const [isLoadingSessions, setIsLoadingSessions] = React.useState(false)
  const [revokingSessionId, setRevokingSessionId] = React.useState<string | null>(null)

  const loadSessions = React.useCallback(async () => {
    if (!accessToken) {
      setSessions([])
      return
    }

    setIsLoadingSessions(true)
    setSessionsError(null)

    try {
      const response = await fetchAuthSessions(accessToken, currentWorkspace?.id)
      setSessions(response.sessions)
    } catch (error) {
      setSessionsError(error instanceof Error ? error.message : "加载登录会话失败。")
    } finally {
      setIsLoadingSessions(false)
    }
  }, [accessToken, currentWorkspace?.id])

  React.useEffect(() => {
    void loadSessions()
  }, [loadSessions])

  if (!currentUser) {
    return (
      <div className="flex min-h-[320px] items-center justify-center text-sm text-muted-foreground">
        正在加载账号资料…
      </div>
    )
  }

  const displayName = currentUser.display_name || currentUser.email
  const avatarFallback = buildAvatarFallback(displayName, currentUser.email)

  async function handleRevokeSession(sessionId: string) {
    if (!accessToken) {
      return
    }

    setRevokingSessionId(sessionId)
    setSessionsError(null)

    try {
      await revokeAuthSession(accessToken, sessionId, currentWorkspace?.id)
      await Promise.all([loadSessions(), refreshAppData()])
    } catch (error) {
      setSessionsError(error instanceof Error ? error.message : "吊销会话失败。")
    } finally {
      setRevokingSessionId(null)
    }
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
        <Card className="bg-muted/35">
          <CardHeader className="gap-4 md:grid-cols-[auto_1fr_auto] md:items-center">
            <Avatar className="size-16 rounded-2xl border border-border/80">
              <AvatarImage src={currentUser.avatar_url || ""} alt={displayName} />
              <AvatarFallback className="rounded-2xl">{avatarFallback}</AvatarFallback>
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
          <CardContent className="space-y-6">
            <FieldGroup>
              <div className="grid gap-4 md:grid-cols-2">
                <Field>
                  <FieldLabel htmlFor="account-name">显示名称</FieldLabel>
                  <FieldContent>
                    <Input id="account-name" value={displayName} readOnly />
                    <FieldDescription>当前直接读取 `/auth/me` 返回的用户资料。</FieldDescription>
                  </FieldContent>
                </Field>
                <Field>
                  <FieldLabel htmlFor="account-phone">联系电话</FieldLabel>
                  <FieldContent>
                    <Input
                      id="account-phone"
                      value={currentUser.phone || "未设置"}
                      readOnly
                    />
                    <FieldDescription>后续可接真实资料更新接口。</FieldDescription>
                  </FieldContent>
                </Field>
              </div>

              <Field>
                <FieldLabel htmlFor="account-email">登录邮箱</FieldLabel>
                <FieldContent>
                  <Input id="account-email" type="email" value={currentUser.email} readOnly />
                  <FieldDescription>当前账号主标识。</FieldDescription>
                </FieldContent>
              </Field>

              <Field>
                <FieldLabel htmlFor="account-workspace">当前 Workspace</FieldLabel>
                <FieldContent>
                  <Input
                    id="account-workspace"
                    value={currentWorkspace?.name || "未绑定"}
                    readOnly
                  />
                  <FieldDescription>Workspace 信息来自当前登录上下文。</FieldDescription>
                </FieldContent>
              </Field>
            </FieldGroup>
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Card className="bg-muted/35">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <ShieldCheckIcon className="size-4" />
                安全设置
              </CardTitle>
              <CardDescription>账号保护项和登录策略。</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="font-medium">双重验证</p>
                  <p className="text-sm leading-6 text-muted-foreground">
                    当前仅保留前端占位，后续接真实安全接口。
                  </p>
                </div>
                <Switch checked={false} disabled />
              </div>
              <Separator />
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="font-medium">陌生设备提醒</p>
                  <p className="text-sm leading-6 text-muted-foreground">
                    当前会话列表已接通，可作为风控基础数据来源。
                  </p>
                </div>
                <Switch checked disabled />
              </div>
              <Separator />
              <Button variant="outline" className="w-full" disabled>
                密码修改接口待接入
              </Button>
            </CardContent>
          </Card>

          <Card className="bg-muted/35">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <BellIcon className="size-4" />
                通知偏好
              </CardTitle>
              <CardDescription>账号级别通知和审批提醒。</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="font-medium">邮件通知</p>
                  <p className="text-sm leading-6 text-muted-foreground">
                    后续可与 workspace 邀请、账单和权限变更联动。
                  </p>
                </div>
                <Switch checked disabled />
              </div>
              <Separator />
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="font-medium">产品内提醒</p>
                  <p className="text-sm leading-6 text-muted-foreground">
                    当前为静态配置位，待接偏好保存接口。
                  </p>
                </div>
                <Switch checked disabled />
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      <Card className="bg-muted/35">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <BadgeCheckIcon className="size-4" />
            登录会话
          </CardTitle>
          <CardDescription>当前直接读取 `/auth/sessions` 返回的真实会话列表。</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {sessionsError ? (
            <p className="text-sm text-destructive">{sessionsError}</p>
          ) : null}

          {isLoadingSessions ? (
            <p className="text-sm text-muted-foreground">正在加载登录会话…</p>
          ) : sessions.length === 0 ? (
            <p className="text-sm text-muted-foreground">当前没有可展示的登录会话。</p>
          ) : (
            <div className="grid gap-3">
              {sessions.map((session) => {
                const DeviceIcon = detectDeviceIcon(session.user_agent)
                const isCurrent = currentSessionId === session.id

                return (
                  <div
                    key={session.id}
                    className="flex flex-col gap-4 rounded-2xl border border-border/70 bg-background/80 p-4 md:flex-row md:items-center md:justify-between"
                  >
                    <div className="flex items-start gap-3">
                      <div className="flex size-10 items-center justify-center rounded-2xl bg-muted text-foreground">
                        <DeviceIcon className="size-4" />
                      </div>
                      <div className="space-y-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="font-medium">
                            {isCurrent ? "当前会话" : "历史会话"}
                          </p>
                          <span className="rounded-full border border-border px-2 py-0.5 text-[11px] text-muted-foreground">
                            {session.status}
                          </span>
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

                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          void handleRevokeSession(session.id)
                        }}
                        disabled={revokingSessionId === session.id || isCurrent}
                      >
                        {revokingSessionId === session.id ? "处理中..." : isCurrent ? "当前会话" : "吊销"}
                      </Button>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
