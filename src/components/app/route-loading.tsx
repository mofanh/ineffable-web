import { Skeleton } from "@/components/ui/skeleton"
import { cn } from "@/lib/utils"

export function RouteLoading({ className }: { className?: string }) {
  return (
    <div
      role="status"
      aria-label="正在加载页面"
      className={cn("space-y-4 py-2", className)}
    >
      <Skeleton className="h-8 w-44" />
      <Skeleton className="h-24 w-full" />
      <Skeleton className="h-24 w-full" />
      <span className="sr-only">正在加载页面...</span>
    </div>
  )
}

export function FullPageLoading() {
  return (
    <div className="relative min-h-svh overflow-hidden bg-background p-6 sm:p-10">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,var(--muted),transparent_32%),radial-gradient(circle_at_80%_80%,var(--accent),transparent_28%)]"
      />
      <RouteLoading className="relative mx-auto w-full max-w-4xl" />
    </div>
  )
}
