import * as React from "react"
import { useTranslation } from "react-i18next"
import { AsyncButton, FormField } from "@/components/app"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { changeAccountPassword, requestPasswordChangeCode } from "@/lib/api/api-client"
import { normalizeAppError } from "@/lib/app/api-errors"

export function ChangePasswordForm({ accessToken, sessionId, email, onChanged }: {
  accessToken: string
  sessionId: string
  email: string
  onChanged: () => void
}) {
  const { t } = useTranslation()
  const [current, setCurrent] = React.useState("")
  const [next, setNext] = React.useState("")
  const [confirmation, setConfirmation] = React.useState("")
  const [code, setCode] = React.useState("")
  const [saving, setSaving] = React.useState(false)
  const [sending, setSending] = React.useState(false)
  const [remaining, setRemaining] = React.useState(0)
  const [error, setError] = React.useState<string | null>(null)
  const [notice, setNotice] = React.useState<string | null>(null)
  const mounted = React.useRef(false)
  const busy = React.useRef(false)
  const codeBusy = React.useRef(false)
  const cooldown = React.useRef(0)
  const id = React.useId()
  React.useEffect(() => {
    mounted.current = true
    const timer = window.setInterval(() => setRemaining(Math.max(0, Math.ceil((cooldown.current - Date.now()) / 1000))), 1000)
    return () => { mounted.current = false; window.clearInterval(timer) }
  }, [])

  async function sendCode() {
    if (codeBusy.current || busy.current || Date.now() < cooldown.current) return
    codeBusy.current = true
    setSending(true)
    setError(null)
    setNotice(null)
    try {
      const result = await requestPasswordChangeCode(accessToken, sessionId)
      if (!mounted.current) return
      cooldown.current = Date.now() + result.retry_after_seconds * 1000
      setRemaining(result.retry_after_seconds)
      setNotice(t("account.password.codeSent"))
    } catch (caught) {
      if (mounted.current) setError(normalizeAppError(caught, { fallbackMessage: t("account.password.sendFailed") }).message)
    } finally {
      codeBusy.current = false
      if (mounted.current) setSending(false)
    }
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    if (busy.current || codeBusy.current) return
    setError(null)
    setNotice(null)
    if (Array.from(next).length < 8 || Array.from(next).length > 128 || !next.trim()) {
      setError(t("account.password.length")); return
    }
    if (next !== confirmation) { setError(t("account.password.mismatch")); return }
    if (next === current) { setError(t("account.password.same")); return }
    if (!/^[0-9]{6}$/.test(code.trim())) { setError(t("account.password.invalidCode")); return }
    busy.current = true
    setSaving(true)
    try {
      await changeAccountPassword(accessToken, sessionId, { current_password: current, new_password: next, email_verification_code: code.trim() })
      if (!mounted.current) return
      setCurrent(""); setNext(""); setConfirmation(""); setCode("")
      setNotice(t("account.password.changed"))
      onChanged()
    } catch (caught) {
      if (mounted.current) setError(normalizeAppError(caught, { fallbackMessage: t("account.password.failed") }).message)
    } finally {
      busy.current = false
      if (mounted.current) setSaving(false)
    }
  }

  return <Card>
    <CardHeader>
      <CardTitle>{t("account.password.title")}</CardTitle>
      <CardDescription>{t("account.password.description", { email })}</CardDescription>
    </CardHeader>
    <CardContent>
      <form className="max-w-lg space-y-4" onSubmit={(event) => void submit(event)}>
        <FormField htmlFor={`${id}-current`} label={t("account.password.current")}>
          <Input id={`${id}-current`} type="password" autoComplete="current-password" required value={current} disabled={saving} onChange={(event) => setCurrent(event.target.value)} />
        </FormField>
        <FormField htmlFor={`${id}-next`} label={t("account.password.next")} description={t("account.password.length")}>
          <Input id={`${id}-next`} type="password" autoComplete="new-password" required value={next} disabled={saving} onChange={(event) => setNext(event.target.value)} />
        </FormField>
        <FormField htmlFor={`${id}-confirm`} label={t("account.password.confirm")}>
          <Input id={`${id}-confirm`} type="password" autoComplete="new-password" required value={confirmation} disabled={saving} onChange={(event) => setConfirmation(event.target.value)} />
        </FormField>
        <FormField htmlFor={`${id}-code`} label={t("account.password.code")}>
          <div className="flex flex-wrap gap-2">
            <Input className="min-w-0 flex-1" id={`${id}-code`} inputMode="numeric" autoComplete="one-time-code" maxLength={6} required value={code} disabled={saving} onChange={(event) => setCode(event.target.value)} />
            <AsyncButton type="button" variant="outline" isLoading={sending} disabled={saving || remaining > 0} onClick={() => void sendCode()}>{remaining > 0 ? t("account.password.resend", { seconds: remaining }) : t("account.password.sendCode")}</AsyncButton>
          </div>
        </FormField>
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        {notice && <p role="status" className="text-sm text-muted-foreground">{notice}</p>}
        <AsyncButton type="submit" isLoading={saving} disabled={sending}>{t("account.password.save")}</AsyncButton>
      </form>
    </CardContent>
  </Card>
}
