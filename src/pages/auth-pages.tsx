import * as React from "react"
import {
  EyeIcon,
  EyeOffIcon,
  LogInIcon,
  MailCheckIcon,
  UserPlusIcon,
} from "lucide-react"
import { Link, useNavigate } from "react-router-dom"

import { AsyncButton, FormField, FormSection, Notice } from "@/components/app"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { requestEmailVerificationCode } from "@/features/auth/api/auth-api"
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
  verificationCode: string
}

type AuthFieldErrors = Partial<Record<keyof AuthFormState, string>>

const initialFormState: AuthFormState = {
  displayName: "",
  email: "",
  password: "",
  verificationCode: "",
}

function AuthPage({ mode }: AuthPageProps) {
  const navigate = useNavigate()
  const { login, register } = useAppSession()
  const isLogin = mode === "login"
  const [form, setForm] = React.useState<AuthFormState>(initialFormState)
  const [fieldErrors, setFieldErrors] = React.useState<AuthFieldErrors>({})
  const [isSubmitting, setIsSubmitting] = React.useState(false)
  const [isSendingCode, setIsSendingCode] = React.useState(false)
  const [showPassword, setShowPassword] = React.useState(false)
  const [codeCooldownSeconds, setCodeCooldownSeconds] = React.useState(0)
  const [error, setError] = React.useState<string | null>(null)

  React.useEffect(() => {
    if (codeCooldownSeconds <= 0) {
      return
    }
    const timer = window.setTimeout(() => {
      setCodeCooldownSeconds((current) => Math.max(0, current - 1))
    }, 1000)
    return () => window.clearTimeout(timer)
  }, [codeCooldownSeconds])

  function updateField(name: keyof AuthFormState, value: string) {
    setForm((current) => ({ ...current, [name]: value }))
    setFieldErrors((current) => ({ ...current, [name]: undefined }))
    setError(null)
  }

  function validateForm() {
    const nextErrors: AuthFieldErrors = {}

    if (!isLogin && !form.displayName.trim()) {
      nextErrors.displayName = "请输入姓名。"
    }
    if (!form.email.trim()) {
      nextErrors.email = "请输入邮箱地址。"
    }
    if (!form.password) {
      nextErrors.password = "请输入密码。"
    } else if (!isLogin && form.password.length < 8) {
      nextErrors.password = "密码至少需要 8 位。"
    }
    if (!isLogin && !form.verificationCode.trim()) {
      nextErrors.verificationCode = "请输入邮箱验证码。"
    }

    setFieldErrors(nextErrors)
    return Object.keys(nextErrors).length === 0
  }

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    if (!validateForm()) {
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
          email_verification_code: form.verificationCode.trim(),
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

  const handleSendVerificationCode = async () => {
    const email = form.email.trim()

    if (!email) {
      setFieldErrors((current) => ({
        ...current,
        email: "请先输入邮箱地址。",
      }))
      return
    }

    setIsSendingCode(true)
    setError(null)

    try {
      await requestEmailVerificationCode({
        email,
        purpose: "register",
      })
      setCodeCooldownSeconds(60)
      notify.success({
        title: "验证码已发送",
        description: "请查看邮箱并填写 6 位验证码。",
      })
    } catch (sendError) {
      const appError = normalizeAppError(sendError, {
        fallbackMessage: "验证码发送失败。",
      })
      setError(appError.message)
      notify.error({
        title: "验证码发送失败",
        description: appError.message,
      })
    } finally {
      setIsSendingCode(false)
    }
  }

  const SubmitIcon = isLogin ? LogInIcon : UserPlusIcon
  const PasswordIcon = showPassword ? EyeOffIcon : EyeIcon

  return (
    <Card className="gap-0 border-border/80 bg-card/95 py-0 shadow-[0_28px_90px_-44px_rgba(0,0,0,0.5)] backdrop-blur-sm">
      <CardHeader className="gap-2 border-b border-border/70 px-6 py-6 sm:px-7">
        <p className="text-xs font-semibold tracking-[0.18em] text-muted-foreground uppercase">
          {isLogin ? "Welcome back" : "Get started"}
        </p>
        <CardTitle className="text-2xl tracking-tight">
          {isLogin ? "登录 Ineffable" : "创建 Ineffable 账号"}
        </CardTitle>
        <CardDescription className="leading-6">
          {isLogin
            ? "继续进入你的工作区和 AI 会话。"
            : "创建账号，开始使用 Ineffable 工作台。"}
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-5 px-6 py-6 sm:px-7">
        <form className="space-y-5" onSubmit={handleSubmit} noValidate>
          <FormSection className="space-y-4">
            {!isLogin ? (
              <FormField
                htmlFor="auth-name"
                label="姓名"
                error={fieldErrors.displayName}
              >
                <Input
                  id="auth-name"
                  className="h-10 px-3"
                  value={form.displayName}
                  onChange={(event) =>
                    updateField("displayName", event.target.value)
                  }
                  placeholder="你的姓名"
                  autoComplete="name"
                  autoFocus
                  disabled={isSubmitting}
                  aria-invalid={Boolean(fieldErrors.displayName)}
                />
              </FormField>
            ) : null}

            <FormField
              htmlFor="auth-email"
              label="邮箱地址"
              error={fieldErrors.email}
            >
              <Input
                id="auth-email"
                className="h-10 px-3"
                type="email"
                value={form.email}
                onChange={(event) => updateField("email", event.target.value)}
                placeholder="name@company.com"
                autoComplete={isLogin ? "username" : "email"}
                autoFocus={isLogin}
                disabled={isSubmitting}
                aria-invalid={Boolean(fieldErrors.email)}
              />
            </FormField>

            {!isLogin ? (
              <FormField
                htmlFor="auth-verification-code"
                label="邮箱验证码"
                description="验证码有效期为 10 分钟。"
                error={fieldErrors.verificationCode}
              >
                <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
                  <Input
                    id="auth-verification-code"
                    className="h-10 px-3 tracking-[0.2em]"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    value={form.verificationCode}
                    onChange={(event) =>
                      updateField(
                        "verificationCode",
                        event.target.value.replace(/\D/g, "").slice(0, 6),
                      )
                    }
                    placeholder="6 位验证码"
                    disabled={isSubmitting}
                    maxLength={6}
                    aria-invalid={Boolean(fieldErrors.verificationCode)}
                  />
                  <AsyncButton
                    type="button"
                    variant="outline"
                    className="h-10"
                    isLoading={isSendingCode}
                    loadingLabel="发送中..."
                    disabled={
                      isSubmitting || isSendingCode || codeCooldownSeconds > 0
                    }
                    onClick={handleSendVerificationCode}
                  >
                    <MailCheckIcon />
                    {codeCooldownSeconds > 0
                      ? `${codeCooldownSeconds}s 后重试`
                      : "发送验证码"}
                  </AsyncButton>
                </div>
              </FormField>
            ) : null}

            <FormField
              htmlFor="auth-password"
              label="密码"
              description={isLogin ? undefined : "至少 8 位。"}
              error={fieldErrors.password}
            >
              <div className="relative">
                <Input
                  id="auth-password"
                  className="h-10 px-3 pr-11"
                  type={showPassword ? "text" : "password"}
                  value={form.password}
                  onChange={(event) =>
                    updateField("password", event.target.value)
                  }
                  placeholder="输入密码"
                  autoComplete={isLogin ? "current-password" : "new-password"}
                  disabled={isSubmitting}
                  aria-invalid={Boolean(fieldErrors.password)}
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  className="absolute top-1/2 right-1.5 -translate-y-1/2 text-muted-foreground"
                  onClick={() => setShowPassword((current) => !current)}
                  aria-label={showPassword ? "隐藏密码" : "显示密码"}
                  title={showPassword ? "隐藏密码" : "显示密码"}
                  disabled={isSubmitting}
                >
                  <PasswordIcon />
                </Button>
              </div>
            </FormField>
          </FormSection>

          {error ? <Notice tone="error">{error}</Notice> : null}

          <AsyncButton
            type="submit"
            size="lg"
            className="h-10 w-full"
            isLoading={isSubmitting}
            loadingLabel={isLogin ? "登录中..." : "创建中..."}
          >
            <SubmitIcon />
            {isLogin ? "登录" : "创建账号"}
          </AsyncButton>
        </form>

        <p className="border-t pt-5 text-center text-sm leading-6 text-muted-foreground">
          {isLogin ? "还没有账号？" : "已经有账号？"}{" "}
          <Link
            className="font-medium text-foreground underline underline-offset-4"
            to={isLogin ? "/register" : "/login"}
          >
            {isLogin ? "创建账号" : "返回登录"}
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
