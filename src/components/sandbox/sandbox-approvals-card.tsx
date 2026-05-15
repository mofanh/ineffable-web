import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import type { SandboxApproval } from "@/lib/api/gateway-client"
import { CheckIcon, ClipboardCheckIcon, RefreshCwIcon, XIcon } from "lucide-react"

type SandboxApprovalsCardProps = {
  approvals: SandboxApproval[]
  isLoading?: boolean
  error?: string | null
  onRefresh: () => void
  onApprove: (approval: SandboxApproval) => void
  onReject: (approval: SandboxApproval) => void
}

export function SandboxApprovalsCard({
  approvals,
  isLoading,
  error,
  onRefresh,
  onApprove,
  onReject,
}: SandboxApprovalsCardProps) {
  return (
    <Card className="bg-muted/40">
      <CardHeader className="flex flex-row items-start justify-between gap-3">
        <div>
          <CardTitle className="flex items-center gap-2 text-base">
            <ClipboardCheckIcon className="size-4" />
            Approvals
          </CardTitle>
          <CardDescription>命令执行必须审批后才会下发到 daemon。</CardDescription>
        </div>
        <Button type="button" variant="ghost" size="sm" onClick={onRefresh} disabled={isLoading}>
          <RefreshCwIcon className={isLoading ? "animate-spin" : ""} />
          刷新
        </Button>
      </CardHeader>
      <CardContent className="space-y-3">
        {error ? <p className="text-destructive text-sm">{error}</p> : null}
        {!approvals.length && !error ? (
          <p className="text-muted-foreground text-sm">暂无待审批命令。</p>
        ) : null}
        <div className="space-y-2">
          {approvals.map((approval) => (
            <div key={approval.approval_id} className="rounded-lg border bg-background/60 p-3">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">
                    Session {approval.execution_session_id}
                  </p>
                  <p className="text-muted-foreground mt-1 text-xs">
                    Provider {approval.provider_id}
                  </p>
                </div>
                <Badge variant="outline">{approval.status}</Badge>
              </div>
              <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                <Button type="button" size="sm" onClick={() => onApprove(approval)}>
                  <CheckIcon />
                  Approve
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="destructive"
                  onClick={() => onReject(approval)}
                >
                  <XIcon />
                  Reject
                </Button>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}
