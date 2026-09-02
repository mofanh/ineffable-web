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
import { AgentNodeManagementView } from "@/features/chat/components/agent-evolution-panel"
import { subscribeAgentEvolutionChanged } from "@/features/chat/model/agent-evolution-invalidation"
import { normalizeAppError } from "@/lib/app/api-errors"
import {
  agentNodeManagementTargetKey,
  matchesAgentNodeProjectionTarget,
  resolveAgentEvolutionWorkspaceId,
  resolveAgentNodeTargetConversationId,
} from "@/features/chat/model/agent-node-management"

function iterationModeLabel(mode: AgentEvolutionProjection["effective_mode"]) {
  return {
    disabled: "不可用",
    declarative_only: "声明式",
    artifact_allowed: "Artifact Node",
    runtime_lab_allowed: "开放运行时",
  }[mode]
}

export function AgentNodeManagementPage() {
  const { accessToken } = useAuthSession()
  const { currentWorkspace } = useWorkspaceSession()
  const { conversations, currentConversationId } = useConversationSession()
  const [selectedConversationId, setSelectedConversationId] = React.useState("")
  const [projection, setProjection] =
    React.useState<AgentEvolutionProjection | null>(null)
  const [projectionTargetKey, setProjectionTargetKey] = React.useState("")
  const [isLoading, setIsLoading] = React.useState(false)
  const [isMutationBusy, setIsMutationBusy] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [errorTargetKey, setErrorTargetKey] = React.useState("")
  const requestIdRef = React.useRef(0)

  const targetConversationId = resolveAgentNodeTargetConversationId(
    selectedConversationId,
    currentConversationId,
    conversations.map((conversation) => conversation.id)
  )
  const workspaceId = resolveAgentEvolutionWorkspaceId(currentWorkspace)
  const targetKey = agentNodeManagementTargetKey(
    targetConversationId,
    workspaceId
  )
  const targetKeyRef = React.useRef(targetKey)
  targetKeyRef.current = targetKey
  const isMutationBusyRef = React.useRef(isMutationBusy)
  isMutationBusyRef.current = isMutationBusy
  const activeProjection =
    projectionTargetKey === targetKey &&
    matchesAgentNodeProjectionTarget(
      projection,
      targetConversationId,
      workspaceId
    )
      ? projection
      : null
  const selectedConversation = conversations.find(
    (conversation) => conversation.id === targetConversationId
  )

  React.useEffect(() => {
    if (targetConversationId !== selectedConversationId) {
      setSelectedConversationId(targetConversationId)
    }
  }, [selectedConversationId, targetConversationId])

  const refresh = React.useCallback(async () => {
    const requestTargetKey = agentNodeManagementTargetKey(
      targetConversationId,
      workspaceId
    )
    if (targetKeyRef.current !== requestTargetKey) return

    const requestId = ++requestIdRef.current
    if (!accessToken || !targetConversationId) {
      setProjection(null)
      setProjectionTargetKey("")
      setError(null)
      setErrorTargetKey("")
      setIsLoading(false)
      return
    }

    setIsLoading(true)
    setError(null)
    try {
      const nextProjection = await getAgentEvolutionProjection(
        accessToken,
        targetConversationId,
        workspaceId
      )
      if (
        requestId === requestIdRef.current &&
        targetKeyRef.current === requestTargetKey
      ) {
        setProjection(nextProjection)
        setProjectionTargetKey(requestTargetKey)
      }
    } catch (caught) {
      if (
        requestId === requestIdRef.current &&
        targetKeyRef.current === requestTargetKey
      ) {
        setProjection(null)
        setProjectionTargetKey("")
        setError(
          normalizeAppError(caught, {
            fallbackMessage: "Agent Node 数据加载失败，请稍后重试。",
          }).message
        )
        setErrorTargetKey(requestTargetKey)
      }
    } finally {
      if (
        requestId === requestIdRef.current &&
        targetKeyRef.current === requestTargetKey
      ) {
        setIsLoading(false)
      }
    }
  }, [accessToken, targetConversationId, workspaceId])

  React.useEffect(() => {
    void refresh()
    return () => {
      requestIdRef.current += 1
    }
  }, [refresh])

  React.useEffect(
    () =>
      subscribeAgentEvolutionChanged((detail) => {
        if (isMutationBusyRef.current) return
        const changedTargetKey = agentNodeManagementTargetKey(
          detail.conversationId,
          detail.workspaceId ?? undefined
        )
        if (changedTargetKey === targetKeyRef.current) void refresh()
      }),
    [refresh]
  )

  return (
    <AppPage
      title="Agent Node 管理"
      description="查看完整 Agent Node 组合的版本链，复用经过评估的能力，并管理试用、准入和回滚。"
      actions={
        <div className="flex items-center gap-2">
          <Select
            value={targetConversationId || undefined}
            onValueChange={setSelectedConversationId}
            disabled={conversations.length === 0 || isMutationBusy}
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
            disabled={!targetConversationId || isLoading || isMutationBusy}
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
      ) : error && errorTargetKey === targetKey ? (
        <div className="rounded-2xl border border-destructive/30 bg-destructive/5 p-6 text-sm text-destructive">
          {error}
        </div>
      ) : (
        <div className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="rounded-2xl border p-5">
              <p className="text-xs text-muted-foreground">Agent Node 版本</p>
              <p className="mt-2 text-2xl font-semibold">
                {activeProjection?.definitions.length ?? 0}
              </p>
            </div>
            <div className="rounded-2xl border p-5">
              <p className="text-xs text-muted-foreground">已验证可复用</p>
              <p className="mt-2 text-2xl font-semibold">
                {activeProjection?.definitions.filter(
                  (definition) => definition.admitted_for_future_selection
                ).length ?? 0}
              </p>
            </div>
            <div className="rounded-2xl border p-5">
              <p className="text-xs text-muted-foreground">当前模式</p>
              <div className="mt-3">
                <Badge variant={activeProjection?.requested ? "default" : "secondary"}>
                  {activeProjection
                    ? iterationModeLabel(activeProjection.effective_mode)
                    : isLoading
                      ? "加载中"
                      : "不可用"}
                </Badge>
              </div>
            </div>
          </div>
          {activeProjection ? (
            <AgentNodeManagementView
              accessToken={accessToken}
              projection={activeProjection}
              onRefresh={refresh}
              onMutationBusyChange={setIsMutationBusy}
              targetLabel={selectedConversation?.title || targetConversationId}
            />
          ) : null}
        </div>
      )}
    </AppPage>
  )
}
