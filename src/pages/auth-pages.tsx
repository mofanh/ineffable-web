import * as React from "react"
import { CheckCircle2Icon, LogInIcon, UserPlusIcon } from "lucide-react"
import { Link, useNavigate } from "react-router-dom"

import { AsyncButton, FormField, FormSection, Notice } from "@/components/app"
import { IneffableLogo } from "@/components/ineffable-logo"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { useAppSession } from "@/features/auth/app-session"
import { normalizeAppError } from "@/lib/app/api-errors"
import { notify } from "@/lib/app/notifications"

type AuthPageProps = {
  mode: "login" | "register"
}

type AuthFormState = {
  displayName: string
  email: string
  password: string
  company: string
}

const initialFormState: AuthFormState = {
  displayName: "",
  email: "",
  password: "",
  company: "",
}

function AuthPage({ mode }: AuthPageProps) {
  const navigate = useNavigate()
  const { login, register } = useAppSession()
  const isLogin = mode === "login"
  const [form, setForm] = React.useState<AuthFormState>(initialFormState)
  const [isSubmitting, setIsSubmitting] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  function updateField(name: keyof AuthFormState, value: string) {
    setForm((current) => ({ ...current, [name]: value }))
  }

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    if (!form.email.trim() || !form.password.trim()) {
      setError("请先填写邮箱和密码。")
      return
    }

    if (!isLogin && !form.displayName.trim()) {
      setError("请先填写显示名称。")
      return
    }

    setIsSubmitting(true)
    setError(null)

    try {
      if (isLogin) {
        await login({
          email: form.email.trim(),
          password: form.password,
        })
      } else {
        await register({
          email: form.email.trim(),
          display_name: form.displayName.trim(),
          password: form.password,
        })
      }

      notify.success({
        title: isLogin ? "登录成功" : "账号已创建",
        description: "正在进入工作台。",
      })
      navigate("/", { replace: true })
    } catch (submitError) {
      const appError = normalizeAppError(submitError, {
        fallbackMessage: isLogin ? "登录失败。" : "注册失败。",
      })
      setError(appError.message)
      notify.error({
        title: isLogin ? "登录失败" : "注册失败",
        description: appError.message,
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  const SubmitIcon = isLogin ? LogInIcon : UserPlusIcon

  return (
    <Card className="border-border/80 bg-background/95 py-0 shadow-[0_24px_80px_-32px_rgba(15,23,42,0.45)] backdrop-blur-sm">
      <CardHeader className="border-b border-border/70 px-6 py-6">
        <div className="mb-5 flex items-center justify-between">
          <div className="rounded-md border border-border/80 bg-muted/70 px-3 py-2">
            <IneffableLogo className="h-7" showText={false} />
          </div>
          <span className="rounded-full border border-border/70 px-3 py-1 text-xs font-medium text-muted-foreground">
            {isLogin ? "Sign in" : "Create account"}
          </span>
        </div>
        <CardTitle className="text-2xl">
          {isLogin ? "登录 Ineffable" : "创建 Ineffable 账号"}
        </CardTitle>
        <CardDescription className="leading-6">
          {isLogin
            ? "使用工作邮箱进入协作控制台。"
            : "完成基础信息后进入平台，后续可在账号页完善资料与安全设置。"}
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-6 px-6 py-6">
        <form className="space-y-5" onSubmit={handleSubmit}>
          <FormSection>
            {!isLogin ? (
              <FormField
                label="姓名"
                description="将用于团队内展示和审批记录。"
              >
                <Input
                  id="auth-name"
                  value={form.displayName}
                  onChange={(event) => updateField("displayName", event.target.value)}
                  placeholder="例如：Chen N."
                  disabled={isSubmitting}
                />
              </FormField>
            ) : null}

            <FormField
              label="邮箱地址"
              description="建议使用工作邮箱，方便加入团队空间。"
            >
              <Input
                id="auth-email"
                type="email"
                value={form.email}
                onChange={(event) => updateField("email", event.target.value)}
                placeholder="you@ineffable.ai"
                disabled={isSubmitting}
              />
            </FormField>

            <FormField
              label="密码"
              description={
                isLogin
                  ? "支持后续接入单点登录或二步验证。"
                  : "密码强度规则可在后端接入时扩展。"
              }
            >
              <Input
                id="auth-password"
                type="password"
                value={form.password}
                onChange={(event) => updateField("password", event.target.value)}
                placeholder={isLogin ? "输入登录密码" : "至少 8 位，包含字母和数字"}
                disabled={isSubmitting}
              />
            </FormField>

            {!isLogin ? (
              <FormField
                label="团队 / 公司"
                description="当前仅保留前端展示，后续可映射到 workspace。"
              >
                <Input
                  id="auth-company"
                  value={form.company}
                  onChange={(event) => updateField("company", event.target.value)}
                  placeholder="Ineffable Studio"
                  disabled={isSubmitting}
                />
              </FormField>
            ) : null}
          </FormSection>

          {error ? <Notice tone="error">{error}</Notice> : null}

          <AsyncButton
            type="submit"
            size="lg"
            className="w-full"
            isLoading={isSubmitting}
            loadingLabel={isLogin ? "登录中..." : "创建中..."}
          >
            <SubmitIcon />
            {isLogin ? "登录并进入控制台" : "创建账号"}
          </AsyncButton>
        </form>

        <Notice tone="success">
          <div className="flex items-center gap-2">
            <CheckCircle2Icon className="size-4" />
            <span className="font-medium">已接入真实账号会话</span>
          </div>
          <p className="mt-2 leading-6">
            当前表单会直接调用网关鉴权接口，并在登录后自动初始化用户 workspace 上下文。
          </p>
        </Notice>

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
