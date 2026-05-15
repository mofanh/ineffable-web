import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import type { SandboxPathGrant } from "@/lib/api/gateway-client"
import { FolderLockIcon, RefreshCwIcon } from "lucide-react"

type SandboxGrantsCardProps = {
  grants: SandboxPathGrant[]
  isLoading?: boolean
  error?: string | null
  onRefresh: () => void
}

export function SandboxGrantsCard({
  grants,
  isLoading,
  error,
  onRefresh,
}: SandboxGrantsCardProps) {
  return (
    <Card className="bg-muted/40">
      <CardHeader className="flex flex-row items-start justify-between gap-3">
        <div>
          <CardTitle className="flex items-center gap-2 text-base">
            <FolderLockIcon className="size-4" />
            Path Grants
          </CardTitle>
          <CardDescription>当前 environment 可访问的本机路径。</CardDescription>
        </div>
        <Button type="button" variant="ghost" size="sm" onClick={onRefresh} disabled={isLoading}>
          <RefreshCwIcon className={isLoading ? "animate-spin" : ""} />
          刷新
        </Button>
      </CardHeader>
      <CardContent className="space-y-3">
        {error ? <p className="text-destructive text-sm">{error}</p> : null}
        {!grants.length && !error ? (
          <p className="text-muted-foreground text-sm">暂无授权路径。</p>
        ) : null}
        <div className="space-y-2">
          {grants.map((grant) => (
            <div
              key={grant.grant_id}
              className="grid gap-2 rounded-lg border bg-background/60 p-3 sm:grid-cols-[1fr_auto]"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{grant.path}</p>
                <p className="text-muted-foreground mt-1 text-xs">
                  {grant.project_id ?? "no project"} · {grant.grant_id}
                </p>
              </div>
              <Badge variant={grant.access_mode === "read_write" ? "secondary" : "outline"}>
                {grant.access_mode}
              </Badge>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}
