import * as React from "react"
import {
  EyeIcon,
  EyeOffIcon,
  LogInIcon,
  MailCheckIcon,
  UserPlusIcon,
} from "lucide-react"
import { useTranslation } from "react-i18next"
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
  const { t } = useTranslation()
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
      nextErrors.displayName = t("auth.validation.nameRequired")
    }
    if (!form.email.trim()) {
      nextErrors.email = t("auth.validation.emailRequired")
    }
    if (!form.password) {
      nextErrors.password = t("auth.validation.passwordRequired")
    } else if (!isLogin && form.password.length < 8) {
      nextErrors.password = t("auth.validation.passwordTooShort")
    }
    if (!isLogin && !form.verificationCode.trim()) {
      nextErrors.verificationCode = t("auth.validation.codeRequired")
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
        title: isLogin
          ? t("auth.feedback.loginSuccess")
          : t("auth.feedback.accountCreated"),
        description: t("auth.feedback.enteringWorkspace"),
      })
      navigate("/", { replace: true })
    } catch (submitError) {
      const appError = normalizeAppError(submitError, {
        fallbackMessage: isLogin
          ? t("auth.feedback.loginFailedDetail")
          : t("auth.feedback.registerFailedDetail"),
      })
      setError(appError.message)
      notify.error({
        title: isLogin
          ? t("auth.feedback.loginFailed")
          : t("auth.feedback.registerFailed"),
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
        email: t("auth.validation.emailBeforeCode"),
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
        title: t("auth.feedback.codeSent"),
        description: t("auth.feedback.codeSentDetail"),
      })
    } catch (sendError) {
      const appError = normalizeAppError(sendError, {
        fallbackMessage: t("auth.feedback.codeFailedDetail"),
      })
      setError(appError.message)
      notify.error({
        title: t("auth.feedback.codeFailed"),
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
          {isLogin
            ? t("auth.form.loginEyebrow")
            : t("auth.form.registerEyebrow")}
        </p>
        <CardTitle className="text-2xl tracking-tight">
          {isLogin
            ? t("auth.form.loginTitle")
            : t("auth.form.registerTitle")}
        </CardTitle>
        <CardDescription className="leading-6">
          {isLogin
            ? t("auth.form.loginDescription")
            : t("auth.form.registerDescription")}
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-5 px-6 py-6 sm:px-7">
        <form className="space-y-5" onSubmit={handleSubmit} noValidate>
          <FormSection className="space-y-4">
            {!isLogin ? (
              <FormField
                htmlFor="auth-name"
                label={t("auth.form.name")}
                error={fieldErrors.displayName}
              >
                <Input
                  id="auth-name"
                  className="h-10 px-3"
                  value={form.displayName}
                  onChange={(event) =>
                    updateField("displayName", event.target.value)
                  }
                  placeholder={t("auth.form.namePlaceholder")}
                  autoComplete="name"
                  autoFocus
                  disabled={isSubmitting}
                  aria-invalid={Boolean(fieldErrors.displayName)}
                />
              </FormField>
            ) : null}

            <FormField
              htmlFor="auth-email"
              label={t("auth.form.email")}
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
                label={t("auth.form.verificationCode")}
                description={t("auth.form.verificationCodeDescription")}
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
                    placeholder={t("auth.form.verificationCodePlaceholder")}
                    disabled={isSubmitting}
                    maxLength={6}
                    aria-invalid={Boolean(fieldErrors.verificationCode)}
                  />
                  <AsyncButton
                    type="button"
                    variant="outline"
                    className="h-10"
                    isLoading={isSendingCode}
                    loadingLabel={t("auth.form.sendingCode")}
                    disabled={
                      isSubmitting || isSendingCode || codeCooldownSeconds > 0
                    }
                    onClick={handleSendVerificationCode}
                  >
                    <MailCheckIcon />
                    {codeCooldownSeconds > 0
                      ? t("auth.form.retryCode", {
                          seconds: codeCooldownSeconds,
                        })
                      : t("auth.form.sendCode")}
                  </AsyncButton>
                </div>
              </FormField>
            ) : null}

            <FormField
              htmlFor="auth-password"
              label={t("auth.form.password")}
              description={
                isLogin ? undefined : t("auth.form.passwordDescription")
              }
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
                  placeholder={t("auth.form.passwordPlaceholder")}
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
                  aria-label={
                    showPassword
                      ? t("auth.form.hidePassword")
                      : t("auth.form.showPassword")
                  }
                  title={
                    showPassword
                      ? t("auth.form.hidePassword")
                      : t("auth.form.showPassword")
                  }
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
            loadingLabel={
              isLogin ? t("auth.form.loggingIn") : t("auth.form.registering")
            }
          >
            <SubmitIcon />
            {isLogin ? t("auth.form.login") : t("auth.form.register")}
          </AsyncButton>
        </form>

        <p className="border-t pt-5 text-center text-sm leading-6 text-muted-foreground">
          {isLogin
            ? t("auth.layout.noAccount")
            : t("auth.layout.hasAccount")}{" "}
          <Link
            className="font-medium text-foreground underline underline-offset-4"
            to={isLogin ? "/register" : "/login"}
          >
            {isLogin
              ? t("auth.layout.createAccount")
              : t("auth.layout.backToLoginAction")}
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
