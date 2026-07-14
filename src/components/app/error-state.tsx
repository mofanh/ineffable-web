import { Button } from "@/components/ui/button"
import { Notice } from "@/components/app/notice"
import type { AppError } from "@/lib/app/api-errors"
import { useTranslation } from "react-i18next"

export function ErrorState({
  error,
  title,
  retryLabel,
  onRetry,
  className,
}: {
  error?: AppError | string | null
  title?: string
  retryLabel?: string
  onRetry?: () => void
  className?: string
}) {
  const { t } = useTranslation()

  if (!error) {
    return null
  }

  const message = typeof error === "string" ? error : error.message

  return (
    <Notice
      tone="error"
      title={title ?? t("common.operationFailed")}
      className={className}
    >
      <p>{message}</p>
      {onRetry ? (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="mt-3"
          onClick={onRetry}
        >
          {retryLabel ?? t("common.retry")}
        </Button>
      ) : null}
    </Notice>
  )
}
