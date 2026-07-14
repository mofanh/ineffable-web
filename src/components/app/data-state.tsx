import * as React from "react"
import { useTranslation } from "react-i18next"

import { Skeleton } from "@/components/ui/skeleton"
import { EmptyState } from "@/components/app/empty-state"
import { ErrorState } from "@/components/app/error-state"
import type { AppError } from "@/lib/app/api-errors"

export type DataStateName = "idle" | "loading" | "refreshing" | "success" | "error"

export function DataState({
  state,
  error,
  empty,
  emptyTitle,
  emptyDescription,
  loadingLabel,
  onRetry,
  children,
}: {
  state: DataStateName
  error?: AppError | string | null
  empty?: boolean
  emptyTitle?: string
  emptyDescription?: string
  loadingLabel?: string
  onRetry?: () => void
  children: React.ReactNode
}) {
  const { t } = useTranslation()
  const resolvedLoadingLabel = loadingLabel ?? t("common.loading")

  if (state === "loading" || state === "idle") {
    return (
      <div className="space-y-3" aria-label={resolvedLoadingLabel}>
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-12 w-2/3" />
      </div>
    )
  }

  if (state === "error") {
    return (
      <ErrorState
        error={error || t("common.requestFailed")}
        title={t("common.loadFailed")}
        className="items-start"
        onRetry={onRetry}
      />
    )
  }

  if (empty) {
    return (
      <EmptyState
        title={emptyTitle ?? t("common.noData")}
        description={emptyDescription}
      />
    )
  }

  return (
    <div className={state === "refreshing" ? "opacity-70" : undefined}>
      {children}
    </div>
  )
}
