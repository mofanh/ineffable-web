import * as React from "react"
import { GitBranchIcon, RefreshCcwIcon } from "lucide-react"

import { AppPage } from "@/components/app/app-page"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  useAuthSession,
  useConversationSession,
  useWorkspaceSession,
} from "@/features/auth/app-session"
import {
  getAgentEvolutionProjection,
  type AgentEvolutionProjection,
} from "@/features/chat/api/chat-api"
import { normalizeAppError } from "@/lib/app/api-errors"

function resolveTargetConversationId(
  selectedConversationId: string,
  currentConversationId: string | null,
  conversationIds: string[]
) {
  if (selectedConversationId && conversationIds.includes(selectedConversationId)) {
    return selectedConversationId
  }
  if (currentConversationId && conversationIds.includes(currentConversationId)) {
    return currentConversationId
  }
  return conversationIds[0] ?? ""
}

export function AgentNodeManagementPage() {
  const { accessToken } = useAuthSession()
  const { currentWorkspace } = useWorkspaceSession()
  const { conversations, currentConversationId } = useConversationSession()
  const [selectedConversationId, setSelectedConversationId] = React.useState("")
  const [projection, setProjection] =
    React.useState<AgentEvolutionProjection | null>(null)
  const [isLoading, setIsLoading] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const requestIdRef = React.useRef(0)

  const targetConversationId = resolveTargetConversationId(
    selectedConversationId,
    currentConversationId,
    conversations.map((conversation) => conversation.id)
  )

  React.useEffect(() => {
    if (targetConversationId !== selectedConversationId) {
      setSelectedConversationId(targetConversationId)
    }
  }, [selectedConversationId, targetConversationId])

  const refresh = React.useCallback(async () => {
    const requestId = ++requestIdRef.current
    if (!accessToken || !targetConversationId) {
      setProjection(null)
      setError(null)
      setIsLoading(false)
      return
    }

    setIsLoading(true)
    setError(null)
    try {
      const nextProjection = await getAgentEvolutionProjection(
        accessToken,
        targetConversationId,
        currentWorkspace?.id
      )
      if (requestId === requestIdRef.current) {
        setProjection(nextProjection)
      }
    } catch (caught) {
      if (requestId === requestIdRef.current) {
        setProjection(null)
        setError(
          normalizeAppError(caught, {
            fallbackMessage: "Agent Node 数据加载失败，请稍后重试。",
          }).message
        )
      }
    } finally {
      if (requestId === requestIdRef.current) {
        setIsLoading(false)
      }
    }
  }, [accessToken, currentWorkspace?.id, targetConversationId])

  React.useEffect(() => {
    void refresh()
    return () => {
      requestIdRef.current += 1
    }
  }, [refresh])

  return (
    <AppPage
      title="Agent Node 管理"
      description="查看 AgentDefinition 版本链，复用经过评估的 Node 组合，并管理试用、准入和回滚。"
      actions={
        <div className="flex items-center gap-2">
          <Select
            value={targetConversationId || undefined}
            onValueChange={setSelectedConversationId}
            disabled={conversations.length === 0}
          >
            <SelectTrigger className="w-64">
              <SelectValue placeholder="选择应用目标会话" />
            </SelectTrigger>
            <SelectContent>
              {conversations.map((conversation) => (
                <SelectItem key={conversation.id} value={conversation.id}>
                  {conversation.title || "未命名会话"}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            type="button"
            variant="outline"
            disabled={!targetConversationId || isLoading}
            onClick={() => void refresh()}
          >
            <RefreshCcwIcon className={isLoading ? "animate-spin" : undefined} />
            刷新
          </Button>
        </div>
      }
    >
      {!targetConversationId ? (
        <div className="rounded-2xl border border-dashed p-10 text-center">
          <GitBranchIcon className="mx-auto size-8 text-muted-foreground" />
          <h2 className="mt-4 text-base font-medium">还没有可管理的会话</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            先在对话中开启 Node 迭代并生成候选版本，再回到这里管理。
          </p>
        </div>
      ) : error ? (
        <div className="rounded-2xl border border-destructive/30 bg-destructive/5 p-6 text-sm text-destructive">
          {error}
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="rounded-2xl border p-5">
            <p className="text-xs text-muted-foreground">Agent Node 版本</p>
            <p className="mt-2 text-2xl font-semibold">
              {projection?.definitions.length ?? 0}
            </p>
          </div>
          <div className="rounded-2xl border p-5">
            <p className="text-xs text-muted-foreground">已验证可复用</p>
            <p className="mt-2 text-2xl font-semibold">
              {projection?.definitions.filter(
                (definition) => definition.admitted_for_future_selection
              ).length ?? 0}
            </p>
          </div>
          <div className="rounded-2xl border p-5">
            <p className="text-xs text-muted-foreground">当前模式</p>
            <div className="mt-3">
              <Badge variant={projection?.requested ? "default" : "secondary"}>
                {projection?.effective_mode ?? (isLoading ? "加载中" : "disabled")}
              </Badge>
            </div>
          </div>
        </div>
      )}
    </AppPage>
  )
}
