import * as React from "react"

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
  loadingLabel = "正在加载...",
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
    return (
      <ErrorState
        error={error || "请求失败。"}
        title="加载失败"
        className="items-start"
        onRetry={onRetry}
      />
    )
  }

  if (empty) {
    return (
      <EmptyState
        title={emptyTitle ?? "暂无数据"}
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
