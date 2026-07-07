import { Button } from "@/components/ui/button"
import { Notice } from "@/components/app/notice"
import type { AppError } from "@/lib/app/api-errors"

export function ErrorState({
  error,
  title = "Something went wrong",
  retryLabel = "Retry",
  onRetry,
  className,
}: {
  error?: AppError | string | null
  title?: string
  retryLabel?: string
  onRetry?: () => void
  className?: string
}) {
  if (!error) {
    return null
  }

  const message = typeof error === "string" ? error : error.message

  return (
    <Notice tone="error" title={title} className={className}>
      <p>{message}</p>
      {onRetry ? (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="mt-3"
          onClick={onRetry}
        >
          {retryLabel}
        </Button>
      ) : null}
    </Notice>
  )
}
