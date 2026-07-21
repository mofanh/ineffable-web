import * as React from "react"
import { Loader2Icon } from "lucide-react"
import { useParams } from "react-router-dom"
import { useTranslation } from "react-i18next"

import { ErrorState } from "@/components/app/error-state"
import { useAuthSession } from "@/features/auth/app-session"
import { createSandboxPreviewSession } from "@/features/sandbox-preview/api/sandbox-preview-api"
import { normalizeAppError, type AppError } from "@/lib/app/api-errors"

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export function SandboxPreviewLaunchPage() {
  const { t } = useTranslation()
  const { exposureId = "" } = useParams()
  const { accessToken } = useAuthSession()
  const [attempt, setAttempt] = React.useState(0)
  const [error, setError] = React.useState<AppError | null>(null)
  const startedAttemptRef = React.useRef<number | null>(null)

  React.useEffect(() => {
    if (!accessToken || startedAttemptRef.current === attempt) {
      return
    }

    if (!UUID_PATTERN.test(exposureId)) {
      setError({
        kind: "validation",
        message: t("sandboxPreview.launch.invalid"),
        recoverable: false,
      })
      return
    }

    startedAttemptRef.current = attempt
    setError(null)
    void createSandboxPreviewSession(accessToken, exposureId)
      .then((ticket) => {
        window.location.replace(ticket.launch_url)
      })
      .catch((cause: unknown) => {
        setError(
          normalizeAppError(cause, {
            fallbackMessage: t("sandboxPreview.launch.failed"),
          })
        )
      })
  }, [accessToken, attempt, exposureId, t])

  return (
    <main className="flex min-h-svh items-center justify-center bg-background px-6 py-12">
      <div className="w-full max-w-md rounded-2xl border border-border bg-card p-6 shadow-sm">
        <div className="flex items-start gap-3">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <Loader2Icon
              className={error ? "size-5" : "size-5 animate-spin"}
              aria-hidden="true"
            />
          </div>
          <div className="min-w-0 space-y-1">
            <h1 className="text-base font-semibold">
              {t("sandboxPreview.launch.title")}
            </h1>
            <p className="text-sm leading-6 text-muted-foreground">
              {error
                ? t("sandboxPreview.launch.errorDescription")
                : t("sandboxPreview.launch.description")}
            </p>
          </div>
        </div>

        <ErrorState
          error={error}
          title={t("sandboxPreview.launch.errorTitle")}
          retryLabel={t("common.retry")}
          onRetry={
            error?.recoverable === false
              ? undefined
              : () => setAttempt((current) => current + 1)
          }
          className="mt-5"
        />
      </div>
    </main>
  )
}
