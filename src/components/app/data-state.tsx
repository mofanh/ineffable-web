import * as React from "react"

import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { EmptyState } from "@/components/app/empty-state"
import { Notice } from "@/components/app/notice"
import type { AppError } from "@/lib/app/api-errors"

export type DataStateName = "idle" | "loading" | "refreshing" | "success" | "error"

export function DataState({
  state,
  error,
  empty,
  emptyTitle,
  emptyDescription,
  loadingLabel = "Loading...",
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
  if (state === "loading" || state === "idle") {
    return (
      <div className="space-y-3" aria-label={loadingLabel}>
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-12 w-2/3" />
      </div>
    )
  }

  if (state === "error") {
    const message =
      typeof error === "string" ? error : error?.message || "Request failed."

    return (
      <Notice
        tone="error"
        title="Something went wrong"
        className="items-start"
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
            Retry
          </Button>
        ) : null}
      </Notice>
    )
  }

  if (empty) {
    return (
      <EmptyState
        title={emptyTitle ?? "No data"}
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
