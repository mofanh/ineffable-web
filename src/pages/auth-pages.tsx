import * as React from "react"

import { IneffableLogo } from "@/components/ineffable-logo"
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
import { useAppSession } from "@/features/auth/app-session"
import { CheckCircle2Icon } from "lucide-react"
import { Link, useNavigate } from "react-router-dom"

type AuthPageProps = {
  mode: "login" | "register"
}

function AuthPage({ mode }: AuthPageProps) {
  const navigate = useNavigate()
  const { login, register } = useAppSession()
  const isLogin = mode === "login"

  const [displayName, setDisplayName] = React.useState("")
  const [email, setEmail] = React.useState("")
  const [password, setPassword] = React.useState("")
  const [company, setCompany] = React.useState("")
  const [isSubmitting, setIsSubmitting] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    if (!email.trim() || !password.trim()) {
      setError("请先填写邮箱和密码。")
      return
    }

    if (!isLogin && !displayName.trim()) {
      setError("请先填写显示名称。")
      return
    }

    setIsSubmitting(true)
    setError(null)

    try {
      if (isLogin) {
        await login({
          email: email.trim(),
          password,
        })
      } else {
        await register({
          email: email.trim(),
          display_name: displayName.trim(),
          password,
        })
      }

      navigate("/", { replace: true })
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "请求失败。")
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <Card className="border-border/80 bg-background/95 py-0 shadow-[0_24px_80px_-32px_rgba(15,23,42,0.45)] backdrop-blur-sm">
      <CardHeader className="border-b border-border/70 px-6 py-6">
        <div className="mb-5 flex items-center justify-between">
          <div className="rounded-2xl border border-border/80 bg-muted/70 px-3 py-2">
            <IneffableLogo className="h-7" showText={false} />
          </div>
          <span className="rounded-full border border-border/70 px-3 py-1 text-xs font-medium text-muted-foreground">
            {isLogin ? "Sign in" : "Create account"}
          </span>
        </div>
        <CardTitle className="text-2xl">
          {isLogin ? "登录 Ineffable" : "创建你的 Ineffable 账号"}
        </CardTitle>
        <CardDescription className="leading-6">
          {isLogin
            ? "使用工作邮箱继续进入协作控制台。"
            : "完成基础信息后即可进入平台，后续可在账号页完善资料与安全设置。"}
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-6 px-6 py-6">
        <form className="space-y-5" onSubmit={handleSubmit}>
          <FieldGroup>
            {!isLogin ? (
              <Field>
                <FieldLabel htmlFor="auth-name">姓名</FieldLabel>
                <FieldContent>
                  <Input
                    id="auth-name"
                    value={displayName}
                    onChange={(event) => setDisplayName(event.target.value)}
                    placeholder="例如：Chen N."
                    disabled={isSubmitting}
                  />
                  <FieldDescription>将用于团队内展示和审批记录。</FieldDescription>
                </FieldContent>
              </Field>
            ) : null}

            <Field>
              <FieldLabel htmlFor="auth-email">邮箱地址</FieldLabel>
              <FieldContent>
                <Input
                  id="auth-email"
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="you@ineffable.ai"
                  disabled={isSubmitting}
                />
                <FieldDescription>建议使用工作邮箱，方便加入团队空间。</FieldDescription>
              </FieldContent>
            </Field>

            <Field>
              <FieldLabel htmlFor="auth-password">密码</FieldLabel>
              <FieldContent>
                <Input
                  id="auth-password"
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder={isLogin ? "输入登录密码" : "至少 8 位，包含字母和数字"}
                  disabled={isSubmitting}
                />
                <FieldDescription>
                  {isLogin
                    ? "支持后续接入单点登录或二步验证。"
                    : "密码强度规则可在后端接入时扩展。"}
                </FieldDescription>
              </FieldContent>
            </Field>

            {!isLogin ? (
              <Field>
                <FieldLabel htmlFor="auth-company">团队 / 公司</FieldLabel>
                <FieldContent>
                  <Input
                    id="auth-company"
                    value={company}
                    onChange={(event) => setCompany(event.target.value)}
                    placeholder="Ineffable Studio"
                    disabled={isSubmitting}
                  />
                  <FieldDescription>当前仅保留前端展示，后续可映射到 workspace。</FieldDescription>
                </FieldContent>
              </Field>
            ) : null}
          </FieldGroup>

          {error ? <p className="text-sm text-destructive">{error}</p> : null}

          <Button type="submit" size="lg" className="w-full" disabled={isSubmitting}>
            {isSubmitting
              ? isLogin
                ? "登录中..."
                : "创建中..."
              : isLogin
                ? "登录并进入控制台"
                : "创建账号"}
          </Button>
        </form>

        <div className="rounded-2xl border border-border/70 bg-muted/50 p-4">
          <div className="mb-3 flex items-center gap-2">
            <CheckCircle2Icon className="size-4 text-emerald-600" />
            <p className="text-sm font-medium">已接入真实账号会话</p>
          </div>
          <p className="text-sm leading-6 text-muted-foreground">
            当前表单会直接调用网关鉴权接口，并在登录后自动初始化用户 workspace 上下文。
          </p>
        </div>

        <p className="text-center text-sm leading-6 text-muted-foreground">
          {isLogin ? "还没有账号？" : "已经有账号？"}{" "}
          <Link
            className="font-medium text-foreground underline underline-offset-4"
            to={isLogin ? "/register" : "/login"}
          >
            {isLogin ? "去注册" : "去登录"}
          </Link>
        </p>
      </CardContent>
    </Card>
  )
}

export function LoginPage() {
  return <AuthPage mode="login" />
}

export function RegisterPage() {
  return <AuthPage mode="register" />
}
