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
