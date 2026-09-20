import { useTranslation } from "react-i18next"
import { i18n } from "@/lib/i18n/i18n"
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
    disabled: i18n.t("nodeManagement.unavailable"),
    declarative_only: i18n.t("nodeManagement.declarative"),
    artifact_allowed: "Artifact Node",
    runtime_lab_allowed: i18n.t("nodeManagement.runtime"),
  }[mode]
}

export function AgentNodeManagementPage() {
  useTranslation()
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
            fallbackMessage: i18n.t("nodeManagement.loadFailed"),
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
      title={i18n.t("nodeManagement.title")}
      description={i18n.t("nodeManagement.description")}
      actions={
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <Select
            value={targetConversationId || undefined}
            onValueChange={setSelectedConversationId}
            disabled={conversations.length === 0 || isMutationBusy}
          >
            <SelectTrigger className="w-full min-w-0 sm:w-64">
              <SelectValue placeholder={i18n.t("nodeManagement.chooseConversation")} />
            </SelectTrigger>
            <SelectContent>
              {conversations.map((conversation) => (
                <SelectItem key={conversation.id} value={conversation.id}>
                  {conversation.title || i18n.t("nodeManagement.untitled")}
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
            {i18n.t("nodeManagement.refresh")}</Button>
        </div>
      }
    >
      {!targetConversationId ? (
        <div className="rounded-2xl border border-dashed p-10 text-center">
          <GitBranchIcon className="mx-auto size-8 text-muted-foreground" />
          <h2 className="mt-4 text-base font-medium">{i18n.t("nodeManagement.empty")}</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            {i18n.t("nodeManagement.emptyHint")}</p>
        </div>
      ) : error && errorTargetKey === targetKey ? (
        <div className="rounded-2xl border border-destructive/30 bg-destructive/5 p-6 text-sm text-destructive">
          {error}
        </div>
      ) : (
        <div className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="rounded-2xl border p-5">
              <p className="text-xs text-muted-foreground">{i18n.t("nodeManagement.versions")}</p>
              <p className="mt-2 text-2xl font-semibold">
                {activeProjection?.definitions.length ?? 0}
              </p>
            </div>
            <div className="rounded-2xl border p-5">
              <p className="text-xs text-muted-foreground">{i18n.t("nodeManagement.reusable")}</p>
              <p className="mt-2 text-2xl font-semibold">
                {activeProjection?.definitions.filter(
                  (definition) => definition.admitted_for_future_selection
                ).length ?? 0}
              </p>
            </div>
            <div className="rounded-2xl border p-5">
              <p className="text-xs text-muted-foreground">{i18n.t("nodeManagement.mode")}</p>
              <div className="mt-3">
                <Badge variant={activeProjection?.requested ? "default" : "secondary"}>
                  {activeProjection
                    ? iterationModeLabel(activeProjection.effective_mode)
                    : isLoading
                      ? i18n.t("nodeManagement.loading")
                      : i18n.t("nodeManagement.unavailable")}
                </Badge>
              </div>
            </div>
          </div>
          {activeProjection ? (
            <AgentNodeManagementView
              key={`${activeProjection.conversation_id}:${activeProjection.workspace_id ?? ""}`}
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
