import * as React from "react"
import { useTranslation } from "react-i18next"

import {
  SidebarContent,
  useSidebar,
} from "@/components/ui/sidebar"
import {
  finalizePane,
  getLatestToolByName,
  type AgentPaneState,
  type ToolCallView,
  upsertToolInPane,
} from "@/features/chat/chat-pane-state"
import { AgentPlanPanel } from "@/features/chat/components/agent-plan-panel"
import type { AgentUserInputResponse } from "@/features/chat/components/agent-tool-renderers"
import {
  ChatComposer,
  type AgentDescriptorOption,
  type ModelProfileOption,
  type PreInputQueueItem,
} from "@/features/chat/components/chat-composer"
import { ChatMessageList } from "@/features/chat/components/chat-message-list"
import { ChatSidebarHeader } from "@/features/chat/components/chat-sidebar-header"
import {
  createEmptySubagent,
  createMessageId,
  getEventFingerprint,
  hasAssistantEntryContent,
  isSubScope,
} from "@/features/chat/gateway-chat-helpers"
import type {
  AssistantEntry,
  ApprovalEntry,
  ChatEntry,
  StreamStatus,
  SubagentView,
} from "@/features/chat/gateway-chat-types"
import {
  createAssistantEntry,
  findLatestConversationRuntimeSelection,
  findAssistantEntryIdForRun,
  getLiveConversationRun,
  mapConversationMessagesToEntries,
  reconcilePendingUserInput,
} from "@/features/chat/model/chat-history"
import {
  hasCanonicalAssistantHandoff,
  reduceConversationTimeline,
  type CanonicalAssistantHandoff,
} from "@/features/chat/model/conversation-entry-reconciliation"
import {
  ConversationWindowCache,
  type ConversationWindowSnapshot,
} from "@/features/chat/model/conversation-window-cache"
import {
  canonicalMessagesToGatewayEvents,
  hasCanonicalAssistantOutput,
} from "@/features/chat/model/canonical-message-event"
import {
  approvalNeedFromEvent,
  approvalNeedFromRaw,
  buildConversationTitle,
  objectValue,
  parsePendingInputContent,
  parsePendingInputId,
  userInputNeedFromEvent,
  userInputNeedFromRaw,
} from "@/features/chat/model/chat-parsing"
import {
  clearConversationResumeState,
  readConversationResumeState,
  writeConversationResumeState,
} from "@/features/chat/model/conversation-resume"
import {
  findNewlyTerminalConversationIds,
  getConversationRunLifecycle,
  getConversationRuntimeStatus,
  getLiveRunResumeCursor,
  observeConversationRuns,
  type ConversationRunObservation,
} from "@/features/chat/model/conversation-runtime-status"
import {
  eventBelongsToConversation,
  getConversationEventIdentity,
} from "@/features/chat/model/conversation-event-routing"
import { shouldApplyConversationProjection } from "@/features/chat/model/conversation-projection"
import { commitConversationSelection } from "@/features/chat/model/conversation-selection"
import { notifyWorkspaceToolResult } from "@/features/chat/model/workspace-tool-events"
import { findEligibleTrialAnswer } from "@/features/chat/model/agent-trial-verdict"
import {
  agentNodeManagementTargetKey,
  resolveAgentEvolutionWorkspaceId,
} from "@/features/chat/model/agent-node-management"
import {
  publishAgentEvolutionChanged,
  subscribeAgentEvolutionChanged,
} from "@/features/chat/model/agent-evolution-invalidation"
import {
  clearUnavailableComposerRuntimeSelectionField,
  commitAcceptedComposerRuntimeSelection,
  readCachedComposerRuntimeSelection,
  reconcileAvailableCanonicalComposerRuntimeSelection,
  resolveAvailableComposerModelProfileId,
  resolveConfirmedComposerModelProfileId,
  writeComposerRuntimeSelectionDraft,
  writeRecentComposerRuntimeSelection,
} from "@/features/chat/model/composer-runtime-selection"
import {
  projectConversationOutputEvent,
  projectConversationUserInputNeed,
} from "@/features/chat/runtime/conversation-event-projector"
import { ChatRuntimeStore } from "@/features/chat/runtime/chat-runtime-store"
import { ConversationRuntimeController } from "@/features/chat/runtime/conversation-runtime-controller"
import {
  browserVisualSchedulerHost,
  VisualUpdateScheduler,
  type VisualUpdatePriority,
} from "@/features/chat/runtime/visual-update-scheduler"
import { mergeAssistantDeltaEvents } from "@/features/chat/runtime/assistant-event-coalescing"
import { useAppSession } from "@/features/auth/app-session"
import {
  approveSandboxApproval,
  deletePendingInput,
  getConversation,
  getCapabilityExposureDraft,
  getConversationEvents,
  getConversationMessages,
  getAgentEvolutionProjection,
  getPendingInputs,
  listModelProfiles,
  listConversationCapabilityCatalog,
  listSandboxWorkspaceEnvironments,
  promotePendingInput,
  rejectSandboxApproval,
  resumeRunWithApproval,
  resumeRunWithUserInput,
  stopConversationRun,
  subscribeConversationEvents,
  streamConversationSend,
  setAgentIterationRequested,
  setConversationCapabilityExposure,
  updateAgentDefinitionTrial,
  type AgentEvolutionProjection,
  type CapabilityExposurePolicy,
  type CapabilityExposureSelection,
  type CapabilityCatalogEntry,
  type Conversation,
  type ModelProfile,
  type ResumeRunResponse,
  type SandboxEnvironmentView,
  type SandboxProviderStatusView,
} from "@/features/chat/api/chat-api"
import { capabilityExposureForSubmission } from "@/features/chat/model/capability-exposure-draft"
import { listWorkspaceTreeDeduped } from "@/features/workspace/api/workspace-resource-api"
import { normalizeAppError } from "@/lib/app/api-errors"
import { confirm } from "@/lib/app/confirm"
import { notify } from "@/lib/app/notifications"
import {
  BACKGROUND_CONVERSATION_REFRESH_INTERVAL_MS,
  useActivePageRefresh,
  usePageActive,
} from "@/lib/app/page-activity"
import type {
  GatewayChatStreamEnvelope,
  GatewayChatStreamEvent,
} from "@/lib/api/chat/gateway-events"
import { i18n } from "@/lib/i18n/i18n"

function formatSendErrorMessage(message: string) {
  return message.trim() === "no_available_model"
    ? i18n.t("chat.gateway.noModel")
    : message
}

function sandboxOptionLabel(
  environment: SandboxEnvironmentView,
  provider?: SandboxProviderStatusView
) {
  return provider?.display_name || environment.environment_type || environment.environment_id
}

const INITIAL_RENDERED_ENTRY_COUNT = 40
const RENDERED_ENTRY_INCREMENT = 30
const CONVERSATION_MESSAGES_PAGE_LIMIT = 40
const TERMINAL_HANDOFF_RETRY_DELAYS_MS = [0, 120, 350, 900] as const

function terminalCanonicalMessageSeqEnd(event: GatewayChatStreamEvent) {
  const raw = event.metadata?.canonical_message_seq_end
  const sequence =
    typeof raw === "number"
      ? raw
      : typeof raw === "string" && raw.trim()
        ? Number(raw)
        : Number.NaN
  return Number.isSafeInteger(sequence) ? sequence : null
}

function latestPlanTool(entries: ChatEntry[]) {
  for (let index = entries.length - 1; index >= 0; index -= 1) {
    const entry = entries[index]
    if (entry.role !== "assistant") continue
    const tool = getLatestToolByName(entry.pane, "update_plan")
    if (tool) return tool
  }
  return null
}

function updateToolInPane(
  pane: AgentPaneState,
  toolId: string,
  updater: (tool: ToolCallView) => ToolCallView
) {
  const tool = pane.tools[toolId]
  if (!tool) return pane
  return {
    ...pane,
    tools: {
      ...pane.tools,
      [toolId]: updater(tool),
    },
  }
}

function updateToolInPaneForRun(
  pane: AgentPaneState,
  toolId: string,
  runId: string,
  updater: (tool: ToolCallView) => ToolCallView
) {
  const tool = pane.tools[toolId]
  if (!tool || tool.runId !== runId) return pane
  return updateToolInPane(pane, toolId, updater)
}

function findToolInEntries(entries: ChatEntry[], toolId: string, runId: string) {
  for (let index = entries.length - 1; index >= 0; index -= 1) {
    const entry = entries[index]
    if (entry.role !== "assistant") continue
    const mainTool = entry.pane.tools[toolId]
    if (mainTool?.runId === runId) return mainTool
    for (const subagentId of entry.subagentOrder) {
      const subagentTool = entry.subagents[subagentId]?.tools[toolId]
      if (subagentTool?.runId === runId) return subagentTool
    }
  }
  return null
}

function updateUserInputToolInEntry(
  entry: ChatEntry,
  toolId: string,
  runId: string,
  updater: (tool: ToolCallView) => ToolCallView
): ChatEntry {
  if (entry.role !== "assistant") return entry
  const pane = updateToolInPaneForRun(entry.pane, toolId, runId, updater)
  const subagents = Object.fromEntries(
    entry.subagentOrder.map((subagentId) => {
      const subagent = entry.subagents[subagentId]
      return [
        subagentId,
        subagent
          ? {
              ...subagent,
              ...updateToolInPaneForRun(subagent, toolId, runId, updater),
            }
          : subagent,
      ]
    })
  ) as Record<string, SubagentView>
  return { ...entry, pane, subagents }
}

type GatewayChatSidebarProps = {
  isFullScreen: boolean
  onFullScreenChange: (isFullScreen: boolean) => void
}

type AssistantEntryUpdater = (
  entry: AssistantEntry | undefined
) => AssistantEntry | null

type AssistantVisualUpdate =
  | {
      kind: "updater"
      updater: AssistantEntryUpdater
      runId: string | null
    }
  | {
      kind: "event"
      event: GatewayChatStreamEvent
      runId: string | null
    }

function mergeAssistantVisualUpdate(
  previous: AssistantVisualUpdate,
  next: AssistantVisualUpdate
): AssistantVisualUpdate | null {
  if (
    previous.kind !== "event" ||
    next.kind !== "event" ||
    previous.runId !== next.runId
  ) {
    return null
  }
  const mergedEvent = mergeAssistantDeltaEvents(previous.event, next.event)
  if (!mergedEvent) return null
  return {
    kind: "event",
    runId: next.runId,
    event: mergedEvent,
  }
}

export function GatewayChatSidebar({
  isFullScreen,
  onFullScreenChange,
}: GatewayChatSidebarProps) {
  useTranslation()
  const { toggleSidebar } = useSidebar()
  const {
    accessToken,
    currentWorkspace,
    workspaces,
    conversations,
    currentConversationId,
    createConversation,
    selectConversation,
    refreshConversations,
  } = useAppSession()

  const [composer, setComposer] = React.useState("")
  const [entries, setEntries] = React.useState<ChatEntry[]>([])
  const [streamStatus, setStreamStatus] = React.useState<StreamStatus>("idle")
  const [error, setError] = React.useState<string | null>(null)
  const [isLoadingMessages, setIsLoadingMessages] = React.useState(false)
  const [isLoadingOlderEntries, setIsLoadingOlderEntries] = React.useState(false)
  const [olderMessagesError, setOlderMessagesError] = React.useState<string | null>(null)
  const [renderedEntryLimit, setRenderedEntryLimit] = React.useState(
    INITIAL_RENDERED_ENTRY_COUNT
  )
  const [olderMessagesCursor, setOlderMessagesCursor] = React.useState<string | null>(null)
  const [hasOlderMessages, setHasOlderMessages] = React.useState(false)
  const [hydratedConversationId, setHydratedConversationId] = React.useState<string | null>(null)
  const [displayedConversationId, setDisplayedConversationId] = React.useState<
    string | null
  >(null)
  const [sandboxOptions, setSandboxOptions] = React.useState<
    { environmentId: string; label: string; status: string }[]
  >([])
  const [isRefreshingSandboxOptions, setIsRefreshingSandboxOptions] =
    React.useState(false)
  const [modelProfiles, setModelProfiles] = React.useState<ModelProfile[]>([])
  const [isModelCatalogLoaded, setIsModelCatalogLoaded] = React.useState(false)
  const [selectedModelProfileId, setSelectedModelProfileId] = React.useState("")
  const [selectedSandboxEnvironmentId, setSelectedSandboxEnvironmentId] = React.useState("")
  const [capabilityExposureSelection, setCapabilityExposureSelection] =
    React.useState<CapabilityExposureSelection | null>(null)
  const [capabilityExposurePolicy, setCapabilityExposurePolicy] =
    React.useState<CapabilityExposurePolicy | null>(null)
  const [capabilityCatalog, setCapabilityCatalog] = React.useState<
    CapabilityCatalogEntry[]
  >([])
  const [capabilityCatalogStatus, setCapabilityCatalogStatus] = React.useState<
    "idle" | "loading" | "ready" | "error"
  >("idle")
  const [capabilityCatalogRevision, setCapabilityCatalogRevision] = React.useState(0)
  const capabilityCatalogRequestRef = React.useRef(0)
  const capabilityExposurePolicyRequestRef = React.useRef(0)
  const capabilityExposureSelectionRef = React.useRef(
    capabilityExposureSelection
  )
  const capabilityExposureSaveChainRef = React.useRef<Promise<void>>(
    Promise.resolve()
  )
  const [agentEvolution, setAgentEvolution] = React.useState<AgentEvolutionProjection | null>(null)
  const [agentIterationRequested, setAgentIterationRequestedState] = React.useState(false)
  const [agentIterationConversationId, setAgentIterationConversationId] =
    React.useState<string | null>(null)
  const [isAgentIterationResolved, setIsAgentIterationResolved] = React.useState(false)
  const [isAgentIterationLoading, setIsAgentIterationLoading] = React.useState(false)
  const [trialVerdictBusy, setTrialVerdictBusy] = React.useState<
    "accept" | "rollback" | null
  >(null)
  const [awaitingHumanRunId, setAwaitingHumanRunId] = React.useState<string | null>(null)
  const [agentDescriptorOptions, setAgentDescriptorOptions] = React.useState<
    AgentDescriptorOption[]
  >([])

  const reportChatError = React.useCallback(
    (
      caught: unknown,
      fallbackMessage: string,
      title: string,
      options?: { toast?: boolean; format?: (message: string) => string }
    ) => {
      const appError = normalizeAppError(caught, { fallbackMessage })
      const message = options?.format
        ? options.format(appError.message)
        : appError.message
      if (options?.toast ?? true) {
        notify.error({
          title,
          description: message,
        })
      }
      return message
    },
    []
  )

  const abortRef = React.useRef<AbortController | null>(null)
  const runtimeStoreRef = React.useRef(new ChatRuntimeStore())
  const runtimeControllerRef = React.useRef(
    new ConversationRuntimeController(runtimeStoreRef.current)
  )
  const entriesRef = React.useRef<ChatEntry[]>([])
  const displayedConversationIdRef = React.useRef<string | null>(null)
  const conversationWindowCacheRef = React.useRef(new ConversationWindowCache())
  const assistantEntryIdRef = React.useRef<string | null>(null)
  const [assistantVisualScheduler] = React.useState(
    () =>
      new VisualUpdateScheduler<AssistantVisualUpdate>(
      browserVisualSchedulerHost(),
      (updates) => {
        setEntries((current) =>
          updates.reduce(
            (nextEntries, update) => {
              const updater =
                update.kind === "updater"
                  ? update.updater
                  : (entry: AssistantEntry | undefined) =>
                      projectConversationOutputEvent(
                        entry,
                        update.event,
                        update.runId
                      )
              return applyAssistantEntryUpdate(nextEntries, updater, update.runId)
            },
            current
          )
        )
      },
      80,
      mergeAssistantVisualUpdate
    )
  )
  const activeStreamConversationIdRef = React.useRef<string | null>(null)
  const activeRunIdRef = React.useRef<string | null>(null)
  const terminalEventSeenRef = React.useRef(false)
  const recoveryInFlightRef = React.useRef(false)
  const recoveryTimerRef = React.useRef<number | null>(null)
  const catchupInFlightRef = React.useRef(false)
  const conversationSeqRef = React.useRef(new Map<string, number>())
  const currentConversationIdRef = React.useRef<string | null>(currentConversationId)
  const agentEvolutionWorkspaceIdRef = React.useRef(
    resolveAgentEvolutionWorkspaceId(currentWorkspace)
  )
  agentEvolutionWorkspaceIdRef.current =
    resolveAgentEvolutionWorkspaceId(currentWorkspace)
  const hydratedConversationIdRef = React.useRef<string | null>(hydratedConversationId)
  const streamStatusRef = React.useRef<StreamStatus>("idle")
  const skipNextConversationSyncRef = React.useRef<string | null>(null)
  const messageProjectionRequestRef = React.useRef(0)
  const agentEvolutionRequestRef = React.useRef(0)
  const seenEventRef = React.useRef(new Set<string>())
  const scrollViewportRef = React.useRef<HTMLDivElement | null>(null)
  const autoStickToBottomRef = React.useRef(true)
  const lastViewportScrollTopRef = React.useRef(0)
  const pendingInitialBottomScrollRef = React.useRef(false)
  const pendingScrollRestoreRef = React.useRef<
    ConversationWindowSnapshot["scrollAnchor"] | null
  >(null)
  const pendingOlderLoadMetricsRef = React.useRef<{
    scrollHeight: number
    scrollTop: number
  } | null>(null)
  const olderMessagesInFlightCursorRef = React.useRef<string | null>(null)
  const olderLoadResetTimerRef = React.useRef<number | null>(null)
  const sandboxOptionsRequestRef = React.useRef(0)
  const modelProfilesRef = React.useRef<ModelProfile[]>([])
  const modelProfilesLoadedRef = React.useRef(false)
  const sandboxOptionsRef = React.useRef<
    { environmentId: string; label: string; status: string }[]
  >([])
  const sandboxOptionsLoadedRef = React.useRef(false)
  const sandboxOptionsInFlightRef = React.useRef<{
    key: string
    requestId: number
    request: Promise<void>
  } | null>(null)
  const backgroundRefreshInFlightRef = React.useRef(false)
  const previousRunObservationsRef = React.useRef<Record<
    string,
    ConversationRunObservation
  > | null>(null)
  const [showScrollToBottom, setShowScrollToBottom] = React.useState(false)
  const [preInputQueue, setPreInputQueue] = React.useState<PreInputQueueItem[]>([])
  const [isSubmittingInput, setIsSubmittingInput] = React.useState(false)
  const [unreadConversationIds, setUnreadConversationIds] = React.useState(
    () => new Set<string>()
  )

  const applyConversationWindow = React.useCallback(
    (
      conversationId: string | null,
      snapshot: ConversationWindowSnapshot | null
    ) => {
      const nextEntries = snapshot?.entries ?? []
      entriesRef.current = nextEntries
      displayedConversationIdRef.current = conversationId
      hydratedConversationIdRef.current = snapshot ? conversationId : null
      setEntries(nextEntries)
      setDisplayedConversationId(conversationId)
      setHydratedConversationId(snapshot ? conversationId : null)
      setRenderedEntryLimit(
        snapshot?.renderedEntryLimit ?? INITIAL_RENDERED_ENTRY_COUNT
      )
      setOlderMessagesCursor(snapshot?.olderMessagesCursor ?? null)
      setHasOlderMessages(snapshot?.hasOlderMessages ?? false)
      pendingScrollRestoreRef.current = snapshot?.scrollAnchor ?? null
      setIsLoadingMessages(Boolean(conversationId && !snapshot))
    },
    []
  )

  const selectConversationTarget = React.useCallback(
    (conversationId: string | null) => {
      const currentId = currentConversationIdRef.current
      if (
        currentId &&
        displayedConversationIdRef.current === currentId &&
        entriesRef.current.length > 0
      ) {
        const viewport = scrollViewportRef.current
        const distanceToBottom = viewport
          ? viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight
          : 0
        const viewportRect = viewport?.getBoundingClientRect()
        const anchorElement = viewportRect && typeof document !== "undefined"
          ? document
              .elementFromPoint(
                viewportRect.left + viewportRect.width / 2,
                viewportRect.top + 1
              )
              ?.closest<HTMLElement>("[data-chat-row-key]") ?? null
          : null
        conversationWindowCacheRef.current.set(currentId, {
          entries: entriesRef.current,
          renderedEntryLimit,
          olderMessagesCursor,
          hasOlderMessages,
          scrollAnchor: {
            atBottom: !viewport || distanceToBottom < 48,
            scrollTop: viewport?.scrollTop ?? 0,
            rowKey: anchorElement?.dataset.chatRowKey,
            rowTop:
              anchorElement && viewportRect
                ? anchorElement.getBoundingClientRect().top - viewportRect.top
                : undefined,
          },
        })
      }
      const cached = conversationId
        ? conversationWindowCacheRef.current.get(conversationId)
        : null
      applyConversationWindow(conversationId, cached)
      commitConversationSelection(
        currentConversationIdRef,
        selectConversation,
        conversationId
      )
    },
    [
      applyConversationWindow,
      hasOlderMessages,
      olderMessagesCursor,
      renderedEntryLimit,
      selectConversation,
    ]
  )

  React.useEffect(() => {
    const conversationId = currentConversationId
    const workspaceId = resolveAgentEvolutionWorkspaceId(currentWorkspace)
    const requestTargetKey = agentNodeManagementTargetKey(
      conversationId ?? "",
      workspaceId
    )
    const requestId = ++agentEvolutionRequestRef.current
    setAgentEvolution(null)
    setAgentIterationRequestedState(false)
    setAgentIterationConversationId(conversationId)
    setIsAgentIterationResolved(false)
    if (!accessToken || !conversationId) {
      setIsAgentIterationLoading(false)
      return
    }
    let cancelled = false
    setIsAgentIterationLoading(true)
    void getAgentEvolutionProjection(
      accessToken,
      conversationId,
      workspaceId
    )
      .then((projection) => {
        const currentTargetKey = agentNodeManagementTargetKey(
          currentConversationIdRef.current ?? "",
          agentEvolutionWorkspaceIdRef.current
        )
        if (
          cancelled ||
          requestId !== agentEvolutionRequestRef.current ||
          requestTargetKey !== currentTargetKey ||
          currentConversationIdRef.current !== projection.conversation_id
        ) return
        setAgentEvolution(projection)
        setAgentIterationRequestedState(projection.requested)
        setAgentIterationConversationId(projection.conversation_id)
        setIsAgentIterationResolved(true)
      })
      .catch((caught) => {
        if (cancelled || requestId !== agentEvolutionRequestRef.current) return
        setAgentEvolution(null)
        setAgentIterationRequestedState(false)
        setIsAgentIterationResolved(false)
        reportChatError(
          caught,
          i18n.t("chat.composer.iterationLoadFailed"),
          i18n.t("chat.composer.iterationLoadFailedTitle")
        )
      })
      .finally(() => {
        if (!cancelled && requestId === agentEvolutionRequestRef.current) {
          setIsAgentIterationLoading(false)
        }
      })
    return () => {
      cancelled = true
    }
  }, [accessToken, currentConversationId, currentWorkspace, reportChatError])

  const refreshAgentEvolution = React.useCallback(async () => {
    const conversationId = currentConversationIdRef.current
    if (!accessToken || !conversationId) return
    const workspaceId = resolveAgentEvolutionWorkspaceId(currentWorkspace)
    const requestTargetKey = agentNodeManagementTargetKey(
      conversationId,
      workspaceId
    )
    const requestId = ++agentEvolutionRequestRef.current
    setIsAgentIterationLoading(true)
    try {
      const projection = await getAgentEvolutionProjection(
        accessToken,
        conversationId,
        workspaceId
      )
      const currentTargetKey = agentNodeManagementTargetKey(
        currentConversationIdRef.current ?? "",
        agentEvolutionWorkspaceIdRef.current
      )
      if (
        requestId !== agentEvolutionRequestRef.current ||
        requestTargetKey !== currentTargetKey ||
        currentConversationIdRef.current !== projection.conversation_id
      ) return
      setAgentEvolution(projection)
      setAgentIterationRequestedState(projection.requested)
      setAgentIterationConversationId(projection.conversation_id)
      setIsAgentIterationResolved(true)
    } finally {
      if (
        requestId === agentEvolutionRequestRef.current &&
        requestTargetKey === agentNodeManagementTargetKey(
          currentConversationIdRef.current ?? "",
          agentEvolutionWorkspaceIdRef.current
        )
      ) {
        setIsAgentIterationLoading(false)
      }
    }
  }, [accessToken, currentWorkspace])

  React.useEffect(
    () =>
      subscribeAgentEvolutionChanged((detail) => {
        const conversationId = currentConversationIdRef.current
        const workspaceId = agentEvolutionWorkspaceIdRef.current ?? null
        if (
          detail.conversationId !== conversationId ||
          detail.workspaceId !== workspaceId
        ) return
        void refreshAgentEvolution().catch((caught) => {
          reportChatError(
            caught,
            i18n.t("chat.composer.iterationLoadFailed"),
            i18n.t("chat.composer.iterationLoadFailedTitle")
          )
        })
      }),
    [refreshAgentEvolution, reportChatError]
  )

  async function handleAgentIterationChange(requested: boolean) {
    const conversationId = currentConversationIdRef.current
    const workspaceId = resolveAgentEvolutionWorkspaceId(currentWorkspace)
    const requestTargetKey = agentNodeManagementTargetKey(
      conversationId ?? "",
      workspaceId
    )
    const requestId = ++agentEvolutionRequestRef.current
    setAgentIterationConversationId(conversationId)
    setAgentIterationRequestedState(requested)
    setIsAgentIterationResolved(true)
    if (!accessToken || !conversationId) return
    setIsAgentIterationLoading(true)
    try {
      const projection = await setAgentIterationRequested(accessToken, {
        conversation_id: conversationId,
        workspace_id: workspaceId,
        requested,
      })
      const currentTargetKey = agentNodeManagementTargetKey(
        currentConversationIdRef.current ?? "",
        agentEvolutionWorkspaceIdRef.current
      )
      if (
        requestId !== agentEvolutionRequestRef.current ||
        requestTargetKey !== currentTargetKey ||
        currentConversationIdRef.current !== projection.conversation_id
      ) return
      setAgentEvolution(projection)
      setAgentIterationRequestedState(projection.requested)
      setAgentIterationConversationId(projection.conversation_id)
      setIsAgentIterationResolved(true)
      publishAgentEvolutionChanged({
        conversationId: projection.conversation_id,
        workspaceId: projection.workspace_id ?? null,
      })
    } catch (caught) {
      if (
        requestId === agentEvolutionRequestRef.current &&
        requestTargetKey === agentNodeManagementTargetKey(
          currentConversationIdRef.current ?? "",
          agentEvolutionWorkspaceIdRef.current
        )
      ) {
        const hasLoadedProjection =
          agentEvolution?.conversation_id === conversationId &&
          (agentEvolution.workspace_id ?? null) === (workspaceId ?? null)
        setAgentIterationRequestedState(
          hasLoadedProjection
            ? agentEvolution.requested
            : false
        )
        setIsAgentIterationResolved(hasLoadedProjection)
      }
      reportChatError(
        caught,
        i18n.t("chat.composer.iterationUpdateFailed"),
        i18n.t("chat.composer.iterationUpdateFailedTitle")
      )
    } finally {
      if (
        requestId === agentEvolutionRequestRef.current &&
        requestTargetKey === agentNodeManagementTargetKey(
          currentConversationIdRef.current ?? "",
          agentEvolutionWorkspaceIdRef.current
        )
      ) {
        setIsAgentIterationLoading(false)
      }
    }
  }

  const refreshPendingInputsForConversation = React.useCallback(
    async (conversationId: string) => {
      if (!conversationId || !accessToken) {
        return
      }

      const res = await getPendingInputs(
        accessToken,
        conversationId
      )
      const dbItems = res.pending_inputs.filter((item) => item.status === "queued")
      setPreInputQueue(
        dbItems.map((item) => ({
          id: `db-${item.id}`,
          content: item.content,
          status: "queued" as const,
        }))
      )
    },
    [accessToken]
  )

  React.useEffect(() => {
    const runtimeController = runtimeControllerRef.current
    return () => {
      abortRef.current?.abort()
      runtimeController.disconnectAll()
      if (recoveryTimerRef.current != null) {
        window.clearTimeout(recoveryTimerRef.current)
      }
      if (olderLoadResetTimerRef.current != null) {
        window.clearTimeout(olderLoadResetTimerRef.current)
      }
      // React Strict Mode replays effect setup/cleanup while preserving component
      // state. Permanently disposing this state-owned scheduler here would leave
      // the replayed mount unable to publish any subsequent SSE visual updates.
      assistantVisualScheduler.discardPending()
    }
  }, [assistantVisualScheduler])

  React.useEffect(() => {
    currentConversationIdRef.current = currentConversationId
  }, [currentConversationId])

  React.useEffect(() => {
    capabilityExposureSelectionRef.current = capabilityExposureSelection
  }, [capabilityExposureSelection])

  React.useEffect(() => {
    const requestId = ++capabilityCatalogRequestRef.current
    if (
      !accessToken ||
      capabilityExposureSelection?.mode !== "custom"
    ) {
      setCapabilityCatalog([])
      setCapabilityCatalogStatus("idle")
      return
    }
    setCapabilityCatalogStatus("loading")
    void listConversationCapabilityCatalog(
      accessToken,
      currentConversationId,
      selectedSandboxEnvironmentId || null
    )
      .then((response) => {
        if (
          capabilityCatalogRequestRef.current !== requestId ||
          currentConversationIdRef.current !== currentConversationId
        ) {
          return
        }
        setCapabilityCatalog(response.items)
        setCapabilityCatalogStatus("ready")
      })
      .catch(() => {
        if (
          capabilityCatalogRequestRef.current !== requestId ||
          currentConversationIdRef.current !== currentConversationId
        ) {
          return
        }
        setCapabilityCatalog([])
        setCapabilityCatalogStatus("error")
      })
  }, [
    accessToken,
    capabilityExposureSelection?.mode,
    capabilityCatalogRevision,
    currentConversationId,
    selectedSandboxEnvironmentId,
  ])

  React.useEffect(() => {
    const requestId = ++capabilityExposurePolicyRequestRef.current
    if (!accessToken || currentConversationId) {
      return
    }

    void getCapabilityExposureDraft(accessToken)
      .then((draft) => {
        if (
          requestId !== capabilityExposurePolicyRequestRef.current ||
          currentConversationIdRef.current !== null
        ) {
          return
        }
        capabilityExposureSelectionRef.current = draft.selection
        setCapabilityExposureSelection(draft.selection)
        setCapabilityExposurePolicy(draft.capability_exposure_policy.policy)
      })
      .catch((caught) => {
        if (
          requestId !== capabilityExposurePolicyRequestRef.current ||
          currentConversationIdRef.current !== null
        ) {
          return
        }
        reportChatError(
          caught,
          i18n.t("chat.composer.capabilityLoadFailed"),
          i18n.t("chat.composer.capabilityLoadFailedTitle")
        )
      })
  }, [accessToken, currentConversationId, reportChatError])

  React.useEffect(() => {
    entriesRef.current = entries
  }, [entries])

  React.useEffect(() => {
    displayedConversationIdRef.current = displayedConversationId
  }, [displayedConversationId])

  React.useEffect(() => {
    hydratedConversationIdRef.current = hydratedConversationId
  }, [hydratedConversationId])

  React.useEffect(() => {
    if (typeof window === "undefined") {
      return
    }
    const cachedSelection = readCachedComposerRuntimeSelection(
      window.localStorage,
      currentConversationId
    )
    const availableModelProfileId = resolveAvailableComposerModelProfileId(
      cachedSelection.modelProfileId,
      modelProfilesLoadedRef.current,
      modelProfilesRef.current.map((profile) => profile.id)
    )
    if (availableModelProfileId !== cachedSelection.modelProfileId) {
      clearUnavailableComposerRuntimeSelectionField(
        window.localStorage,
        currentConversationId,
        "model"
      )
    }
    setSelectedModelProfileId(availableModelProfileId)
    setSelectedSandboxEnvironmentId(cachedSelection.sandboxEnvironmentId)
  }, [currentConversationId])

  React.useEffect(() => {
    if (!accessToken) {
      modelProfilesRef.current = []
      modelProfilesLoadedRef.current = false
      setModelProfiles([])
      setIsModelCatalogLoaded(false)
      setSelectedModelProfileId("")
      return
    }

    let cancelled = false
    listModelProfiles(accessToken)
      .then((response) => {
        if (cancelled) {
          return
        }
        modelProfilesRef.current = response.profiles
        modelProfilesLoadedRef.current = true
        setModelProfiles(response.profiles)
        setIsModelCatalogLoaded(true)
        setSelectedModelProfileId((current) => {
          if (
            !current ||
            response.profiles.some((profile) => profile.id === current)
          ) {
            return current
          }
          if (typeof window !== "undefined") {
            clearUnavailableComposerRuntimeSelectionField(
              window.localStorage,
              currentConversationIdRef.current,
              "model"
            )
          }
          return ""
        })
      })
      .catch(() => {
        // Preserve the last successful catalog and selection on transient failure.
      })

    return () => {
      cancelled = true
    }
  }, [accessToken])

  const refreshSandboxOptions = React.useCallback(() => {
    if (!accessToken || !currentWorkspace) {
      sandboxOptionsRequestRef.current += 1
      sandboxOptionsInFlightRef.current = null
      sandboxOptionsRef.current = []
      // During session bootstrap the conversation can already be selected while
      // the workspace catalog is still hydrating. An absent workspace is not an
      // authoritative empty sandbox catalog: treating it as one makes history
      // restoration discard the persisted environment before the real catalog
      // arrives.
      sandboxOptionsLoadedRef.current = false
      setSandboxOptions([])
      setIsRefreshingSandboxOptions(false)
      return Promise.resolve()
    }

    const requestKey = `${accessToken}:${currentWorkspace.id}`
    const inFlight = sandboxOptionsInFlightRef.current
    if (inFlight?.key === requestKey) {
      return inFlight.request
    }

    const requestId = sandboxOptionsRequestRef.current + 1
    sandboxOptionsRequestRef.current = requestId
    // Fence conversation-history reconciliation while a workspace-scoped
    // catalog is changing. The previous workspace's options cannot establish
    // that a selection is unavailable in the next workspace.
    sandboxOptionsLoadedRef.current = false
    setIsRefreshingSandboxOptions(true)

    const request = (async () => {
      try {
        const response = await listSandboxWorkspaceEnvironments(
          accessToken,
          currentWorkspace.id
        )
        if (sandboxOptionsRequestRef.current !== requestId) {
          return
        }

        const providersById = new Map(
          response.providers.map((provider) => [provider.provider_id, provider])
        )
        const nextOptions = response.environments
          .filter((environment) => {
            const provider = providersById.get(environment.provider_id)
            return (
              provider?.status === "online" &&
              ["bound", "ready", "busy"].includes(environment.status)
            )
          })
          .map((environment) => ({
            environmentId: environment.environment_id,
            label: sandboxOptionLabel(
              environment,
              providersById.get(environment.provider_id)
            ),
            status: environment.status,
          }))

        sandboxOptionsRef.current = nextOptions
        sandboxOptionsLoadedRef.current = true
        setSandboxOptions(nextOptions)
        setSelectedSandboxEnvironmentId((current) => {
          if (
            !current ||
            nextOptions.some((option) => option.environmentId === current)
          ) {
            return current
          }
          clearUnavailableComposerRuntimeSelectionField(
            window.localStorage,
            currentConversationIdRef.current,
            "sandbox"
          )
          return ""
        })
      } catch {
        // Keep the last successful options when an explicit refresh fails.
      } finally {
        if (sandboxOptionsRequestRef.current === requestId) {
          setIsRefreshingSandboxOptions(false)
        }
        if (sandboxOptionsInFlightRef.current?.requestId === requestId) {
          sandboxOptionsInFlightRef.current = null
        }
      }
    })()
    sandboxOptionsInFlightRef.current = { key: requestKey, requestId, request }
    return request
  }, [accessToken, currentWorkspace])

  React.useEffect(() => {
    void refreshSandboxOptions()

    return () => {
      sandboxOptionsRequestRef.current += 1
      sandboxOptionsInFlightRef.current = null
    }
  }, [refreshSandboxOptions])

  React.useEffect(() => {
    if (!accessToken || !workspaces.length) {
      setAgentDescriptorOptions([])
      return
    }

    let cancelled = false
    Promise.all(
      workspaces.map(async (workspace) => {
        const tree = await listWorkspaceTreeDeduped(accessToken, workspace.id)
        return tree.objects
          .filter(
            (object) =>
              object.kind === "file" &&
              object.path.startsWith("system/agents/") &&
              object.path.endsWith(".md") &&
              !object.path.includes("..") &&
              !object.path.includes("\\")
          )
          .map((object) => ({
            workspaceId: workspace.id,
            workspaceName: workspace.name,
            path: object.path,
            label: object.name || object.path,
          }))
      })
    )
      .then((groups) => {
        if (!cancelled) {
          setAgentDescriptorOptions(groups.flat())
        }
      })
      .catch(() => {
        if (!cancelled) {
          setAgentDescriptorOptions([])
        }
      })

    return () => {
      cancelled = true
    }
  }, [accessToken, workspaces])

  // 加载 DB 中的 pending 队列并同步到本地状态
  React.useEffect(() => {
    if (!currentConversationId || !accessToken) {
      return
    }

    let cancelled = false
    refreshPendingInputsForConversation(currentConversationId)
      .then(() => {
        if (cancelled) return
      })
      .catch(() => {
        // 静默失败，使用本地队列
      })

    return () => {
      cancelled = true
    }
  }, [
    accessToken,
    currentConversationId,
    refreshPendingInputsForConversation,
  ])

  React.useEffect(() => {
    streamStatusRef.current = streamStatus
  }, [streamStatus])

  React.useEffect(() => {
    const previous = previousRunObservationsRef.current
    if (previous) {
      const newlyTerminal = findNewlyTerminalConversationIds(
        previous,
        conversations,
        currentConversationIdRef.current
      )
      if (newlyTerminal.length > 0) {
        setUnreadConversationIds((current) => {
          const next = new Set(current)
          newlyTerminal.forEach((conversationId) => next.add(conversationId))
          return next
        })
      }
    }
    previousRunObservationsRef.current = observeConversationRuns(conversations)
  }, [conversations])

  React.useEffect(() => {
    if (!currentConversationId) {
      return
    }
    setUnreadConversationIds((current) => {
      if (!current.has(currentConversationId)) {
        return current
      }
      const next = new Set(current)
      next.delete(currentConversationId)
      return next
    })
  }, [currentConversationId])

  const hasLiveConversation = conversations.some(
    (conversation) => conversation.current_run?.is_live
  )
  const isPageActive = usePageActive()

  React.useEffect(() => {
    if (
      !accessToken ||
      !isPageActive ||
      (!hasLiveConversation && !isSubmittingInput)
    ) {
      return
    }

    const refreshBackgroundRuns = async () => {
      if (backgroundRefreshInFlightRef.current) {
        return
      }
      backgroundRefreshInFlightRef.current = true
      try {
        await refreshConversations()
      } catch {
        // 当前会话的流恢复负责展示错误；后台列表轮询保持静默并等待下次重试。
      } finally {
        backgroundRefreshInFlightRef.current = false
      }
    }

    void refreshBackgroundRuns()
    const intervalId = window.setInterval(() => {
      void refreshBackgroundRuns()
    }, BACKGROUND_CONVERSATION_REFRESH_INTERVAL_MS)
    return () => window.clearInterval(intervalId)
  }, [
    accessToken,
    hasLiveConversation,
    isSubmittingInput,
    isPageActive,
    refreshConversations,
  ])

  const updateStreamStatus = React.useCallback((next: StreamStatus) => {
    streamStatusRef.current = next
    setStreamStatus(next)
  }, [])

  const selectedConversation = React.useMemo(
    () =>
      conversations.find((conversation) => conversation.id === currentConversationId) ?? null,
    [conversations, currentConversationId]
  )
  const selectedLiveRun = React.useMemo(
    () => getLiveConversationRun(selectedConversation),
    [selectedConversation]
  )
  const selectedPendingUserInput = React.useMemo(
    () =>
      userInputNeedFromRaw(selectedConversation?.current_run?.pending_need, {
        runId: selectedConversation?.current_run?.id ?? null,
        sessionKey: null,
      }),
    [selectedConversation]
  )
  const modelOptions = React.useMemo<ModelProfileOption[]>(
    () =>
      modelProfiles.map((profile) => ({
        id: profile.id,
        displayName: profile.display_name || profile.id,
        supportsReasoning: profile.supports_reasoning,
        supportsToolCalls: profile.supports_tool_calls,
      })),
    [modelProfiles]
  )
  const modelDisplayNames = React.useMemo(
    () =>
      Object.fromEntries(
        modelProfiles.map((profile) => [
          profile.id,
          profile.display_name || profile.id,
        ])
      ),
    [modelProfiles]
  )
  const sandboxDisplayNames = React.useMemo(
    () =>
      Object.fromEntries(
        sandboxOptions.map((environment) => [
          environment.environmentId,
          environment.label || environment.environmentId,
        ])
      ),
    [sandboxOptions]
  )

  const bindStatus = currentConversationId
    ? i18n.t("chat.gateway.bound")
    : i18n.t("chat.gateway.unbound")
  const isSending = Boolean(selectedLiveRun)
  const isAwaitingVisibleResponse =
    isSubmittingInput ||
    ((streamStatus === "streaming" || streamStatus === "recovering") &&
      activeStreamConversationIdRef.current === currentConversationId)
  const selectedConversationTitle =
    selectedConversation?.title || i18n.t("chat.header.newChat")
  const headerConversations = React.useMemo(
    () =>
      conversations.map((conversation) => ({
        id: conversation.id,
        title: conversation.title || i18n.t("chat.gateway.unnamed"),
        updatedAt: conversation.updated_at ?? conversation.last_message_at ?? null,
        runtimeStatus: getConversationRuntimeStatus(
          conversation,
          unreadConversationIds.has(conversation.id)
        ),
      })),
    [conversations, unreadConversationIds]
  )
  const handleRefreshConversationList = React.useCallback(() => {
    void refreshConversations()
  }, [refreshConversations])

  React.useEffect(() => {
    if (
      !selectedPendingUserInput ||
      hydratedConversationId !== currentConversationId
    ) {
      return
    }

    setEntries((current) =>
      reconcilePendingUserInput(current, selectedPendingUserInput)
    )
    setAwaitingHumanRunId(selectedPendingUserInput.runId)
  }, [
    currentConversationId,
    hydratedConversationId,
    selectedPendingUserInput,
  ])
  const conversationEntries = React.useMemo(
    () =>
      displayedConversationId === currentConversationId ? entries : [],
    [currentConversationId, displayedConversationId, entries]
  )
  const visibleEntries = React.useMemo(
    () =>
      conversationEntries.filter((entry) => {
        if (entry.role === "assistant") {
          return hasAssistantEntryContent(entry)
        }

        if (entry.role === "approval") {
          return Boolean(entry.needId || entry.approvalId)
        }

        return Boolean(entry.content.trim())
      }),
    [conversationEntries]
  )
  const renderedEntries = React.useMemo(
    () => visibleEntries.slice(Math.max(0, visibleEntries.length - renderedEntryLimit)),
    [renderedEntryLimit, visibleEntries]
  )
  const currentPlanTool = React.useMemo(
    () => latestPlanTool(conversationEntries),
    [conversationEntries]
  )
  const renderedEntryCount = renderedEntries.length
  const hasHiddenLoadedEntries = renderedEntries.length < visibleEntries.length
  const hasOlderEntries = hasHiddenLoadedEntries || hasOlderMessages

  const scrollToBottom = React.useCallback((behavior: ScrollBehavior = "smooth") => {
    const viewport = scrollViewportRef.current
    if (!viewport) {
      return
    }

    viewport.scrollTo({
      top: viewport.scrollHeight,
      behavior,
    })
  }, [])

  const handleViewportScroll = React.useCallback(() => {
    const viewport = scrollViewportRef.current
    if (!viewport) {
      return
    }

    const distanceToBottom =
      viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight
    const isNearBottom = distanceToBottom < 48
    const movedUp = viewport.scrollTop < lastViewportScrollTopRef.current - 1
    let shouldStickToBottom = autoStickToBottomRef.current

    if (shouldStickToBottom && movedUp && !isNearBottom) {
      shouldStickToBottom = false
    } else if (!shouldStickToBottom && isNearBottom) {
      shouldStickToBottom = true
    }

    lastViewportScrollTopRef.current = viewport.scrollTop
    autoStickToBottomRef.current = shouldStickToBottom
    setShowScrollToBottom(!shouldStickToBottom)
  }, [])

  React.useLayoutEffect(() => {
    const viewport = scrollViewportRef.current
    if (!viewport) {
      return
    }

    const restore = pendingScrollRestoreRef.current
    if (restore) {
      pendingScrollRestoreRef.current = null
      autoStickToBottomRef.current = restore.atBottom
      if (restore.atBottom) scrollToBottom("auto")
      else {
        viewport.scrollTop = restore.scrollTop
        if (restore.rowKey && restore.rowTop !== undefined) {
          const row = Array.from(
            viewport.querySelectorAll<HTMLElement>("[data-chat-row-key]")
          ).find((candidate) => candidate.dataset.chatRowKey === restore.rowKey)
          if (row) {
            viewport.scrollTop +=
              row.getBoundingClientRect().top -
              viewport.getBoundingClientRect().top -
              restore.rowTop
          }
        }
      }
      lastViewportScrollTopRef.current = viewport.scrollTop
      setShowScrollToBottom(!restore.atBottom)
      pendingInitialBottomScrollRef.current = false
      return
    }
    if (!autoStickToBottomRef.current) return

    scrollToBottom("auto")
    if (renderedEntryCount > 0) {
      pendingInitialBottomScrollRef.current = false
    }
  }, [currentConversationId, renderedEntryCount, scrollToBottom, streamStatus])

  React.useLayoutEffect(() => {
    const metrics = pendingOlderLoadMetricsRef.current
    const viewport = scrollViewportRef.current
    if (!metrics || !viewport) {
      return
    }

    const addedHeight = viewport.scrollHeight - metrics.scrollHeight
    viewport.scrollTop = metrics.scrollTop + Math.max(0, addedHeight)
    pendingOlderLoadMetricsRef.current = null
    setIsLoadingOlderEntries(false)
  }, [renderedEntryCount])

  const clearRecoveryTimer = React.useCallback(() => {
    if (recoveryTimerRef.current != null) {
      window.clearTimeout(recoveryTimerRef.current)
      recoveryTimerRef.current = null
    }
  }, [])

  const persistResumeState = React.useCallback(
    (overrides?: {
      conversationId?: string | null
      runId?: string | null
      afterSeq?: number | null
      clear?: boolean
      force?: boolean
    }) => {
      if (overrides?.clear) {
        const conversationId =
          overrides.conversationId ??
          activeStreamConversationIdRef.current ??
          currentConversationIdRef.current
        if (conversationId) {
          clearConversationResumeState(conversationId)
        }
        return
      }

      const conversationId =
        overrides?.conversationId ?? activeStreamConversationIdRef.current
      const status = streamStatusRef.current
      if (!conversationId) {
        return
      }

      if (
        !overrides?.force &&
        status !== "streaming" &&
        status !== "recovering"
      ) {
        return
      }

      const afterSeq =
        overrides?.afterSeq ??
        conversationSeqRef.current.get(conversationId) ??
        null

      writeConversationResumeState({
        conversationId,
        runId: overrides?.runId ?? activeRunIdRef.current,
        afterSeq,
      })
    },
    []
  )

  const setConversationLastSeq = React.useCallback(
    (conversationId: string, seq: number | null | undefined) => {
      if (!conversationId || typeof seq !== "number" || !Number.isFinite(seq)) {
        return
      }

      const normalized = Math.max(0, Math.floor(seq))
      const current = conversationSeqRef.current.get(conversationId) ?? 0
      if (normalized > current) {
        conversationSeqRef.current.set(conversationId, normalized)
      } else if (!conversationSeqRef.current.has(conversationId)) {
        conversationSeqRef.current.set(conversationId, current)
      }

      if (conversationId === activeStreamConversationIdRef.current) {
        persistResumeState({
          conversationId,
          afterSeq: conversationSeqRef.current.get(conversationId) ?? normalized,
        })
      }
    },
    [persistResumeState]
  )

  const loadOlderConversationMessagesPage = React.useCallback(() => {
    if (
      !hasOlderEntries ||
      pendingOlderLoadMetricsRef.current ||
      olderMessagesInFlightCursorRef.current
    ) {
      return
    }

    const viewport = scrollViewportRef.current
    pendingOlderLoadMetricsRef.current = {
      scrollHeight: viewport?.scrollHeight ?? 0,
      scrollTop: viewport?.scrollTop ?? 0,
    }
    setIsLoadingOlderEntries(true)
    setOlderMessagesError(null)
    autoStickToBottomRef.current = false
    setShowScrollToBottom(true)

    if (hasHiddenLoadedEntries) {
      setRenderedEntryLimit((current) =>
        Math.min(current + RENDERED_ENTRY_INCREMENT, visibleEntries.length)
      )

      if (olderLoadResetTimerRef.current != null) {
        window.clearTimeout(olderLoadResetTimerRef.current)
      }
      olderLoadResetTimerRef.current = window.setTimeout(() => {
        pendingOlderLoadMetricsRef.current = null
        setIsLoadingOlderEntries(false)
        olderLoadResetTimerRef.current = null
      }, 250)
      return
    }

    if (!accessToken || !currentConversationId || !olderMessagesCursor) {
      pendingOlderLoadMetricsRef.current = null
      setIsLoadingOlderEntries(false)
      return
    }

    olderMessagesInFlightCursorRef.current = olderMessagesCursor
    void getConversationMessages(accessToken, currentConversationId, {
      limit: CONVERSATION_MESSAGES_PAGE_LIMIT,
      before: olderMessagesCursor,
    })
      .then((response) => {
        if (
          olderMessagesInFlightCursorRef.current !== olderMessagesCursor ||
          currentConversationIdRef.current !== currentConversationId
        ) {
          return
        }

        const olderEntries = mapConversationMessagesToEntries(response.messages)
        setEntries((current) =>
          reduceConversationTimeline(current, {
            type: "prepend-history",
            entries: olderEntries,
          })
        )
        setRenderedEntryLimit((current) => current + olderEntries.length)
        setOlderMessagesCursor(response.page?.before ?? null)
        setHasOlderMessages(Boolean(response.page?.has_older && response.page.before))
        setConversationLastSeq(currentConversationId, response.next_seq ?? 0)
        setOlderMessagesError(null)
        setError(null)
      })
      .catch((loadError) => {
        pendingOlderLoadMetricsRef.current = null
        setOlderMessagesError(
          reportChatError(
            loadError,
            i18n.t("chat.gateway.loadFailed"),
            i18n.t("chat.gateway.loadHistoryFailed"),
            {
            toast: false,
              format: (message) =>
                i18n.t("chat.gateway.loadFailedWithMessage", { message }),
            }
          )
        )
      })
      .finally(() => {
        if (olderMessagesInFlightCursorRef.current === olderMessagesCursor) {
          olderMessagesInFlightCursorRef.current = null
        }
        setIsLoadingOlderEntries(false)
      })
  }, [
    accessToken,
    currentConversationId,
    hasHiddenLoadedEntries,
    hasOlderEntries,
    olderMessagesCursor,
    reportChatError,
    setConversationLastSeq,
    visibleEntries.length,
  ])

  const primeConversationCursor = React.useCallback(
    async (conversationId: string) => {
      if (!accessToken || !conversationId) {
        return
      }

      if (conversationSeqRef.current.has(conversationId)) {
        return
      }

      const response = await getConversationEvents(
        accessToken,
        conversationId,
        {
          afterSeq: Number.MAX_SAFE_INTEGER,
          max: 1,
        }
      )

      setConversationLastSeq(conversationId, response.next_seq ?? 0)
    },
    [accessToken, setConversationLastSeq]
  )

  const syncLatestConversationMessagesPage = React.useCallback(
    async (
      conversationId: string,
      handoff?: CanonicalAssistantHandoff | null
    ) => {
      if (!accessToken) {
        setEntries([])
        setOlderMessagesCursor(null)
        setHasOlderMessages(false)
        setOlderMessagesError(null)
        setHydratedConversationId(null)
        return false
      }

      const projectsCurrentConversation =
        currentConversationIdRef.current === conversationId
      const projectionRequestId = projectsCurrentConversation
        ? ++messageProjectionRequestRef.current
        : null
      if (projectionRequestId != null) {
        setIsLoadingMessages(true)
      }

      try {
        const [response, conversationDetail] = await Promise.all([
          getConversationMessages(accessToken, conversationId, {
            limit: CONVERSATION_MESSAGES_PAGE_LIMIT,
          }),
          getConversation(accessToken, conversationId).catch(() => null),
        ])
        const latestEntries = mapConversationMessagesToEntries(response.messages)
        const latestRuntimeSelection =
          findLatestConversationRuntimeSelection(response.messages)
        const handoffConfirmed = handoff
          ? hasCanonicalAssistantHandoff(latestEntries, handoff)
          : true
        setConversationLastSeq(conversationId, response.next_seq ?? 0)
        if (
          !shouldApplyConversationProjection({
            conversationId,
            selectedConversationId: currentConversationIdRef.current,
            requestId: projectionRequestId,
            latestRequestId: messageProjectionRequestRef.current,
          })
        ) {
          return handoffConfirmed
        }
        const hydratedCapabilityExposure =
          conversationDetail?.capability_exposure_selection ?? null
        capabilityExposureSelectionRef.current = hydratedCapabilityExposure
        setCapabilityExposureSelection(hydratedCapabilityExposure)
        setCapabilityExposurePolicy(
          conversationDetail?.capability_exposure_policy?.policy ?? null
        )
        if (latestRuntimeSelection) {
          const storage = typeof window !== "undefined" ? window.localStorage : null
          const reconciliation = storage
            ? reconcileAvailableCanonicalComposerRuntimeSelection(
              storage,
              conversationId,
              latestRuntimeSelection,
              modelProfilesLoadedRef.current,
              modelProfilesRef.current.map((profile) => profile.id)
            )
            : {
                selection: {
                  ...latestRuntimeSelection,
                  modelProfileId: resolveAvailableComposerModelProfileId(
                    latestRuntimeSelection.modelProfileId,
                    modelProfilesLoadedRef.current,
                    modelProfilesRef.current.map((profile) => profile.id)
                  ),
                },
                shouldApply: true,
              }
          if (
            reconciliation.selection.modelProfileId !==
            latestRuntimeSelection.modelProfileId
          ) {
            setSelectedModelProfileId("")
          }
          if (reconciliation.shouldApply) {
            const sandboxIsAvailable =
              latestRuntimeSelection.sandboxEnvironmentId == null ||
              !latestRuntimeSelection.sandboxEnvironmentId ||
              !sandboxOptionsLoadedRef.current ||
              sandboxOptionsRef.current.some(
                (option) =>
                  option.environmentId ===
                  latestRuntimeSelection.sandboxEnvironmentId
              )
            setSelectedModelProfileId(reconciliation.selection.modelProfileId)
            if (latestRuntimeSelection.sandboxEnvironmentId != null) {
              setSelectedSandboxEnvironmentId(
                sandboxIsAvailable
                  ? latestRuntimeSelection.sandboxEnvironmentId
                  : ""
              )
            }
          }
        }
        const shouldReplaceTranscript =
          (hydratedConversationIdRef.current !== conversationId ||
            entriesRef.current.length === 0) &&
          !(handoff && !handoffConfirmed && entriesRef.current.length > 0)
        setEntries((current) => {
          if (shouldReplaceTranscript) {
            return reduceConversationTimeline(current, {
              type: "hydrate",
              entries: latestEntries,
            })
          }

          return reduceConversationTimeline(current, {
            type: "canonical-patch",
            entries: latestEntries,
            handoff,
          })
        })
        displayedConversationIdRef.current = conversationId
        setDisplayedConversationId(conversationId)
        if (shouldReplaceTranscript) {
          setOlderMessagesCursor(response.page?.before ?? null)
          setHasOlderMessages(Boolean(response.page?.has_older && response.page.before))
        }
        hydratedConversationIdRef.current = conversationId
        setHydratedConversationId(conversationId)
        setOlderMessagesError(null)
        setError(null)
        return handoffConfirmed
      } catch (error) {
        if (
          shouldApplyConversationProjection({
            conversationId,
            selectedConversationId: currentConversationIdRef.current,
            requestId: projectionRequestId,
            latestRequestId: messageProjectionRequestRef.current,
          })
        ) {
          hydratedConversationIdRef.current = null
          setHydratedConversationId(null)
        }
        throw error
      } finally {
        if (
          shouldApplyConversationProjection({
            conversationId,
            selectedConversationId: currentConversationIdRef.current,
            requestId: projectionRequestId,
            latestRequestId: messageProjectionRequestRef.current,
          })
        ) {
          setIsLoadingMessages(false)
        }
      }
    },
    [accessToken, setConversationLastSeq]
  )

  React.useEffect(() => {
    assistantVisualScheduler.discardPending()
    messageProjectionRequestRef.current += 1
    if (
      currentConversationId &&
      skipNextConversationSyncRef.current === currentConversationId
    ) {
      skipNextConversationSyncRef.current = null
      return
    }

    abortRef.current?.abort()
    runtimeControllerRef.current.disconnectAll()
    clearRecoveryTimer()
    activeStreamConversationIdRef.current = null
    activeRunIdRef.current = null
    terminalEventSeenRef.current = false
    recoveryInFlightRef.current = false
    updateStreamStatus("idle")
    assistantEntryIdRef.current = null
    seenEventRef.current = new Set()
    setShowScrollToBottom(false)
    autoStickToBottomRef.current = true
    lastViewportScrollTopRef.current = 0
    pendingInitialBottomScrollRef.current = true
    const cachedWindow = currentConversationId
      ? conversationWindowCacheRef.current.get(currentConversationId)
      : null
    applyConversationWindow(currentConversationId, cachedWindow)
    hydratedConversationIdRef.current = null
    capabilityExposureSelectionRef.current = null
    setCapabilityExposureSelection(null)
    setCapabilityExposurePolicy(null)
    pendingOlderLoadMetricsRef.current = null
    olderMessagesInFlightCursorRef.current = null
    setOlderMessagesError(null)
    setIsLoadingOlderEntries(false)

    if (!currentConversationId) {
      setError(null)
      return
    }

    void syncLatestConversationMessagesPage(currentConversationId).catch((loadError) => {
      setEntries([])
      setError(
        reportChatError(
          loadError,
          i18n.t("chat.gateway.loadConversationFailed"),
          i18n.t("chat.gateway.loadConversationFailedTitle"),
          {
          toast: false,
          }
        )
      )
    })
  }, [
    assistantVisualScheduler,
    applyConversationWindow,
    clearRecoveryTimer,
    currentConversationId,
    reportChatError,
    syncLatestConversationMessagesPage,
    updateStreamStatus,
  ])

  const handleScrollToBottomClick = React.useCallback(() => {
    autoStickToBottomRef.current = true
    setShowScrollToBottom(false)
    scrollToBottom("auto")
  }, [scrollToBottom])

  const handleStreamingContentProgress = React.useCallback(() => {
    if (!autoStickToBottomRef.current) {
      return
    }

    scrollToBottom("auto")
  }, [scrollToBottom])

  function resetSeenCaches() {
    seenEventRef.current = new Set()
  }

  function resetTurnState() {
    assistantEntryIdRef.current = null
    activeRunIdRef.current = null
    terminalEventSeenRef.current = false
    resetSeenCaches()
  }

  function applyAssistantEntryUpdate(
    current: ChatEntry[],
    updater: AssistantEntryUpdater,
    targetRunId?: string | null
  ) {
    const normalizedRunId = targetRunId?.trim() || null
    let assistantId = assistantEntryIdRef.current
    if (
      normalizedRunId &&
      (!assistantId ||
        !current.some(
          (entry) =>
            entry.role === "assistant" &&
            entry.id === assistantId &&
            entry.runId === normalizedRunId
        ))
    ) {
      assistantId = findAssistantEntryIdForRun(current, normalizedRunId)
      if (assistantId) {
        assistantEntryIdRef.current = assistantId
      }
    }
    if (!assistantId) {
      const created = updater(undefined)
      if (!created) return current
      assistantEntryIdRef.current = created.id
      return [...current, created]
    }

    const index = current.findIndex(
      (entry) => entry.role === "assistant" && entry.id === assistantId
    )
    if (index < 0) {
      const created = updater(undefined)
      if (!created) return current
      assistantEntryIdRef.current = created.id
      return [...current, created]
    }

    const existing = current[index]
    if (existing.role !== "assistant") return current

    const next = updater(existing)
    if (!next || next === existing) return current

    const cloned = [...current]
    cloned[index] = next
    return cloned
  }

  function updateAssistantEntry(
    updater: AssistantEntryUpdater,
    priority: VisualUpdatePriority = "immediate",
    runId: string | null = activeRunIdRef.current
  ) {
    assistantVisualScheduler.enqueue({ kind: "updater", updater, runId }, priority)
  }

  function ensureAssistantEntry(runtimeSelection?: {
    modelProfileId: string
    sandboxEnvironmentId: string
  }) {
    updateAssistantEntry((entry) => {
      if (entry) {
        return {
          ...entry,
          runId: entry.runId || !activeRunIdRef.current
            ? entry.runId
            : activeRunIdRef.current,
          modelProfileId:
            entry.modelProfileId ?? runtimeSelection?.modelProfileId ?? null,
          sandboxEnvironmentId:
            entry.sandboxEnvironmentId ??
            runtimeSelection?.sandboxEnvironmentId ??
            null,
        }
      }

      return {
        ...createAssistantEntry("streaming", activeRunIdRef.current),
        modelProfileId: runtimeSelection?.modelProfileId || null,
        sandboxEnvironmentId:
          runtimeSelection?.sandboxEnvironmentId || null,
      }
    })
  }

  function bindActiveAssistantRun(runId: string | null | undefined) {
    const normalized = runId?.trim()
    if (!normalized) {
      return
    }

    const changed = activeRunIdRef.current !== normalized
    activeRunIdRef.current = normalized
    if (changed) {
      void refreshConversations().catch(() => {})
    }
    updateAssistantEntry((entry) =>
      entry && !entry.runId
        ? {
            ...entry,
            runId: normalized,
          }
        : (entry ?? null)
    )
  }

  function bindTriggerUserMessage(event: GatewayChatStreamEvent) {
    if (event.event !== "run.started") return
    const triggerMessageId = objectValue(event.metadata)?.trigger_message_id
    if (typeof triggerMessageId !== "string" || !triggerMessageId.trim()) {
      return
    }
    const timelineUnitId = `message:${triggerMessageId.trim()}`
    setEntries((current) => {
      for (let index = current.length - 1; index >= 0; index -= 1) {
        const entry = current[index]
        if (entry.role !== "user" || entry.timelineUnitId) continue
        const next = [...current]
        next[index] = {
          ...entry,
          id: timelineUnitId,
          timelineUnitId,
        }
        return next
      }
      return current
    })
  }

  function applyMainEvent(event: GatewayChatStreamEvent) {
    assistantVisualScheduler.enqueue(
      { kind: "event", event, runId: event.run_id ?? activeRunIdRef.current },
      "frame"
    )
  }

  function applySubagentEvent(event: GatewayChatStreamEvent) {
    assistantVisualScheduler.enqueue(
      { kind: "event", event, runId: event.run_id ?? activeRunIdRef.current },
      "frame"
    )
  }

  function appendSystemMessage(content: string) {
    if (!content.trim()) {
      return
    }

    setEntries((current) => [
      ...current,
      {
        id: createMessageId("system"),
        role: "system",
        content,
      },
    ])
  }

  function appendUserMessage(content: string, id = createMessageId("user")) {
    if (!content.trim()) {
      return
    }

    setEntries((current) => [
      ...current,
      {
        id,
        role: "user",
        content,
      },
    ])
  }

  function upsertApprovalEntry(approval: ApprovalEntry) {
    setEntries((current) => {
      const index = current.findIndex(
        (entry) =>
          entry.role === "approval" &&
          (entry.id === approval.id ||
            entry.approvalId === approval.approvalId ||
            entry.needId === approval.needId)
      )
      if (index < 0) {
        return [...current, approval]
      }

      const existing = current[index]
      if (existing.role !== "approval") {
        return current
      }

      const cloned = [...current]
      cloned[index] = {
        ...existing,
        ...approval,
        status:
          existing.status === "approved" || existing.status === "rejected"
            ? existing.status
            : approval.status,
        error: existing.error ?? approval.error,
      }
      return cloned
    })
  }

  function updateApprovalEntry(
    entryId: string,
    updater: (entry: ApprovalEntry) => ApprovalEntry
  ) {
    setEntries((current) =>
      current.map((entry) =>
        entry.role === "approval" && entry.id === entryId
          ? updater(entry)
          : entry
      )
    )
  }

  function markAwaitingHuman(runId?: string | null) {
    const conversationId =
      activeStreamConversationIdRef.current ?? currentConversationIdRef.current
    const awaitingRunId = runId ?? activeRunIdRef.current
    setAwaitingHumanRunId(awaitingRunId)
    terminalEventSeenRef.current = true
    recoveryInFlightRef.current = false
    clearRecoveryTimer()
    activeStreamConversationIdRef.current = null
    activeRunIdRef.current = null
    if (conversationId) {
      clearConversationResumeState(conversationId)
    }
    completeAssistantEntry(undefined, awaitingRunId)
    assistantEntryIdRef.current = null
    setError(null)
    updateStreamStatus("completed")
    void refreshConversations().catch(() => {})
  }

  function completeAssistantEntry(fallback?: string, runId = activeRunIdRef.current) {
    updateAssistantEntry((entry) => {
      if (!entry && !fallback?.trim()) {
        return null
      }

      const current = entry ?? createAssistantEntry("done", runId)

      const nextSubagents = Object.fromEntries(
        current.subagentOrder.map((subagentId) => {
          const subagent = current.subagents[subagentId]
          if (!subagent) {
            return [subagentId, createEmptySubagent(subagentId, subagentId)]
          }

          return [
            subagentId,
            {
              ...finalizePane(subagent),
              id: subagent.id,
              name: subagent.name,
              status: "done" as const,
            },
          ]
        })
      ) as Record<string, SubagentView>

      return {
        ...current,
        status: "done",
        pane: finalizePane(current.pane, fallback),
        subagents: nextSubagents,
      }
    }, "immediate", runId)
  }

  function beginGuidedUserTurn(content: string, id = createMessageId("user")) {
    completeAssistantEntry()
    assistantEntryIdRef.current = null
    appendUserMessage(content, id)
    return id
  }

  async function syncTerminalConversationMessages(
    conversationId: string,
    handoff: CanonicalAssistantHandoff | null
  ) {
    if (!handoff) {
      await syncLatestConversationMessagesPage(conversationId)
      return
    }

    for (const delayMs of TERMINAL_HANDOFF_RETRY_DELAYS_MS) {
      if (currentConversationIdRef.current !== conversationId) {
        return
      }
      if (delayMs > 0) {
        await new Promise<void>((resolve) => window.setTimeout(resolve, delayMs))
      }
      const confirmed = await syncLatestConversationMessagesPage(
        conversationId,
        handoff
      )
      if (confirmed) {
        return
      }
    }
  }

  function finalizeConversationTurn(
    conversationId: string,
    runId: string | null,
    canonicalMessageSeqEnd: number | null
  ) {
    setAwaitingHumanRunId(null)
    terminalEventSeenRef.current = true
    recoveryInFlightRef.current = false
    clearRecoveryTimer()
    activeStreamConversationIdRef.current = null
    completeAssistantEntry(undefined, runId)
    activeRunIdRef.current = null
    clearConversationResumeState(conversationId)
    assistantEntryIdRef.current = null
    setError(null)
    updateStreamStatus("completed")
    const handoff = !runId || canonicalMessageSeqEnd == null
      ? null
      : { runId, messageSeqEnd: canonicalMessageSeqEnd }
    void refreshConversations().catch(() => {})
    void refreshPendingInputsForConversation(conversationId).catch(() => {})
    void syncTerminalConversationMessages(conversationId, handoff).catch(() => {})
  }

  function settleConversationRecovery(conversation: Conversation) {
    const lifecycle = getConversationRunLifecycle(conversation)
    const runId = conversation.current_run?.id ?? null

    if (lifecycle === "active") {
      return false
    }
    if (lifecycle === "awaiting_human") {
      markAwaitingHuman(runId)
      return true
    }
    if (lifecycle === "suspended") {
      recoveryInFlightRef.current = false
      clearRecoveryTimer()
      activeStreamConversationIdRef.current = null
      activeRunIdRef.current = null
      setAwaitingHumanRunId(null)
      completeAssistantEntry()
      assistantEntryIdRef.current = null
      updateStreamStatus("idle")
      return true
    }
    if (lifecycle === "failed") {
      terminalEventSeenRef.current = true
      recoveryInFlightRef.current = false
      clearRecoveryTimer()
      activeStreamConversationIdRef.current = null
      activeRunIdRef.current = null
      clearConversationResumeState(conversation.id)
      completeAssistantEntry()
      assistantEntryIdRef.current = null
      updateStreamStatus("error")
      setError(i18n.t("chat.gateway.sendFailed"))
      return true
    }

    finalizeConversationTurn(conversation.id, runId, null)
    return true
  }

  function applyResumeResponse(
    response: ResumeRunResponse,
    conversationId: string
  ) {
    if (currentConversationIdRef.current !== conversationId) {
      void refreshConversations().catch(() => {})
      return
    }
    const forwardMessages = Array.isArray(response.forward_messages)
      ? response.forward_messages
      : []
    const canonicalForwardMessages = forwardMessages.map((message) => {
      const messageMetadata = objectValue(message.metadata)
      return {
        role: message.role,
        messageType: message.message_type,
        content: message.content,
        reasoningContent:
          typeof messageMetadata?.reasoning_content === "string"
            ? messageMetadata.reasoning_content
            : null,
        metadata: messageMetadata,
        scope: message.scope,
        runId: response.run_id,
        conversationId,
      }
    })
    const hasForwardAssistantOutput = hasCanonicalAssistantOutput(
      canonicalForwardMessages
    )
    if (forwardMessages.length > 0) {
      const projectedEvents = canonicalMessagesToGatewayEvents(
        canonicalForwardMessages,
        {
          stream: "resume",
          phase: "resume",
          defaultRunId: response.run_id,
          conversationId,
        }
      )
      projectedEvents.forEach(applyEvent)
    }

    const pendingApproval = approvalNeedFromRaw(response.pending_need, {
      runId: response.run_id ?? null,
      sessionKey: response.session_key ?? null,
    })
    if (pendingApproval) {
      upsertApprovalEntry(pendingApproval)
      markAwaitingHuman(pendingApproval.runId)
      return
    }

    const pendingUserInput = userInputNeedFromRaw(response.pending_need, {
      runId: response.run_id ?? null,
      sessionKey: response.session_key ?? null,
    })
    if (pendingUserInput) {
      ensureAssistantEntry()
      updateAssistantEntry((entry) => {
        const current = entry ?? createAssistantEntry("streaming", pendingUserInput.runId)
        const existing = current.pane.tools[pendingUserInput.needId]
        return {
          ...current,
          runId: current.runId ?? pendingUserInput.runId,
          pane: upsertToolInPane(current.pane, pendingUserInput.needId, {
            id: pendingUserInput.needId,
            name: "request_user_input",
            input:
              existing?.input || JSON.stringify({ questions: pendingUserInput.questions }),
            output: existing?.output || "",
            status: "waiting",
            runId: pendingUserInput.runId,
            sessionKey: pendingUserInput.sessionKey,
          }),
        }
      })
      markAwaitingHuman(pendingUserInput.runId)
      return
    }

    const resumedRunState = response.run_state?.trim().toLowerCase()
    if (resumedRunState === "failed" || resumedRunState === "busy_rejected") {
      const errorMessage = formatSendErrorMessage(
        response.output?.trim() || i18n.t("chat.gateway.sendFailed")
      )
      setAwaitingHumanRunId(null)
      terminalEventSeenRef.current = true
      activeRunIdRef.current = null
      updateStreamStatus("error")
      setError(errorMessage)
      updateAssistantEntry((entry) =>
        entry
          ? {
              ...entry,
              status: "error",
              pane: finalizePane(entry.pane),
            }
          : null
      )
      appendSystemMessage(
        i18n.t("chat.gateway.sendFailedWithMessage", { message: errorMessage })
      )
      void refreshConversations().catch(() => {})
      return
    }
    if (resumedRunState === "awaiting_human") {
      markAwaitingHuman(response.run_id ?? null)
      return
    }
    if (resumedRunState === "suspended") {
      setAwaitingHumanRunId(null)
      recoveryInFlightRef.current = false
      clearRecoveryTimer()
      activeRunIdRef.current = null
      updateStreamStatus("idle")
      void refreshConversations().catch(() => {})
      return
    }

    if (response.output?.trim() && !hasForwardAssistantOutput) {
      assistantEntryIdRef.current = null
      ensureAssistantEntry()
      completeAssistantEntry(response.output)
    }

    setAwaitingHumanRunId(null)
    terminalEventSeenRef.current = true
    recoveryInFlightRef.current = false
    clearRecoveryTimer()
    if (activeStreamConversationIdRef.current === conversationId) {
      activeStreamConversationIdRef.current = null
    }
    if (!response.run_id || activeRunIdRef.current === response.run_id) {
      activeRunIdRef.current = null
    }
    clearConversationResumeState(conversationId)
    setError(null)
    updateStreamStatus("completed")
    void Promise.all([
      refreshConversations(),
      syncLatestConversationMessagesPage(conversationId),
      refreshPendingInputsForConversation(conversationId),
    ])
  }

  function applyEvent(event: GatewayChatStreamEvent) {
    const identity = getConversationEventIdentity(event)
    if (!identity) {
      console.warn("Ignoring gateway event without conversation/run identity", event)
      return
    }
    if (
      !eventBelongsToConversation(event, currentConversationIdRef.current)
    ) {
      void refreshConversations().catch(() => {})
      return
    }

    // ── Pending Input 事件 ──
    if (event.event === "pending_input_queued") {
      const content = parsePendingInputContent(event)
      const id = parsePendingInputId(event)
      if (!content) {
        return
      }
      setPreInputQueue((prev) => {
        const queueId = id != null ? `db-${id}` : createMessageId("preinput")
        const next = prev.filter((item) => item.id !== queueId)
        next.push({ id: queueId, content, status: "queued" })
        return next
      })
      return
    }
    if (event.event === "pending_input_guided") {
      const id = parsePendingInputId(event)
      if (id != null) {
        setPreInputQueue((prev) => prev.filter((q) => q.id !== `db-${id}`))
      }
      return
    }
    if (event.event === "pending_input_consuming") {
      const id = parsePendingInputId(event)
      if (id != null) {
        setPreInputQueue((prev) => prev.filter((q) => q.id !== `db-${id}`))
      }
      return
    }
    if (event.event === "pending_input_cancelled") {
      const id = parsePendingInputId(event)
      if (id != null) {
        setPreInputQueue((prev) => prev.filter((q) => q.id !== `db-${id}`))
      }
      return
    }

    const approvalEntry = approvalNeedFromEvent(event)
    if (approvalEntry) {
      upsertApprovalEntry(approvalEntry)
      if (event.event === "run.awaiting_human") {
        markAwaitingHuman(approvalEntry.runId)
      }
      return
    }

    const userInputNeed = userInputNeedFromEvent(event)
    if (userInputNeed) {
      ensureAssistantEntry()
      updateAssistantEntry((entry) =>
        projectConversationUserInputNeed(entry ?? undefined, event, userInputNeed)
      )
      if (event.event === "run.awaiting_human") {
        markAwaitingHuman(userInputNeed.runId)
      }
      return
    }

    if (event.event === "run.failed") {
      const conversationId = identity.conversationId
      const errorMessage = formatSendErrorMessage(
        (event.content ?? "Gateway stream failed").trim()
      )
      recoveryInFlightRef.current = false
      clearRecoveryTimer()
      if (activeStreamConversationIdRef.current === conversationId) {
        activeStreamConversationIdRef.current = null
      }
      if (activeRunIdRef.current === identity.runId) {
        activeRunIdRef.current = null
      }
      if (conversationId) {
        clearConversationResumeState(conversationId)
      }
      updateStreamStatus("error")
      void refreshConversations().catch(() => {})
      setError(errorMessage)
      appendSystemMessage(
        i18n.t("chat.gateway.sendFailedWithMessage", { message: errorMessage })
      )
      updateAssistantEntry((entry) =>
        entry
          ? {
              ...entry,
              status: "error",
              pane: finalizePane(entry.pane),
            }
          : null
      )
      return
    }

    if (
      event.event === "run.completed" ||
      event.event === "run.cancelled"
    ) {
      const conversationId = identity.conversationId
      if (conversationId) {
        finalizeConversationTurn(
          conversationId,
          identity.runId,
          terminalCanonicalMessageSeqEnd(event)
        )
      } else {
        terminalEventSeenRef.current = true
        recoveryInFlightRef.current = false
        clearRecoveryTimer()
        activeStreamConversationIdRef.current = null
        activeRunIdRef.current = null
        if (conversationId) {
          clearConversationResumeState(conversationId)
        }
        completeAssistantEntry()
        assistantEntryIdRef.current = null
        setError(null)
        updateStreamStatus("completed")
      }
      return
    }

    if (isSubScope(event)) {
      applySubagentEvent(event)
      return
    }

    if (streamStatusRef.current === "recovering") {
      // 恢复/追赶路径在收到首个真实业务事件（文本/推理/工具增量）时立即切换为
      // 流式状态并清除“正在重新连接会话流”提示，避免 LLM 已开始输出时 banner
      // 一直残留到 run 终态。run.failed/approval/user_input 等分支已提前返回。
      updateStreamStatus("streaming")
      setError(null)
    }

    applyMainEvent(event)
  }

  const recoverConversationEvents = React.useEffectEvent(
    async (conversationId: string, keepPolling = true) => {
      if (!accessToken || !conversationId) {
        return
      }

      const isTrackedConversation =
        activeStreamConversationIdRef.current === conversationId ||
        currentConversationIdRef.current === conversationId

      if (recoveryInFlightRef.current) {
        return
      }

      if (!isTrackedConversation) {
        return
      }

      if (terminalEventSeenRef.current || streamStatusRef.current === "error") {
        clearRecoveryTimer()
        return
      }

      recoveryInFlightRef.current = true
      try {
        const afterSeq = conversationSeqRef.current.get(conversationId)
        const response = await getConversationEvents(
          accessToken,
          conversationId,
          {
            afterSeq,
            max: 200,
          }
        )

        for (const envelope of response.events) {
          applyEnvelopeEvent(envelope)
        }
        if (response.events.length === 0 && !terminalEventSeenRef.current) {
          const conversation = await getConversation(accessToken, conversationId)
          settleConversationRecovery(conversation)
        }
      } catch (recoveryError) {
        if (!terminalEventSeenRef.current && isTrackedConversation) {
          updateStreamStatus("recovering")
          setError(
            reportChatError(
              recoveryError,
              i18n.t("chat.gateway.reconnecting"),
              i18n.t("chat.gateway.reconnectFailedTitle"),
              {
                toast: false,
                format: (message) =>
                  i18n.t("chat.gateway.reconnectingWithMessage", { message }),
              }
            )
          )
        }
      } finally {
        recoveryInFlightRef.current = false
        const shouldContinueRecovery =
          streamStatusRef.current === "streaming" ||
          streamStatusRef.current === "recovering"

        if (
          keepPolling &&
          (activeStreamConversationIdRef.current === conversationId ||
            currentConversationIdRef.current === conversationId) &&
          !terminalEventSeenRef.current &&
          shouldContinueRecovery
        ) {
          clearRecoveryTimer()
          recoveryTimerRef.current = window.setTimeout(() => {
            void recoverConversationEvents(conversationId, true)
          }, 1200)
        }
      }
    }
  )

  const resumeConversationStream = React.useEffectEvent(
    async (
      conversationId: string,
      runId?: string | null,
      afterSeq?: number | null
    ) => {
      if (!accessToken || !conversationId) {
        return
      }

      clearRecoveryTimer()
      recoveryInFlightRef.current = false
      resetTurnState()

      activeStreamConversationIdRef.current = conversationId
      activeRunIdRef.current = runId ?? null
      assistantEntryIdRef.current = findAssistantEntryIdForRun(
        entriesRef.current,
        runId
      )
      updateStreamStatus("recovering")
      setError(i18n.t("chat.gateway.pageRestored"))
      persistResumeState({
        conversationId,
        runId: runId ?? null,
        afterSeq: afterSeq ?? conversationSeqRef.current.get(conversationId) ?? null,
        force: true,
      })

      try {
        const outcome = await runtimeControllerRef.current.connect(
          conversationId,
          runId ?? null,
          afterSeq ?? null,
          applyEnvelopeEvent,
          (targetConversationId, targetRunId, cursor, signal, onEnvelope) =>
            subscribeConversationEvents(accessToken, targetConversationId, {
              runId: targetRunId,
              afterSeq: cursor,
              signal,
              onEnvelope,
            })
        )

        if (outcome === "aborted") {
          clearRecoveryTimer()
          activeStreamConversationIdRef.current = null
          activeRunIdRef.current = null
          updateStreamStatus("idle")
          return
        }
        if (!terminalEventSeenRef.current) {
          updateStreamStatus("recovering")
          setError(i18n.t("chat.gateway.streamCatchup"))
          await recoverConversationEvents(conversationId, true)
        }
      } catch (resumeError) {
        const message = reportChatError(
          resumeError,
          i18n.t("chat.gateway.reconnectFailed"),
          i18n.t("chat.gateway.reconnectFailedTitle"),
          { toast: false }
        )
        updateStreamStatus("recovering")
        setError(i18n.t("chat.gateway.reconnectingWithMessage", { message }))
        await recoverConversationEvents(conversationId, true)
      }
    }
  )

  const applyEnvelopeEvent = React.useEffectEvent((envelope: GatewayChatStreamEnvelope) => {
    if (envelope.type === "queued") {
      return
    }

    if (envelope.type === "event") {
      const identity = getConversationEventIdentity(envelope.event)
      if (!identity) {
        console.warn(
          "Ignoring gateway envelope without conversation/run identity",
          envelope
        )
        return
      }
      const previousRuntime = runtimeStoreRef.current.get(identity.conversationId)
      const nextRuntime = runtimeStoreRef.current.applyEvent(envelope.event)
      if (!nextRuntime || nextRuntime === previousRuntime) {
        return
      }
      setConversationLastSeq(identity.conversationId, envelope.event.seq)
      persistResumeState({
        conversationId: identity.conversationId,
        runId: identity.runId,
        afterSeq: envelope.event.seq,
      })
      if (currentConversationIdRef.current !== identity.conversationId) {
        void refreshConversations().catch(() => {})
        return
      }
      bindTriggerUserMessage(envelope.event)
      bindActiveAssistantRun(identity.runId)
    }

    if (envelope.type === "error") {
      const errorMessage = formatSendErrorMessage(envelope.error)
      recoveryInFlightRef.current = false
      clearRecoveryTimer()
      updateStreamStatus("recovering")
      setError(errorMessage)
      const conversationId =
        activeStreamConversationIdRef.current ?? currentConversationIdRef.current
      if (conversationId) {
        void recoverConversationEvents(conversationId, true)
      }
      return
    }

    const fingerprint = getEventFingerprint(envelope.event)
    if (seenEventRef.current.has(fingerprint)) {
      return
    }

    seenEventRef.current.add(fingerprint)
    notifyWorkspaceToolResult(envelope.event)
    applyEvent(envelope.event)
  })

  const syncConversationIfBehind = React.useEffectEvent(
    async (conversationId: string | null | undefined) => {
      if (!accessToken || !conversationId) {
        return
      }

      if (catchupInFlightRef.current) {
        return
      }

      const activeConversationId =
        activeStreamConversationIdRef.current ?? currentConversationIdRef.current
      const status = streamStatusRef.current
      if (
        conversationId === activeConversationId &&
        (status === "streaming" || status === "recovering")
      ) {
        void recoverConversationEvents(conversationId, false)
        return
      }

      if (status === "error") {
        return
      }

      catchupInFlightRef.current = true
      try {
        const hasCursor = conversationSeqRef.current.has(conversationId)
        if (hydratedConversationIdRef.current !== conversationId || !hasCursor) {
          await syncLatestConversationMessagesPage(conversationId)
          return
        }

        const afterSeq = conversationSeqRef.current.get(conversationId)
        const response = await getConversationEvents(
          accessToken,
          conversationId,
          {
            afterSeq,
            max: 1,
          }
        )

        if (response.events.length > 0) {
          await Promise.all([
            refreshConversations(),
            syncLatestConversationMessagesPage(conversationId),
            refreshPendingInputsForConversation(conversationId),
          ])
          return
        }

        setConversationLastSeq(conversationId, response.next_seq ?? afterSeq ?? 0)
      } catch (catchupError) {
        reportChatError(
          catchupError,
          i18n.t("chat.gateway.syncFailed"),
          i18n.t("chat.gateway.syncFailedTitle")
        )
      } finally {
        catchupInFlightRef.current = false
      }
    }
  )

  useActivePageRefresh(
    () => {
      const conversationId =
        activeStreamConversationIdRef.current ?? currentConversationIdRef.current
      if (conversationId) {
        return syncConversationIfBehind(conversationId)
      }
    },
    { enabled: Boolean(accessToken) }
  )

  React.useEffect(() => {
    if (!accessToken || !currentConversationId) {
      return
    }

    if (hydratedConversationId !== currentConversationId) {
      return
    }

    if (activeStreamConversationIdRef.current) {
      return
    }

    void syncConversationIfBehind(currentConversationId)
  }, [
    accessToken,
    currentConversationId,
    hydratedConversationId,
  ])

  React.useEffect(() => {
    if (!accessToken || !currentConversationId) {
      return
    }

    if (hydratedConversationId !== currentConversationId) {
      return
    }

    if (
      streamStatusRef.current === "streaming" ||
      streamStatusRef.current === "recovering" ||
      activeStreamConversationIdRef.current
    ) {
      return
    }

    const pendingMatches = readConversationResumeState(currentConversationId)
    const liveRunId = selectedLiveRun?.id ?? null
    const resumeCursor = getLiveRunResumeCursor(
      liveRunId,
      pendingMatches?.runId,
      pendingMatches?.afterSeq
    )

    if (
      pendingMatches &&
      (!resumeCursor || pendingMatches.runId !== resumeCursor.runId)
    ) {
      clearConversationResumeState(currentConversationId)
    }

    if (!resumeCursor) {
      return
    }

    const afterSeq =
      resumeCursor.afterSeq ??
      conversationSeqRef.current.get(currentConversationId) ??
      null

    void resumeConversationStream(
      currentConversationId,
      resumeCursor.runId,
      afterSeq
    )
  }, [
    accessToken,
    currentConversationId,
    hydratedConversationId,
    selectedConversation?.current_run_id,
    selectedLiveRun?.id,
  ])

  function clearConversation() {
    messageProjectionRequestRef.current += 1
    setEntries([])
    entriesRef.current = []
    setDisplayedConversationId(null)
    displayedConversationIdRef.current = null
    hydratedConversationIdRef.current = null
    setHydratedConversationId(null)
    setIsLoadingMessages(false)
    setAwaitingHumanRunId(null)
    setError(null)
    setIsSubmittingInput(false)
    setRenderedEntryLimit(INITIAL_RENDERED_ENTRY_COUNT)
    pendingOlderLoadMetricsRef.current = null
    olderMessagesInFlightCursorRef.current = null
    setOlderMessagesCursor(null)
    setHasOlderMessages(false)
    setIsLoadingOlderEntries(false)
    resetTurnState()
    clearRecoveryTimer()
    activeStreamConversationIdRef.current = null
    activeRunIdRef.current = null
    recoveryInFlightRef.current = false
    setShowScrollToBottom(false)
    autoStickToBottomRef.current = true
    lastViewportScrollTopRef.current = 0
  }

  function startNewChat() {
    selectConversationTarget(null)
    abortRef.current?.abort()
    runtimeControllerRef.current.disconnectAll()
    updateStreamStatus("idle")
    clearConversation()
  }

  async function handleStop() {
    const conversationId =
      activeStreamConversationIdRef.current ?? currentConversationIdRef.current

    if (!conversationId || !accessToken) {
      abortRef.current?.abort()
      runtimeControllerRef.current.disconnectAll()
      return
    }

    setError(null)

    try {
      await stopConversationRun(accessToken, conversationId)
    } catch (stopError) {
      const message = reportChatError(
        stopError,
        i18n.t("chat.gateway.stopFailed"),
        i18n.t("chat.gateway.stopFailedTitle")
      )
      setError(message)
      appendSystemMessage(
        i18n.t("chat.gateway.stopFailedWithMessage", { message })
      )
    }
  }

  async function handleResolveApproval(entryId: string, approved: boolean) {
    if (!accessToken || !currentWorkspace) {
      return
    }

    const entry = entries.find(
      (item): item is ApprovalEntry =>
        item.role === "approval" && item.id === entryId
    )
    if (!entry || !entry.approvalId) {
      return
    }

    updateApprovalEntry(entryId, (current) => ({
      ...current,
      status: approved ? "approving" : "rejecting",
      error: null,
    }))
    setError(null)
    updateStreamStatus("streaming")
    setAwaitingHumanRunId(null)

    try {
      if (approved) {
        await approveSandboxApproval(accessToken, currentWorkspace.id, {
          approval_id: entry.approvalId,
        })
      } else {
        await rejectSandboxApproval(accessToken, currentWorkspace.id, {
          approval_id: entry.approvalId,
        })
      }

      updateApprovalEntry(entryId, (current) => ({
        ...current,
        status: approved ? "approved" : "rejected",
        error: null,
      }))

      if (!entry.runId && !entry.sessionKey) {
        updateStreamStatus("completed")
        appendSystemMessage(
          approved
            ? i18n.t("chat.gateway.approvedNoRun")
            : i18n.t("chat.gateway.rejected")
        )
        return
      }

      const targetConversationId = currentConversationIdRef.current
      if (!targetConversationId) {
        throw new Error(i18n.t("chat.gateway.approvalFailed"))
      }
      const resumed = await resumeRunWithApproval(
        accessToken,
        currentWorkspace.id,
        {
          run_id: entry.runId,
          session_key: entry.sessionKey,
          need_id: entry.needId,
          approved,
        }
      )
      applyResumeResponse(resumed, targetConversationId)
    } catch (approvalError) {
      const message = reportChatError(
        approvalError,
        i18n.t("chat.gateway.approvalFailed"),
        i18n.t("chat.gateway.approvalFailed")
      )
      updateApprovalEntry(entryId, (current) => ({
        ...current,
        status: "error",
        error: message,
      }))
      updateStreamStatus("error")
      setError(message)
      appendSystemMessage(
        i18n.t("chat.gateway.approvalFailedWithMessage", { message })
      )
    }
  }

  async function handleSubmitUserInput(response: AgentUserInputResponse) {
    if (!accessToken || !currentWorkspace) {
      throw new Error(i18n.t("chat.agent.answerSubmitFailed"))
    }

    if (
      !selectedPendingUserInput ||
      selectedPendingUserInput.runId !== response.runId ||
      selectedPendingUserInput.needId !== response.needId
    ) {
      throw new Error(i18n.t("chat.agent.answerSubmitFailed"))
    }

    const pendingTool = findToolInEntries(entries, response.toolId, response.runId)
    if (!pendingTool || (!pendingTool.runId && !pendingTool.sessionKey)) {
      throw new Error(i18n.t("chat.agent.answerSubmitFailed"))
    }

    setError(null)
    setEntries((current) =>
      current.map((entry) =>
        updateUserInputToolInEntry(entry, response.toolId, response.runId, (tool) => ({
          ...tool,
          status: "running",
        }))
      )
    )

    const targetConversationId = currentConversationIdRef.current
    if (!targetConversationId) {
      throw new Error(i18n.t("chat.agent.answerSubmitFailed"))
    }
    try {
      const resumed = await resumeRunWithUserInput(
        accessToken,
        currentWorkspace.id,
        {
          run_id: pendingTool.runId,
          session_key: pendingTool.sessionKey,
          need_id: response.needId,
          input: response.input,
        }
      )
      applyResumeResponse(resumed, targetConversationId)
      setEntries((current) =>
        current.map((entry) =>
          updateUserInputToolInEntry(entry, response.toolId, response.runId, (tool) => ({
            ...tool,
            status: "succeeded",
            answer: response.input,
          }))
        )
      )
    } catch (submitError) {
      setEntries((current) =>
        current.map((entry) =>
          updateUserInputToolInEntry(entry, response.toolId, response.runId, (tool) => ({
            ...tool,
            status: "failed",
          }))
        )
      )
      throw submitError
    }
  }

  // 普通输入始终交给后端裁决立即执行或入队；前端不再推断 run 是否活跃。
  async function sendContentToApi(
    content: string,
    mode?: "guided",
    onAccepted?: () => void
  ) {
    if (!accessToken || !content.trim()) {
      return
    }
    const submissionModelProfileId = resolveConfirmedComposerModelProfileId(
      selectedModelProfileId,
      modelProfilesLoadedRef.current,
      modelProfilesRef.current.map((profile) => profile.id)
    )
    const submissionRuntimeSelection = {
      modelProfileId: submissionModelProfileId,
      sandboxEnvironmentId: selectedSandboxEnvironmentId,
    }
    const sandboxPayload = selectedSandboxEnvironmentId
      ? { environment_id: selectedSandboxEnvironmentId }
      : undefined
    const submissionConversationId =
      currentConversationIdRef.current ?? currentConversationId
    const submissionCapabilityExposure = capabilityExposureForSubmission(
      capabilityExposureSelectionRef.current,
      submissionConversationId,
      hydratedConversationIdRef.current
    )
    const iterationRequestedForSubmission =
      agentIterationConversationId === submissionConversationId
      && isAgentIterationResolved
        ? agentIterationRequested
        : undefined

    if (mode === "guided") {
      const targetConversationId = submissionConversationId
      if (!targetConversationId) {
        return
      }

      setError(null)
      const optimisticId = createMessageId("guided")
      beginGuidedUserTurn(content, optimisticId)
      try {
        await streamConversationSend(
          accessToken,
          {
            conversation_id: targetConversationId,
            content,
            stream: false,
            channel: "web",
            input_mode: mode,
            model_profile_id: submissionModelProfileId || undefined,
            sandbox: sandboxPayload,
            agent_iteration_requested: iterationRequestedForSubmission,
            capability_exposure: submissionCapabilityExposure,
          },
          {
            onEnvelope: (envelope) => {
              applyEnvelopeEvent(envelope)
            },
          }
        )
        if (typeof window !== "undefined") {
          commitAcceptedComposerRuntimeSelection(
            window.localStorage,
            targetConversationId,
            submissionRuntimeSelection
          )
        }
        return true
      } catch (enqueueError) {
        setEntries((current) => current.filter((entry) => entry.id !== optimisticId))
        const message = reportChatError(
          enqueueError,
          i18n.t("chat.gateway.sendFailed"),
          i18n.t("chat.gateway.sendFailedTitle"),
          { format: formatSendErrorMessage }
        )
        setError(message)
        return false
      }
    }

    const controller = new AbortController()
    setError(null)
    setIsSubmittingInput(true)

    let targetConversationId = submissionConversationId
    if (!targetConversationId) {
      try {
        const createdConversation = await createConversation(buildConversationTitle(content))
        targetConversationId = createdConversation.id
        skipNextConversationSyncRef.current = targetConversationId
        clearConversation()
        setIsSubmittingInput(true)
        selectConversationTarget(targetConversationId)
        if (typeof window !== "undefined") {
          writeComposerRuntimeSelectionDraft(
            window.localStorage,
            targetConversationId,
            submissionRuntimeSelection
          )
        }
      } catch (createError) {
        setIsSubmittingInput(false)
        const message = reportChatError(
          createError,
          i18n.t("chat.gateway.initFailed"),
          i18n.t("chat.gateway.initFailedTitle")
        )
        setError(message)
        return false
      }
    }

    try {
      await primeConversationCursor(targetConversationId)
    } catch (primeError) {
      setIsSubmittingInput(false)
      const message = reportChatError(
        primeError,
        i18n.t("chat.gateway.initFailed"),
        i18n.t("chat.gateway.initFailedTitle")
      )
      setError(message)
      return false
    }

    let acceptedAsRun = false
    let accepted = false
    let queued = false
    let userMessageCommitted = false
    const acceptSubmission = (commitSelection = true) => {
      if (accepted) {
        return
      }
      accepted = true
      if (typeof window !== "undefined") {
        if (commitSelection) {
          commitAcceptedComposerRuntimeSelection(
            window.localStorage,
            targetConversationId,
            submissionRuntimeSelection
          )
        } else {
          writeRecentComposerRuntimeSelection(
            window.localStorage,
            submissionRuntimeSelection
          )
        }
      }
      setIsSubmittingInput(false)
      onAccepted?.()
    }

    try {
      await streamConversationSend(
        accessToken,
        {
          conversation_id: targetConversationId,
          content,
          stream: true,
          channel: "web",
          input_mode: mode, // 仅引导模式显式传递；其他情况由后端根据活跃状态自动决定
          model_profile_id: submissionModelProfileId || undefined,
          sandbox: sandboxPayload,
          agent_iteration_requested: iterationRequestedForSubmission,
          capability_exposure: submissionCapabilityExposure,
        },
        {
          signal: controller.signal,
          onEnvelope: (envelope) => {
            if (envelope.type === "queued") {
              acceptSubmission(false)
              queued = true
              if (currentConversationIdRef.current === targetConversationId) {
                setPreInputQueue((prev) => {
                  const id =
                    envelope.pending_id != null
                      ? `db-${envelope.pending_id}`
                      : createMessageId("preinput")
                  if (prev.some((item) => item.id === id)) {
                    return prev
                  }
                  return [...prev, { id, content, status: "queued" }]
                })
              }
              return
            }

            acceptSubmission()
            if (!acceptedAsRun) {
              acceptedAsRun = true
              const previousController = abortRef.current
              abortRef.current = controller
              previousController?.abort()
              clearRecoveryTimer()
              recoveryInFlightRef.current = false
              resetTurnState()
              activeStreamConversationIdRef.current = targetConversationId
              updateStreamStatus("streaming")
              persistResumeState({
                conversationId: targetConversationId,
                runId: null,
                afterSeq:
                  conversationSeqRef.current.get(targetConversationId) ?? null,
                force: true,
              })
            }
            if (!userMessageCommitted) {
              userMessageCommitted = true
              if (currentConversationIdRef.current === targetConversationId) {
                appendUserMessage(content)
                ensureAssistantEntry({
                  modelProfileId: submissionModelProfileId,
                  sandboxEnvironmentId: selectedSandboxEnvironmentId,
                })
              }
            }
            applyEnvelopeEvent(envelope)
          },
        }
      )

      if (queued) {
        setIsSubmittingInput(false)
        return true
      }
      if (!acceptedAsRun) {
        setIsSubmittingInput(false)
        return false
      }

      if (!controller.signal.aborted) {
        setIsSubmittingInput(false)
        if (abortRef.current === controller) {
          abortRef.current = null
        }
        if (!terminalEventSeenRef.current) {
          updateStreamStatus("recovering")
          setError(i18n.t("chat.gateway.streamCatchup"))
          await recoverConversationEvents(targetConversationId, true)
        }
      }
    } catch (streamError) {
      setIsSubmittingInput(false)
      if (controller.signal.aborted) {
        if (abortRef.current === controller) {
          clearRecoveryTimer()
          abortRef.current = null
          activeStreamConversationIdRef.current = null
          activeRunIdRef.current = null
          updateStreamStatus("idle")
        }
        return accepted
      }

      const message = reportChatError(
        streamError,
        i18n.t("chat.gateway.sendFailed"),
        i18n.t("chat.gateway.sendFailedTitle"),
        { toast: !acceptedAsRun, format: formatSendErrorMessage }
      )
      const recoverable =
        typeof streamError === "object" &&
        streamError !== null &&
        "recoverable" in streamError
          ? Boolean((streamError as { recoverable?: unknown }).recoverable)
          : true

      if (acceptedAsRun && recoverable) {
        if (abortRef.current === controller) {
          abortRef.current = null
        }
        updateStreamStatus("recovering")
        setError(i18n.t("chat.gateway.reconnectingWithMessage", { message }))
        await recoverConversationEvents(targetConversationId, true)
        return true
      }

      if (acceptedAsRun) {
        activeStreamConversationIdRef.current = null
        activeRunIdRef.current = null
        clearConversationResumeState(targetConversationId)
        updateStreamStatus("error")
      }
      setError(message)
      if (acceptedAsRun) {
        appendSystemMessage(
          i18n.t("chat.gateway.sendFailedWithMessage", { message })
        )
        updateAssistantEntry((entry) =>
          entry
            ? {
                ...entry,
                status: "error",
                pane: finalizePane(entry.pane),
              }
            : null
        )
      }
      return acceptedAsRun
    } finally {
      if (abortRef.current === controller && !controller.signal.aborted) {
        abortRef.current = null
      }
    }

    return true
  }

  async function handleSend() {
    const content = composer.trim()
    if (!content || !accessToken || isSubmittingInput) {
      return
    }

    const submittedComposer = composer
    await sendContentToApi(content, undefined, () => {
      setComposer((current) => (current === submittedComposer ? "" : current))
    })
  }

  function handleSandboxEnvironmentChange(value: string) {
    setSelectedSandboxEnvironmentId(value)
    if (typeof window !== "undefined") {
      const selection = {
        modelProfileId: selectedModelProfileId,
        sandboxEnvironmentId: value,
      }
      if (currentConversationId) {
        writeComposerRuntimeSelectionDraft(
          window.localStorage,
          currentConversationId,
          selection
        )
      } else {
        writeRecentComposerRuntimeSelection(window.localStorage, selection)
      }
    }
  }

  function handleModelProfileChange(value: string) {
    setSelectedModelProfileId(value)
    if (typeof window !== "undefined") {
      const selection = {
        modelProfileId: value,
        sandboxEnvironmentId: selectedSandboxEnvironmentId,
      }
      if (currentConversationId) {
        writeComposerRuntimeSelectionDraft(
          window.localStorage,
          currentConversationId,
          selection
        )
      } else {
        writeRecentComposerRuntimeSelection(window.localStorage, selection)
      }
    }
  }

  function handleCapabilityExposureChange(
    selection: CapabilityExposureSelection
  ) {
    const previous = capabilityExposureSelectionRef.current
    capabilityExposureSelectionRef.current = selection
    setCapabilityExposureSelection(selection)
    const conversationId = currentConversationIdRef.current
    if (!accessToken || !conversationId) return

    capabilityExposureSaveChainRef.current = capabilityExposureSaveChainRef.current
      .catch(() => undefined)
      .then(async () => {
        try {
          await setConversationCapabilityExposure(
            accessToken,
            conversationId,
            selection
          )
        } catch (caught) {
          if (
            currentConversationIdRef.current === conversationId &&
            capabilityExposureSelectionRef.current === selection
          ) {
            capabilityExposureSelectionRef.current = previous
            setCapabilityExposureSelection(previous)
          }
          reportChatError(
            caught,
            i18n.t("chat.composer.capabilityUpdateFailed"),
            i18n.t("chat.composer.capabilityUpdateFailedTitle")
          )
        }
      })
  }

  function handlePromoteToGuided(id: string) {
    const item = preInputQueue.find((q) => q.id === id)
    if (!item || item.status === "promoting") {
      return
    }

    const dbId = id.startsWith("db-") ? Number(id.slice(3)) : null
    if (dbId && accessToken && currentConversationId) {
      const guidedEntryId = beginGuidedUserTurn(item.content)
      setPreInputQueue((prev) => prev.filter((queueItem) => queueItem.id !== id))
      void promotePendingInput(
        accessToken,
        currentConversationId,
        dbId
      ).catch((promoteError) => {
        const message = reportChatError(
          promoteError,
          i18n.t("chat.gateway.promoteFailed"),
          i18n.t("chat.gateway.promoteFailed")
        )
        setEntries((current) => current.filter((entry) => entry.id !== guidedEntryId))
        setPreInputQueue((prev) => {
          if (prev.some((queueItem) => queueItem.id === id)) {
            return prev
          }
          return [...prev, { ...item, status: "queued" }]
        })
        setError(message)
        appendSystemMessage(
          i18n.t("chat.gateway.promoteFailedWithMessage", { message })
        )
      })
      return
    }

    setPreInputQueue((prev) => prev.filter((q) => q.id !== id))
    void sendContentToApi(item.content, "guided")
  }

  function handleDeleteFromQueue(id: string) {
    const item = preInputQueue.find((q) => q.id === id)
    if (!item || item.status === "deleting") {
      return
    }

    const dbId = id.startsWith("db-") ? Number(id.slice(3)) : null
    if (dbId && accessToken && currentConversationId) {
      setPreInputQueue((prev) =>
        prev.map((queueItem) =>
          queueItem.id === id ? { ...queueItem, status: "deleting" } : queueItem
        )
      )
      void deletePendingInput(
        accessToken,
        currentConversationId,
        dbId
      )
        .then(() => {
          setPreInputQueue((prev) => prev.filter((q) => q.id !== id))
        })
        .catch((deleteError) => {
          const message = reportChatError(
            deleteError,
            i18n.t("chat.gateway.deletePendingFailed"),
            i18n.t("chat.gateway.deletePendingFailed")
          )
          setPreInputQueue((prev) =>
            prev.map((queueItem) =>
              queueItem.id === id ? { ...queueItem, status: "queued" } : queueItem
            )
          )
          setError(message)
          appendSystemMessage(
            i18n.t("chat.gateway.deletePendingFailedWithMessage", { message })
          )
        })
      return
    }

    setPreInputQueue((prev) => prev.filter((q) => q.id !== id))
  }

  const resolveApproval = React.useEffectEvent(
    async (entryId: string, approved: boolean) => {
      await handleResolveApproval(entryId, approved)
    }
  )

  const handleApproveApproval = React.useCallback(
    (entryId: string) => {
      void resolveApproval(entryId, true)
    },
    []
  )

  const handleRejectApproval = React.useCallback(
    (entryId: string) => {
      void resolveApproval(entryId, false)
    },
    []
  )

  function handleComposerKeyDown(event: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (
      event.key !== "Enter" ||
      event.shiftKey ||
      event.nativeEvent.isComposing
    ) {
      return
    }

    event.preventDefault()
    void handleSend()
  }

  const trialBinding = agentEvolution?.trial_binding
  const trialAnswer = findEligibleTrialAnswer(renderedEntries, agentEvolution)
  const canAcceptTrial = Boolean(
    agentEvolution?.actions.some(
      (action) => action.action === "accept_definition_trial" && action.enabled
    )
  )
  const canRollbackTrial = Boolean(
    agentEvolution?.actions.some(
      (action) => action.action === "rollback_definition_trial" && action.enabled
    )
  )

  async function resolveInlineTrial(action: "accept" | "rollback") {
    if (!accessToken || !agentEvolution || !trialBinding || trialBinding.mode !== "trial") {
      return
    }
    const accepted = await confirm({
      title:
        action === "accept"
          ? "确认保留生成这条回答的 Agent 版本？"
          : "确认恢复试用前的 Agent 版本？外部工具已经产生的副作用不会回滚。",
      variant: action === "rollback" ? "destructive" : "default",
    })
    if (!accepted) return

    setTrialVerdictBusy(action)
    try {
      await updateAgentDefinitionTrial(accessToken, {
        action,
        conversation_id: agentEvolution.conversation_id,
        workspace_id: agentEvolution.workspace_id ?? undefined,
        expected_version: trialBinding.version,
      })
      await refreshAgentEvolution()
      publishAgentEvolutionChanged({
        conversationId: agentEvolution.conversation_id,
        workspaceId: agentEvolution.workspace_id ?? null,
      })
      notify.success({
        title: action === "accept" ? "已保留此 Agent 版本" : "已恢复之前的 Agent 版本",
      })
    } catch (caught) {
      reportChatError(caught, "Agent 版本裁决失败，请刷新后重试。", "Agent 版本裁决失败")
      await refreshAgentEvolution().catch(() => {})
    } finally {
      setTrialVerdictBusy(null)
    }
  }

  return (
    <>
      <ChatSidebarHeader
        bindStatus={bindStatus}
        selectedConversationTitle={selectedConversationTitle}
        selectedConversationId={currentConversationId}
        conversations={headerConversations}
        onSelectConversation={selectConversationTarget}
        onRefreshConversations={handleRefreshConversationList}
        onStartNewChat={startNewChat}
        isFullScreen={isFullScreen}
        onFullScreenChange={onFullScreenChange}
        onCollapseSidebar={toggleSidebar}
      />

      <SidebarContent className="overflow-hidden bg-sidebar/50">
        <ChatMessageList
          entries={renderedEntries}
          modelDisplayNames={modelDisplayNames}
          sandboxDisplayNames={sandboxDisplayNames}
          hasOlderEntries={hasOlderEntries}
          isLoadingOlderEntries={isLoadingOlderEntries}
          olderEntriesError={olderMessagesError}
          isAwaitingResponse={isAwaitingVisibleResponse}
          isLoadingInitial={
            isLoadingMessages && displayedConversationId === currentConversationId
          }
          showScrollToBottom={showScrollToBottom}
          scrollViewportRef={scrollViewportRef}
          onViewportScroll={handleViewportScroll}
          onLoadOlderConversationMessagesPage={loadOlderConversationMessagesPage}
          onScrollToBottomClick={handleScrollToBottomClick}
          onStreamingContentProgress={handleStreamingContentProgress}
          onApproveApproval={handleApproveApproval}
          onRejectApproval={handleRejectApproval}
          activeHumanRunId={
            awaitingHumanRunId ?? selectedConversation?.current_run_id ?? null
          }
          onSubmitUserInput={handleSubmitUserInput}
          isFullScreen={isFullScreen}
          trialVerdict={
            trialAnswer
              ? {
                  entryId: trialAnswer.id,
                  busyAction: trialVerdictBusy,
                  canAccept: canAcceptTrial,
                  canRollback: canRollbackTrial,
                  onAccept: () => void resolveInlineTrial("accept"),
                  onRollback: () => void resolveInlineTrial("rollback"),
                }
              : null
          }
        />
      </SidebarContent>

      <AgentPlanPanel tool={currentPlanTool} isFullScreen={isFullScreen} />

      <ChatComposer
        isFullScreen={isFullScreen}
        composer={composer}
        error={error}
        isSending={isSending}
        isSubmittingInput={isSubmittingInput}
        canPromoteToGuided={Boolean(selectedLiveRun)}
        preInputQueue={preInputQueue}
        agentDescriptorOptions={agentDescriptorOptions}
        modelOptions={modelOptions}
        isModelCatalogLoaded={isModelCatalogLoaded}
        selectedModelProfileId={selectedModelProfileId}
        sandboxOptions={sandboxOptions}
        isRefreshingSandboxOptions={isRefreshingSandboxOptions}
        selectedSandboxEnvironmentId={selectedSandboxEnvironmentId}
        capabilityExposureSelection={capabilityExposureSelection}
        capabilityExposurePolicy={capabilityExposurePolicy}
        capabilityCatalog={capabilityCatalog}
        capabilityCatalogStatus={capabilityCatalogStatus}
        onCapabilityCatalogRefresh={() =>
          setCapabilityCatalogRevision((revision) => revision + 1)
        }
        agentIterationRequested={agentIterationRequested}
        agentIterationMode={agentEvolution?.effective_mode ?? "disabled"}
        isAgentIterationLoading={isAgentIterationLoading}
        agentIterationUnavailableReason={agentEvolution?.unavailable_reason}
        onComposerChange={setComposer}
        onComposerKeyDown={handleComposerKeyDown}
        onModelProfileChange={handleModelProfileChange}
        onSandboxEnvironmentChange={handleSandboxEnvironmentChange}
        onSandboxOptionsRefresh={() => {
          void refreshSandboxOptions()
        }}
        onCapabilityExposureChange={handleCapabilityExposureChange}
        onAgentIterationChange={(requested) => {
          void handleAgentIterationChange(requested)
        }}
        onSend={() => {
          void handleSend()
        }}
        onStop={() => {
          void handleStop()
        }}
        onPromoteToGuided={handlePromoteToGuided}
        onDeleteFromQueue={handleDeleteFromQueue}
      />
    </>
  )
}
