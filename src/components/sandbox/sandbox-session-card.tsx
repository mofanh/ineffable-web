import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import type { SandboxExecutionSession } from "@/lib/api/gateway-client"
import { ActivityIcon, RefreshCwIcon } from "lucide-react"

type SandboxSessionCardProps = {
  session: SandboxExecutionSession | null
  error?: string | null
  isLoading?: boolean
  onRefresh: () => void
}

export function SandboxSessionCard({
  session,
  error,
  isLoading,
  onRefresh,
}: SandboxSessionCardProps) {
  return (
    <Card className="bg-muted/40">
      <CardHeader className="flex flex-row items-start justify-between gap-3">
        <div>
          <CardTitle className="flex items-center gap-2 text-base">
            <ActivityIcon className="size-4" />
            Latest Session
          </CardTitle>
          <CardDescription>最近一次 sandbox execution session。</CardDescription>
        </div>
        <Button type="button" variant="ghost" size="sm" onClick={onRefresh} disabled={isLoading || !session}>
          <RefreshCwIcon className={isLoading ? "animate-spin" : ""} />
          刷新
        </Button>
      </CardHeader>
      <CardContent className="space-y-3">
        {error ? <p className="text-destructive text-sm">{error}</p> : null}
        {!session && !error ? (
          <p className="text-muted-foreground text-sm">还没有执行会话。</p>
        ) : null}
        {session ? (
          <div className="space-y-3">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{session.execution_session_id}</p>
                <p className="text-muted-foreground mt-1 text-xs">
                  Request {session.execution_request_id}
                </p>
              </div>
              <Badge variant={session.status === "failed" ? "destructive" : "secondary"}>
                {session.status}
              </Badge>
            </div>
            {session.checkpoint_ref ? (
              <p className="text-muted-foreground text-xs">
                checkpoint: {session.checkpoint_ref}
              </p>
            ) : null}
            {session.failure_reason ? (
              <p className="text-destructive text-sm">{session.failure_reason}</p>
            ) : null}
            <pre className="bg-background/70 max-h-72 overflow-auto rounded-lg border p-3 text-xs leading-5">
              {JSON.stringify(session.metadata_json ?? {}, null, 2)}
            </pre>
          </div>
        ) : null}
      </CardContent>
    </Card>
  )
}
