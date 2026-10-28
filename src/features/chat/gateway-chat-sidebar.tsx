import { acceptsRunLifecycleEvent } from "./runtime/conversation-run-reducer"
import { removeImageFileReference } from "@/lib/workspace-file-reference"
import { Link } from "react-router-dom"
import type { ChatRowWindowHandle } from "@/features/chat/components/chat-row-window"
import { IMAGE_REFERENCE_REQUEST, IMAGE_REFERENCE_TARGET_PROBE, IMAGE_REFERENCE_TARGET_READY, type ImageReferenceRequest } from "@/lib/image-reference-events"
import { ImageAttachmentActions } from "@/features/chat/components/image-attachment-actions"
import { canAnalyzeImageInput } from "./model/capability-catalog-selection";
import { WorkspaceImagePicker } from "@/features/chat/components/workspace-image-picker"
import { useImageAttachments } from "@/features/chat/model/use-image-attachments"
import { ImageAttachments } from "@/features/chat/components/image-attachments"
import type { ImageReference } from "@/lib/api/images"
import { useRunObservationAccess } from "@/features/chat/use-run-observation-access"
import { RunObservationPanel } from "@/features/chat/components/run-observation-panel"
import { ConversationPageLoader } from "@/features/chat/model/conversation-page-loader"
import { useApiResource } from "@/lib/app/use-api-resource"
import type { ConversationTimelineAction, QueuedInputIdentity } from "@/features/chat/model/conversation-entry-reconciliation"
import { parseInputProgress } from "@/features/chat/model/input-progress"
import { matchesConversationOperation } from "@/features/chat/model/conversation-operation-identity"
import { bindAssistantToHumanBoundary } from "@/features/chat/model/human-input-timeline"
import * as React from "react"
import { useTranslation } from "react-i18next"

import {
  SidebarContent,
  useSidebar,
} from "@/components/ui/sidebar"
import {
  finalizePane,
  getLatestToolByName,
  upsertToolInPane,
} from "@/features/chat/chat-pane-state"
import { AgentPlanPanel } from "@/features/chat/components/agent-plan-panel"
import type { AgentUserInputResponse } from "@/features/chat/components/agent-tool-renderers"
import {
  ChatComposer,
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
  isToolEvent,
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
  reconcilePendingApproval,
} from "@/features/chat/model/chat-history"
import {
  hasCanonicalAssistantHandoff,
  projectAcceptedRunStatus,
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
  isConversationScopedEvent,
} from "@/features/chat/model/conversation-event-routing"
import { shouldApplyConversationProjection } from "@/features/chat/model/conversation-projection"
import { commitConversationSelection } from "@/features/chat/model/conversation-selection"
import { notifyWorkspaceOutputEvent, notifyWorkspaceOutputMessages } from "@/features/chat/model/workspace-tool-events"
import { findEligibleTrialAnswer } from "@/features/chat/model/agent-trial-verdict"
import {
  agentNodeManagementTargetKey,
} from "@/features/chat/model/agent-node-management"
import {
  publishAgentEvolutionChanged,
  subscribeAgentEvolutionChanged,
} from "@/features/chat/model/agent-evolution-invalidation"
import {
  commitAcceptedComposerRuntimeSelection,
  readCachedComposerRuntimeSelection,
  reconcileCanonicalComposerRuntimeSelection,
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
  clearPendingInputs,
  deletePendingInput,
  getConversation,
  getConversationPreferences,
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
  resumePendingInputs,
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
  type ResumeRunResponse,
  type SandboxEnvironmentView,
  type SandboxProviderStatusView,
} from "@/features/chat/api/chat-api"
import {
  capabilityExposureForSubmission,
  reconcileCapabilityExposureDraftPolicy,
} from "@/features/chat/model/capability-exposure-draft"
import {
  isActionablePreInput,
} from "@/features/chat/model/pending-input"
import { hasUnsettledConversationInput } from "@/lib/api/chat/conversation-admission"
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
import { modelFailurePresentationFromEvent } from "@/features/chat/model/model-failure-presentation"

function formatSendErrorMessage(message: string) {
  return message.trim() === "no_available_model"
    ? i18n.t("chat.gateway.noModel")
    : message
}

function formatRunFailureMessage(event: GatewayChatStreamEvent) {
  const failure = modelFailurePresentationFromEvent(event)
  if (!failure) {
    return formatSendErrorMessage((event.content ?? "Gateway stream failed").trim())
  }
  const lines = [
    failure.translationKey
      ? i18n.t(`chat.gateway.modelFailure.${failure.translationKey}`)
      : formatSendErrorMessage(failure.fallbackMessage),
  ]
  if (failure.retryAfterMs != null) {
    lines.push(
      i18n.t("chat.gateway.modelFailure.retryAfter", {
        seconds: Math.max(1, Math.ceil(failure.retryAfterMs / 1000)),
      })
    )
  }
  if (failure.providerMessage) {
    lines.push(
      i18n.t("chat.gateway.modelFailure.providerMessage", {
        message: failure.providerMessage,
      })
    )
  }
  if (failure.providerCode) {
    lines.push(
      i18n.t("chat.gateway.modelFailure.providerCode", {
        code: failure.providerCode,
      })
    )
  }
  if (failure.providerRequestId) {
    lines.push(
      i18n.t("chat.gateway.modelFailure.requestId", {
        requestId: failure.providerRequestId,
      })
    )
  }
  return lines.join("\n\n")
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
  const { toggleSidebar, setOpen } = useSidebar()
  const {
    accessToken,
    currentSessionId,
    workspaces,
    conversations,
    currentConversationId,
    createConversation,
    getConversationSelectionIdentity,
    selectionVersion: imageReferenceSelectionVersion,
    selectConversation,
    refreshConversations,
    renameConversation,
  } = useAppSession()

  // Storage for uploads is independent of the Agent's user-scoped Workspace access.
  const attachmentWorkspace = workspaces.find(space => space.workspace_type === "personal") ?? null

  const [newDraftGeneration, setNewDraftGeneration] = React.useState(0)
  const submissionLifecycleRef = React.useRef(0)
  const runtimePreferenceRevisionRef = React.useRef(0)
  React.useLayoutEffect(() => {
    submissionLifecycleRef.current += 1
    return () => { submissionLifecycleRef.current += 1 }
  }, [])
  const sendViewRef = React.useRef({ generation: 0, session: currentSessionId, workspace: attachmentWorkspace?.id, conversation: currentConversationId })
  const observedSendViewRef = React.useRef({ session: currentSessionId, workspace: attachmentWorkspace?.id, conversation: currentConversationId })
  if (observedSendViewRef.current.session !== currentSessionId || observedSendViewRef.current.workspace !== attachmentWorkspace?.id || observedSendViewRef.current.conversation !== currentConversationId) {
    // A synchronous selection already fenced the old view. Its ensuing React
    // commit must not invalidate the send that initiated that same handoff.
    const alreadySelected = sendViewRef.current.session === currentSessionId && sendViewRef.current.workspace === attachmentWorkspace?.id && sendViewRef.current.conversation === currentConversationId
    sendViewRef.current = { generation: sendViewRef.current.generation + (alreadySelected ? 0 : 1), session: currentSessionId, workspace: attachmentWorkspace?.id, conversation: currentConversationId }
    observedSendViewRef.current = { session: currentSessionId, workspace: attachmentWorkspace?.id, conversation: currentConversationId }
  }
  const imageDraft = useImageAttachments(`${currentSessionId}:${currentConversationId ?? `new:${newDraftGeneration}`}:${attachmentWorkspace?.id}`, accessToken, attachmentWorkspace?.id, currentSessionId ?? "signed-out")
  React.useEffect(() => {
    const ownsSelection = () => {
      const current = getConversationSelectionIdentity()
      return current.sessionId === currentSessionId && current.version === imageReferenceSelectionVersion
    }
    const acceptReference = (event: Event) => {
      const request = event as ImageReferenceRequest
      if (request.defaultPrevented || !imageDraft.enabled || imageDraft.items.length >= 4 ||
          request.detail.sessionId !== currentSessionId ||
          request.detail.version !== imageReferenceSelectionVersion || !ownsSelection()) return
      imageDraft.addReference(request.detail.image)
      request.preventDefault()
      setOpen(true)
    }
    const probe = (event: Event) => { if (ownsSelection()) event.preventDefault() }
    window.addEventListener(IMAGE_REFERENCE_REQUEST, acceptReference)
    window.addEventListener(IMAGE_REFERENCE_TARGET_PROBE, probe)
    window.dispatchEvent(new Event(IMAGE_REFERENCE_TARGET_READY))
    return () => {
      window.removeEventListener(IMAGE_REFERENCE_REQUEST, acceptReference)
      window.removeEventListener(IMAGE_REFERENCE_TARGET_PROBE, probe)
    }
  }, [currentSessionId, getConversationSelectionIdentity, imageReferenceSelectionVersion, imageDraft, setOpen])
  const [composer, setComposer] = React.useState("")
  const [entries, setEntries] = React.useState<ChatEntry[]>([])
  const [streamStatus, setStreamStatus] = React.useState<StreamStatus>("idle")
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
  const [selectedModelProfileId, setSelectedModelProfileId] = React.useState("")
  const [selectedSandboxEnvironmentId, setSelectedSandboxEnvironmentId] = React.useState("")
  const [capabilityExposureSelection, setCapabilityExposureSelection] =
    React.useState<CapabilityExposureSelection | null>(null)
  const [capabilityExposurePolicy, setCapabilityExposurePolicy] =
    React.useState<CapabilityExposurePolicy | null>(null)
  const [capabilityExposureDraftStatus, setCapabilityExposureDraftStatus] =
    React.useState<"idle" | "loading" | "ready" | "error">("idle")
  const [capabilityExposureDraftRevision, setCapabilityExposureDraftRevision] =
    React.useState(0)
  const [capabilityCatalog, setCapabilityCatalog] = React.useState<
    CapabilityCatalogEntry[]
  >([])
  const [capabilityCatalogStatus, setCapabilityCatalogStatus] = React.useState<
    "idle" | "loading" | "ready" | "error"
  >("idle")
  const [capabilityCatalogRevision, setCapabilityCatalogRevision] = React.useState(0)
  const capabilityCatalogRequestRef = React.useRef(0)
  const capabilityExposurePolicyRequestRef = React.useRef(0)
  const capabilityExposureDraftDirtyRef = React.useRef(false)
  const capabilityExposureSelectionRef = React.useRef(
    capabilityExposureSelection
  )
  // Only a server response can advance this baseline; optimistic drafts cannot.
  const capabilityExposureConfirmedRef = React.useRef<CapabilityExposureSelection | null>(null)
  const capabilityExposureSaveRevisionRef = React.useRef(0)
  const capabilityExposureConfirmedRevisionRef = React.useRef(0)
  const capabilityExposurePendingSavesRef = React.useRef(new Map<number, number>())
  const capabilityExposurePolicyRef = React.useRef(capabilityExposurePolicy)
  const capabilityExposureSaveChainRef = React.useRef<Promise<void>>(
    Promise.resolve()
  )
  const canInspectRun = useRunObservationAccess(accessToken,currentConversationId)
  const [inspectedRun, setInspectedRun] = React.useState<{ conversationId: string; runId: string } | null>(null)
  if (inspectedRun && inspectedRun.conversationId !== currentConversationId) setInspectedRun(null)
  const [agentEvolution, setAgentEvolution] = React.useState<AgentEvolutionProjection | null>(null)
  const [agentIterationRequested, setAgentIterationRequestedState] = React.useState(false)
  const [agentIterationConversationId, setAgentIterationConversationId] =
    React.useState<string | null>(null)
  const [isAgentIterationResolved, setIsAgentIterationResolved] = React.useState(false)
  const [isAgentIterationLoading, setIsAgentIterationLoading] = React.useState(false)
  const [trialVerdictBusy, setTrialVerdictBusy] = React.useState<
    "accept" | "rollback" | null
  >(null)

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

  // Submission ACK ownership is separate from an already admitted run's stream.
  const pendingSubmissionRef = React.useRef<AbortController | null>(null)
  const runtimeStoreRef = React.useRef(new ChatRuntimeStore())
  const runtimeControllerRef = React.useRef(
    new ConversationRuntimeController(runtimeStoreRef.current)
  )
  const selectedRuntime = React.useSyncExternalStore(
    React.useCallback((listener: () => void) => runtimeStoreRef.current.subscribe(listener), []),
    () => currentConversationId ? runtimeStoreRef.current.get(currentConversationId) : null,
    () => null
  )
  const runProjection = React.useSyncExternalStore(
    React.useCallback((listener: () => void) => runtimeStoreRef.current.subscribe(listener), []),
    () => runtimeStoreRef.current.getRunProjection(),
    () => runtimeStoreRef.current.getRunProjection()
  )
  const projectedConversations = React.useMemo(() => conversations.map(conversation => {
    const run = runProjection.getRun(conversation.id)
    const admission = runProjection.getAdmission(conversation.id) ?? conversation.admission
    return { ...conversation, admission, ...(run ? { current_run: run, current_run_id: run.id } : {}) }
  }), [conversations, runProjection])
  const compactingRunId = selectedRuntime?.compacting ? selectedRuntime.runId : null
  React.useEffect(() => {
    for (const conversation of conversations) runtimeStoreRef.current.dispatch(conversation.id, {
      type: "run-snapshot", run: conversation.current_run ?? null, admission: conversation.admission,
    })
  }, [conversations])
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
              return applyAssistantEntryUpdate(nextEntries, updater, update.runId,
                update.kind === "event" ? objectValue(update.event.metadata)?.response_to_message_seq : undefined)
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
  const recoveryRequestIdRef = React.useRef(0)
  const recoveryTimerRef = React.useRef<number | null>(null)
  const recoveryFailureNotifiedRef = React.useRef<string | null>(null)
  const catchupInFlightRef = React.useRef(false)
  const conversationSeqRef = React.useRef(new Map<string, number>())
  const currentConversationIdRef = React.useRef<string | null>(currentConversationId)
  const humanInputSubmissionGenerationRef = React.useRef(0)
  const agentEvolutionWorkspaceIdRef = React.useRef<string | undefined>(undefined)
  const hydratedConversationIdRef = React.useRef<string | null>(hydratedConversationId)
  const streamStatusRef = React.useRef<StreamStatus>("idle")
  const skipNextConversationSyncRef = React.useRef<string | null>(null)
  const messageProjectionRequestRef = React.useRef(0)
  const historyFailureNotifiedRef = React.useRef<string | null>(null)
  const agentEvolutionRequestRef = React.useRef(0)
  const pendingAgentIterationHandoffsRef = React.useRef(
    new Map<string, { requested: boolean }>()
  )
  const seenEventRef = React.useRef(new Set<string>())
  const workspaceObservationsRef = React.useRef({ session: currentSessionId, seen: new Set<string>() })
  if (workspaceObservationsRef.current.session !== currentSessionId) {
    workspaceObservationsRef.current = { session: currentSessionId, seen: new Set<string>() }
  }
  const observedWorkspaceChanges = workspaceObservationsRef.current.seen
  const scrollViewportRef = React.useRef<HTMLDivElement | null>(null)
  const rowWindowRef = React.useRef<ChatRowWindowHandle>(null)
  const autoStickToBottomRef = React.useRef(true)
  const userScrollDirectionRef = React.useRef<"up" | "down" | null>(null)
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
  const backgroundRefreshInFlightRef = React.useRef(false)
  const previousRunObservationsRef = React.useRef<Record<
    string,
    ConversationRunObservation
  > | null>(null)
  const [showScrollToBottom, setShowScrollToBottom] = React.useState(false)
  const pendingInputProjectionRef = React.useRef<{ conversationId: string; inputs: QueuedInputIdentity[] } | null>(null)
  const pendingInputRequestRef = React.useRef(0)
  const reduceCurrentTimeline = React.useCallback((current: ChatEntry[], action: ConversationTimelineAction) => {
    const snapshot = pendingInputProjectionRef.current
    const entries = reduceConversationTimeline(current, action, snapshot?.conversationId === currentConversationIdRef.current ? snapshot.inputs : [])
    const conversationId = currentConversationIdRef.current
    return projectAcceptedRunStatus(entries, conversationId ? runtimeStoreRef.current.getRunProjection().getRun(conversationId) : null)
  }, [])
  const [preInputQueue, setPreInputQueue] = React.useState<PreInputQueueItem[]>([])
  const [blockedPreInputRunStatus, setBlockedPreInputRunStatus] = React.useState<
    string | null
  >(null)
  const [blockedPreInputErrorCode, setBlockedPreInputErrorCode] = React.useState<string | null>(null)
  const [canResumePreInputQueue, setCanResumePreInputQueue] = React.useState(false)
  const [pendingQueueAction, setPendingQueueAction] = React.useState<
    "idle" | "resuming" | "clearing"
  >("idle")
  const [isSubmittingInput, setIsSubmittingInput] = React.useState(false)
  React.useEffect(() => { setIsSubmittingInput(false) }, [currentSessionId, attachmentWorkspace?.id])
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
      setIsSubmittingInput(false)
      sendViewRef.current = { ...sendViewRef.current, generation: sendViewRef.current.generation + 1, conversation: conversationId }
      if (conversationId === null) setNewDraftGeneration((generation) => generation + 1)
      humanInputSubmissionGenerationRef.current += 1
      pendingInputRequestRef.current += 1
      pendingInputProjectionRef.current = null
      setPreInputQueue([])
      setPendingQueueAction("idle")
      setBlockedPreInputRunStatus(null)
      setBlockedPreInputErrorCode(null)
      setCanResumePreInputQueue(false)
      recoveryRequestIdRef.current += 1
      recoveryInFlightRef.current = false
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
        const fold = (viewportRect?.top ?? 0) + (viewport ? Number.parseFloat(getComputedStyle(viewport).scrollPaddingTop) || 0 : 0)
        const anchorElement = viewport && viewportRect ? Array.from(
          viewport.querySelectorAll<HTMLElement>("[data-chat-entry-role]")
        ).find((row) => row.getBoundingClientRect().bottom > fold && row.getBoundingClientRect().top < viewportRect.bottom) : undefined
        const childAnchor = anchorElement && viewportRect ? Array.from(
          anchorElement.querySelectorAll<HTMLElement>("[data-web-node-row]")
        ).find((row) => row.getBoundingClientRect().bottom > fold && row.getBoundingClientRect().top < viewportRect.bottom) : undefined
        conversationWindowCacheRef.current.set(currentId, {
          entries: entriesRef.current,
          renderedEntryLimit,
          olderMessagesCursor,
          hasOlderMessages,
          scrollAnchor: {
            atBottom: !viewport || distanceToBottom < 48,
            scrollTop: viewport?.scrollTop ?? 0,
            rowKey: anchorElement?.dataset.chatRowKey,
            childAnchor: childAnchor?.dataset.chatRowKey && viewportRect ? {
              key: childAnchor.dataset.chatRowKey,
              top: childAnchor.getBoundingClientRect().top - viewportRect.top,
            } : undefined,
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
    const workspaceId = undefined
    const requestTargetKey = agentNodeManagementTargetKey(
      conversationId ?? "",
      workspaceId
    )
    const requestId = ++agentEvolutionRequestRef.current
    setAgentEvolution(null)
    if (!accessToken || !conversationId) {
      if (!accessToken) pendingAgentIterationHandoffsRef.current.clear()
      setAgentIterationRequestedState(false)
      setAgentIterationConversationId(conversationId)
      setIsAgentIterationResolved(false)
      setIsAgentIterationLoading(false)
      return
    }
    if (pendingAgentIterationHandoffsRef.current.has(requestTargetKey)) {
      setAgentIterationRequestedState(
        pendingAgentIterationHandoffsRef.current.get(requestTargetKey)?.requested ?? false
      )
      setAgentIterationConversationId(conversationId)
      setIsAgentIterationResolved(true)
      setIsAgentIterationLoading(true)
      return
    }
    setAgentIterationRequestedState(false)
    setAgentIterationConversationId(conversationId)
    setIsAgentIterationResolved(false)
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
  }, [accessToken, currentConversationId, reportChatError])

  const refreshAgentEvolution = React.useCallback(async () => {
    const conversationId = currentConversationIdRef.current
    if (!accessToken || !conversationId) return
    const workspaceId = undefined
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
      pendingAgentIterationHandoffsRef.current.delete(requestTargetKey)
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
  }, [accessToken])

  function reconcileAgentIterationHandoff(
    conversationId: string,
    workspaceId: string | undefined
  ) {
    const targetKey = agentNodeManagementTargetKey(conversationId, workspaceId)
    const handoff = pendingAgentIterationHandoffsRef.current.get(targetKey)
    if (!handoff || !accessToken) return

    void getAgentEvolutionProjection(accessToken, conversationId, workspaceId)
      .then((projection) => {
        if (pendingAgentIterationHandoffsRef.current.get(targetKey) !== handoff) {
          return
        }
        pendingAgentIterationHandoffsRef.current.delete(targetKey)
        if (
          targetKey !==
            agentNodeManagementTargetKey(
              currentConversationIdRef.current ?? "",
              agentEvolutionWorkspaceIdRef.current
            ) ||
          projection.conversation_id !== conversationId
        ) {
          return
        }
        agentEvolutionRequestRef.current += 1
        setAgentEvolution(projection)
        setAgentIterationRequestedState(projection.requested)
        setAgentIterationConversationId(projection.conversation_id)
        setIsAgentIterationResolved(true)
        setIsAgentIterationLoading(false)
      })
      .catch((caught) => {
        if (pendingAgentIterationHandoffsRef.current.get(targetKey) !== handoff) {
          return
        }
        pendingAgentIterationHandoffsRef.current.delete(targetKey)
        if (
          targetKey !==
          agentNodeManagementTargetKey(
            currentConversationIdRef.current ?? "",
            agentEvolutionWorkspaceIdRef.current
          )
        ) {
          return
        }
        agentEvolutionRequestRef.current += 1
        setIsAgentIterationResolved(false)
        setIsAgentIterationLoading(false)
        reportChatError(
          caught,
          i18n.t("chat.composer.iterationLoadFailed"),
          i18n.t("chat.composer.iterationLoadFailedTitle")
        )
      })
  }

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
    const workspaceId = undefined
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
      if (!conversationId || !accessToken || currentConversationIdRef.current !== conversationId) {
        return
      }

      const requestId = ++pendingInputRequestRef.current
      const generation = humanInputSubmissionGenerationRef.current
      const messageIds = Array.from(new Set(entriesRef.current.flatMap(entry => {
        if (entry.role !== "user" || entry.inputProgress?.phase === "cancelled") return []
        if (entry.inputProgress?.phase === "accepted" && ["completed", "failed", "cancelled"].includes(entry.inputProgress.run_state ?? "")) return []
        const id = entry.inputProgress?.message_id ?? (entry.id.startsWith("message:") ? entry.id.slice(8) : undefined)
        return id ? [id] : []
      })))
      const batches = messageIds.length ? Array.from({length:Math.ceil(messageIds.length / 128)}, (_, index) => messageIds.slice(index * 128, (index + 1) * 128)) : [[]]
      const responses = await Promise.all(batches.map(ids => getPendingInputs(accessToken, conversationId, ids)))
      const res = responses.reduce((latest, response) =>
        (response.admission?.revision ?? -1) > (latest.admission?.revision ?? -1) ? response : latest
      )
      const progress = responses.flatMap(response => (response.input_progress ?? []).flatMap(value => {
        const item = parseInputProgress(value)
        return item?.conversation_id === conversationId ? [item] : []
      }))
      if (currentConversationIdRef.current !== conversationId || requestId !== pendingInputRequestRef.current || generation !== humanInputSubmissionGenerationRef.current) {
        return
      }
      const previousAdmission = runtimeStoreRef.current.get(conversationId).admission
      if (res.admission && previousAdmission && res.admission.revision < previousAdmission.revision) return
      runtimeStoreRef.current.dispatch(conversationId, { type: "admission-snapshot", admission: res.admission ?? null })
      const dbItems = res.pending_inputs.filter(isActionablePreInput)
      // Keep cancellation facts in this view's existing pending projection so a
      // history page already in flight cannot resurrect a removed message.
      // Selection changes discard the projection together with its request generation.
      const previous = pendingInputProjectionRef.current
      const cancelled = new Map<string, QueuedInputIdentity>(
        previous?.conversationId === conversationId
          ? previous.inputs.filter(item => item.cancelled).map(item => [item.messageId, item])
          : []
      )
      for (const fact of progress) {
        if (fact.phase === "cancelled") cancelled.set(fact.message_id, { messageId: fact.message_id, runId: fact.run_id ?? null, cancelled: true })
        if (fact.phase === "accepted") cancelled.delete(fact.message_id)
      }
      const inputs: QueuedInputIdentity[] = [...dbItems.map((item) => ({ messageId: item.message_id, runId: item.run_id, pendingId: item.id, inTimeline: item.queued_in_timeline === true })), ...cancelled.values()]
      pendingInputProjectionRef.current = { conversationId, inputs }
      setEntries((current) => reduceCurrentTimeline(current, { type: "pending-inputs", inputs, progress }))
      setPreInputQueue(
        dbItems.map((item) => ({
          id: `db-${item.id}`,
          messageId: item.message_id,
          inTimeline: item.queued_in_timeline === true,
          content: item.content,
          status: "queued" as const,
        }))
      )
      setBlockedPreInputRunStatus(res.blocked_by_run_status)
      setBlockedPreInputErrorCode(res.blocked_by_error_code ?? null)
      setCanResumePreInputQueue(res.can_resume)
    },
    [accessToken, reduceCurrentTimeline]
  )

  React.useEffect(() => {
    const runtimeController = runtimeControllerRef.current
    return () => {
      pendingSubmissionRef.current = null
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
    if (currentConversationIdRef.current !== currentConversationId) setIsSubmittingInput(false)
    currentConversationIdRef.current = currentConversationId
    humanInputSubmissionGenerationRef.current += 1
    recoveryRequestIdRef.current += 1
    recoveryInFlightRef.current = false
  }, [currentConversationId])

  React.useEffect(() => {
    capabilityExposureSelectionRef.current = capabilityExposureSelection
  }, [capabilityExposureSelection])

  React.useEffect(() => {
    capabilityExposurePolicyRef.current = capabilityExposurePolicy
  }, [capabilityExposurePolicy])

  React.useEffect(() => {
    const requestId = ++capabilityCatalogRequestRef.current
    if (
      !accessToken ||
      (capabilityExposureSelection?.mode !== "custom" && imageDraft.items.length === 0)
    ) {
      setCapabilityCatalog([])
      setCapabilityCatalogStatus("idle")
      return
    }
    setCapabilityCatalogStatus("loading")
    void listConversationCapabilityCatalog(
      accessToken,
      currentConversationId,
      selectedSandboxEnvironmentId || null,
      null,
      selectedModelProfileId || null
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
    imageDraft.items.length,
    currentConversationId,
    selectedSandboxEnvironmentId,
    selectedModelProfileId,
  ])

  React.useEffect(() => {
    const requestId = ++capabilityExposurePolicyRequestRef.current
    if (currentConversationId) {
      setCapabilityExposureDraftStatus("idle")
      return
    }
    if (!accessToken) {
      capabilityExposureDraftDirtyRef.current = false
      capabilityExposureConfirmedRef.current = null
      capabilityExposureSelectionRef.current = null
      capabilityExposurePolicyRef.current = null
      setCapabilityExposureSelection(null)
      setCapabilityExposurePolicy(null)
      setCapabilityExposureDraftStatus("idle")
      return
    }

    setCapabilityExposureDraftStatus("loading")
    void getCapabilityExposureDraft(accessToken)
      .then((draft) => {
        if (
          requestId !== capabilityExposurePolicyRequestRef.current ||
          currentConversationIdRef.current !== null
        ) {
          return
        }
        capabilityExposureConfirmedRef.current = draft.selection
        capabilityExposureConfirmedRevisionRef.current = capabilityExposureSaveRevisionRef.current
        const policy = draft.capability_exposure_policy.policy
        const selection = reconcileCapabilityExposureDraftPolicy(
          capabilityExposureSelectionRef.current,
          capabilityExposureDraftDirtyRef.current,
          draft.selection,
          policy
        )
        capabilityExposureSelectionRef.current = selection
        capabilityExposurePolicyRef.current = policy
        setCapabilityExposureSelection(selection)
        setCapabilityExposurePolicy(policy)
        setCapabilityExposureDraftStatus("ready")
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
        setCapabilityExposureDraftStatus(
          capabilityExposurePolicyRef.current ? "ready" : "error"
        )
      })
  }, [
    accessToken,
    capabilityExposureDraftRevision,
    currentConversationId,
    reportChatError,
  ])

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
    setSelectedModelProfileId(cachedSelection.modelProfileId)
    setSelectedSandboxEnvironmentId(cachedSelection.sandboxEnvironmentId)
  }, [currentConversationId])

  const loadModelCatalog = React.useCallback(
    () => listModelProfiles(accessToken ?? ""), [accessToken]
  )
  const modelCatalog = useApiResource({
    enabled: Boolean(accessToken),
    cacheKey: ["chat-model-profiles", currentSessionId, accessToken],
    load: loadModelCatalog,
  })
  const loadSandboxCatalog = React.useCallback(
    () => listSandboxWorkspaceEnvironments(accessToken ?? "", null), [accessToken]
  )
  const sandboxCatalog = useApiResource({
    enabled: Boolean(accessToken),
    cacheKey: ["chat-sandbox-environments", currentSessionId, accessToken],
    load: loadSandboxCatalog,
  })
  const modelProfiles = React.useMemo(() => modelCatalog.data?.profiles ?? [], [modelCatalog.data])
  const isModelCatalogLoaded = modelCatalog.data !== null
  const isSandboxCatalogLoaded = sandboxCatalog.data !== null
  const isRefreshingSandboxOptions = sandboxCatalog.isLoading || sandboxCatalog.isRefreshing
  const refreshSandboxOptions = sandboxCatalog.reload
  const sandboxOptions = React.useMemo(() => {
    if (!sandboxCatalog.data) return []
    const providersById = new Map(sandboxCatalog.data.providers.map(provider => [provider.provider_id, provider]))
    return sandboxCatalog.data.environments.filter(environment => {
      const provider = providersById.get(environment.provider_id)
      return provider?.status === "online" && ["bound", "ready", "busy"].includes(environment.status)
    }).map(environment => ({
      environmentId: environment.environment_id,
      label: sandboxOptionLabel(environment, providersById.get(environment.provider_id)),
      status: environment.status,
      resultDelivery: providersById.get(environment.provider_id)?.result_delivery,
    }))
  }, [sandboxCatalog.data])

  React.useEffect(() => {
    if (!accessToken) setSelectedModelProfileId("")
  }, [accessToken])

  // 加载 DB 中的 pending 队列并同步到本地状态
  React.useEffect(() => {
    if (!currentConversationId || !accessToken) {
      setPreInputQueue([])
      setBlockedPreInputRunStatus(null)
      setBlockedPreInputErrorCode(null)
      setCanResumePreInputQueue(false)
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
        projectedConversations,
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
    previousRunObservationsRef.current = observeConversationRuns(projectedConversations)
  }, [projectedConversations])

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

  const hasUnfinishedConversation = projectedConversations.some(
    (conversation) => ["active", "awaiting_human", "suspended"].includes(getConversationRunLifecycle(conversation)) ||
      hasUnsettledConversationInput(conversation.admission)
  )
  const isPageActive = usePageActive()

  React.useEffect(() => {
    if (!accessToken || !isPageActive || !selectedSandboxEnvironmentId) return
    const timer = window.setInterval(() => { void refreshSandboxOptions() }, 15_000)
    return () => window.clearInterval(timer)
  }, [accessToken, isPageActive, selectedSandboxEnvironmentId, refreshSandboxOptions])


  React.useEffect(() => {
    if (
      !accessToken ||
      !isPageActive ||
      (!hasUnfinishedConversation && !isSubmittingInput && !currentConversationId)
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
        if (currentConversationId && currentConversationIdRef.current === currentConversationId) await syncConversationIfBehind(currentConversationId)
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
    currentConversationId,
    hasUnfinishedConversation,
    isSubmittingInput,
    isPageActive,
    refreshConversations,
  ])

  const updateStreamStatus = React.useCallback((next: StreamStatus) => {
    streamStatusRef.current = next
    setStreamStatus(next)
  }, [])

  const selectedConversation = React.useMemo(() => {
    return projectedConversations.find(item => item.id === currentConversationId) ?? null
  }, [projectedConversations, currentConversationId])
  React.useEffect(() => {
    if (!accessToken || selectedConversation?.last_message_at) return
    let cancelled = false
    const revision = runtimePreferenceRevisionRef.current
    const conversationId = currentConversationId
    void getConversationPreferences(accessToken).then(({ defaults_json: defaults }) => {
      if (cancelled || currentConversationIdRef.current !== conversationId || runtimePreferenceRevisionRef.current !== revision) return
      if (defaults.model_profile_id) setSelectedModelProfileId(defaults.model_profile_id)
      if (Object.hasOwn(defaults, "sandbox")) setSelectedSandboxEnvironmentId(defaults.sandbox?.environment_id ?? "")
      if (defaults.capability_exposure && !capabilityExposureDraftDirtyRef.current) setCapabilityExposureSelection(defaults.capability_exposure)
    }).catch(() => { /* Existing catalog and explicit choices remain usable. */ })
    return () => { cancelled = true }
  }, [accessToken, currentConversationId, selectedConversation?.last_message_at])

  const selectedLiveRun = React.useMemo(
    () => getLiveConversationRun(selectedConversation),
    [selectedConversation]
  )
  const selectedPendingUserInput = React.useMemo(
    () =>
      selectedConversation?.current_run?.status === "awaiting_human" ? userInputNeedFromRaw(selectedConversation.current_run.pending_need, {
        runId: selectedConversation?.current_run?.id ?? null,
        sessionKey: null,
      }) : null,
    [selectedConversation]
  )
  const selectedPendingApproval = React.useMemo(() =>
    selectedConversation?.current_run?.status === "awaiting_human" ? approvalNeedFromRaw(selectedConversation.current_run.pending_need, {
      runId: selectedConversation.current_run.id, sessionKey: null,
    }) : null, [selectedConversation])

  const auxiliaryVisionAvailable = capabilityCatalogStatus === "ready" && canAnalyzeImageInput(capabilityCatalog, capabilityExposureSelection)
  const modelOptions = React.useMemo<ModelProfileOption[]>(
    () =>
      modelProfiles.map((profile) => ({
        id: profile.id,
        displayName: profile.display_name || profile.id,
        supportsVision: profile.supports_vision,
        supportsAuxiliaryVision: auxiliaryVisionAvailable,
        supportsReasoning: profile.supports_reasoning,
        supportsToolCalls: profile.supports_tool_calls,
      })),
    [modelProfiles, auxiliaryVisionAvailable]
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
  const canStop = isSending || hasUnsettledConversationInput(selectedRuntime?.admission)
  // Admission and transport activity never imply that the Agent is executing.
  const isAwaitingVisibleResponse = selectedRuntime?.lifecycle === "running"
  const selectedConversationTitle =
    selectedConversation?.title || i18n.t("chat.header.newChat")
  const headerConversations = React.useMemo(
    () =>
      projectedConversations.map((conversation) => ({
        id: conversation.id,
        title: conversation.title || i18n.t("chat.gateway.unnamed"),
        updatedAt: conversation.updated_at ?? conversation.last_message_at ?? null,
        runtimeStatus: getConversationRuntimeStatus(
          conversation,
          unreadConversationIds.has(conversation.id)
        ),
      })),
    [projectedConversations, unreadConversationIds]
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
  }, [
    currentConversationId,
    hydratedConversationId,
    selectedPendingUserInput,
  ])
  React.useEffect(() => {
    if (selectedPendingApproval && hydratedConversationId === currentConversationId) {
      setEntries(current => reconcilePendingApproval(current, selectedPendingApproval))
    }
  }, [selectedPendingApproval, hydratedConversationId, currentConversationId])
  const conversationEntries = React.useMemo(
    () =>
      displayedConversationId === currentConversationId
        ? projectAcceptedRunStatus(entries, selectedRuntime?.currentRun)
        : [],
    [currentConversationId, displayedConversationId, entries, selectedRuntime?.currentRun]
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

        return Boolean(entry.content.trim() || (entry.role === "user" && entry.images?.length))
      }),
    [conversationEntries]
  )
  const visibleInputIds = React.useMemo(
    () => new Set(visibleEntries.flatMap(entry => entry.role === "user" ? [entry.id] : [])),
    [visibleEntries]
  )
  // Keep the existing queue row until its canonical bubble actually takes over.
  const displayedPreInputQueue = React.useMemo(
    () => preInputQueue.map(item => item.inTimeline && !visibleInputIds.has(`message:${item.messageId}`)
      ? {...item,inTimeline:false} : item),
    [preInputQueue, visibleInputIds]
  )
  const missingTimelineInputs = preInputQueue.filter(item => item.inTimeline && !visibleInputIds.has(`message:${item.messageId}`)).map(item => item.messageId)
  const pendingTimelineReadKey = currentConversationId && missingTimelineInputs.length
    ? JSON.stringify([currentConversationId, currentSessionId, sendViewRef.current.generation, selectedRuntime?.admission?.revision, missingTimelineInputs])
    : null
  const pendingTimelineReadRef = React.useRef<string | null>(null)
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

    const top = Math.max(0, viewport.scrollHeight - viewport.clientHeight)
    if (Math.abs(viewport.scrollTop - top) <= 1) return
    viewport.scrollTo({
      top,
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
    const movedDown = viewport.scrollTop > lastViewportScrollTopRef.current + 1
    let shouldStickToBottom = autoStickToBottomRef.current

    // Virtual row measurements and viewport resizes can also move scrollTop up.
    // Only actual input intent suspends following; a layout correction cannot.
    if (!shouldStickToBottom && isNearBottom && movedDown && userScrollDirectionRef.current === "down") {
      shouldStickToBottom = true
    }

    lastViewportScrollTopRef.current = viewport.scrollTop
    autoStickToBottomRef.current = shouldStickToBottom
    setShowScrollToBottom(!shouldStickToBottom)
    // A late measurement or native momentum event can land after Latest's
    // scroll write, without changing content size. Keep the same owner at tail.
    if (shouldStickToBottom) scrollToBottom("auto")
    return shouldStickToBottom
  }, [scrollToBottom])

  const handleViewportScrollIntent = React.useCallback((direction: "up" | "down") => {
    userScrollDirectionRef.current = direction
    if (direction === "up") {
      autoStickToBottomRef.current = false
      setShowScrollToBottom(true)
    }
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
      userScrollDirectionRef.current = null
      if (restore.atBottom) scrollToBottom("auto")
      else {
        viewport.scrollTop = restore.scrollTop
        if (restore.rowKey && restore.rowTop !== undefined) {
          rowWindowRef.current?.restoreAnchor(restore.rowKey, restore.rowTop, restore.childAnchor)
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
    if (!metrics || !viewport || isLoadingOlderEntries) {
      return
    }

    // The measured row window owns prepend anchoring; do not apply a second pixel correction.
    pendingOlderLoadMetricsRef.current = null
    setIsLoadingOlderEntries(false)
  }, [renderedEntryCount, entries, isLoadingOlderEntries])

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

    const view = {conversationId:currentConversationId,generation:sendViewRef.current.generation,session:sendViewRef.current.session}
    const ownsView = () => currentConversationIdRef.current === view.conversationId &&
      sendViewRef.current.generation === view.generation && sendViewRef.current.session === view.session
    const viewport = scrollViewportRef.current
    pendingOlderLoadMetricsRef.current = {
      scrollHeight: viewport?.scrollHeight ?? 0,
      scrollTop: viewport?.scrollTop ?? 0,
    }
    setIsLoadingOlderEntries(true)
    setOlderMessagesError(null)
    autoStickToBottomRef.current = false
    userScrollDirectionRef.current = null
    setShowScrollToBottom(true)

    if (hasHiddenLoadedEntries) {
      setRenderedEntryLimit((current) =>
        Math.min(current + RENDERED_ENTRY_INCREMENT, visibleEntries.length)
      )

      if (olderLoadResetTimerRef.current != null) {
        window.clearTimeout(olderLoadResetTimerRef.current)
      }
      olderLoadResetTimerRef.current = window.setTimeout(() => {
        if (!ownsView()) return
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
          !ownsView() || olderMessagesInFlightCursorRef.current !== olderMessagesCursor ||
          currentConversationIdRef.current !== currentConversationId
        ) {
          return
        }

        notifyWorkspaceOutputMessages(response.messages, observedWorkspaceChanges)
        const olderEntries = mapConversationMessagesToEntries(response.messages)
        setEntries((current) =>
          reduceCurrentTimeline(current, {
            type: "prepend-history",
            entries: olderEntries,
          })
        )
        setRenderedEntryLimit((current) => current + olderEntries.length)
        setOlderMessagesCursor(response.page?.before ?? null)
        setHasOlderMessages(Boolean(response.page?.has_older && response.page.before))
        setOlderMessagesError(null)
      })
      .catch((loadError) => {
        if (!ownsView()) return
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
        if (!ownsView()) return
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
    observedWorkspaceChanges,
    reportChatError,
    visibleEntries.length,
    reduceCurrentTimeline,
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

  const [latestPageLoader] = React.useState(() => new ConversationPageLoader<[
    Awaited<ReturnType<typeof getConversationMessages>>,
    Awaited<ReturnType<typeof getConversation>> | null,
    { revision: number; viewGeneration: number; savesPending: boolean },
  ]>())

  const syncLatestConversationMessagesPage = React.useCallback(
    async (
      conversationId: string,
      handoff?: CanonicalAssistantHandoff | null,
      freshness: "fresh" | "coalesce" = "fresh"
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

      const session = sendViewRef.current.session
      const failureKey = JSON.stringify([session, conversationId, sendViewRef.current.generation])
      try {
        const [response, conversationDetail, exposureSnapshot] = await latestPageLoader.load(
          JSON.stringify([accessToken, conversationId]),
          async () => {
            // Tag the actual shared read, including delayed freshness barriers.
            // A caller joining an older flight must inherit that flight's fence.
            const exposureSnapshot = {
              revision: capabilityExposureSaveRevisionRef.current,
              viewGeneration: sendViewRef.current.generation,
              savesPending: Boolean(capabilityExposurePendingSavesRef.current.get(sendViewRef.current.generation)),
            }
            const [messages, detail] = await Promise.all([
              getConversationMessages(accessToken, conversationId, {
                limit: CONVERSATION_MESSAGES_PAGE_LIMIT,
              }),
              getConversation(accessToken, conversationId).catch(() => null),
            ])
            return [messages, detail, exposureSnapshot]
          },
          Boolean(handoff) || freshness === "fresh"
        )
        if (sendViewRef.current.session !== session) return false
        notifyWorkspaceOutputMessages(response.messages, observedWorkspaceChanges)
        const latestEntries = mapConversationMessagesToEntries(response.messages).map((entry) =>
          entry.role === "assistant" ? { ...entry, eventCoverage: response.next_seq ?? 0 } : entry
        )
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
        historyFailureNotifiedRef.current = null
        const hydratedCapabilityExposure =
          conversationDetail?.capability_exposure_selection ?? null
        // A history refresh must not replace a newer optimistic draft.
        if (conversationDetail && !exposureSnapshot.savesPending &&
          sendViewRef.current.generation === exposureSnapshot.viewGeneration &&
          capabilityExposureSaveRevisionRef.current === exposureSnapshot.revision &&
          !capabilityExposurePendingSavesRef.current.get(exposureSnapshot.viewGeneration)) {
          capabilityExposureConfirmedRef.current = hydratedCapabilityExposure
          capabilityExposureConfirmedRevisionRef.current = exposureSnapshot.revision
          capabilityExposureSelectionRef.current = hydratedCapabilityExposure
          setCapabilityExposureSelection(hydratedCapabilityExposure)
        }
        if (conversationDetail) {
          setCapabilityExposurePolicy(conversationDetail.capability_exposure_policy?.policy ?? null)
        }
        if (latestRuntimeSelection) {
          const storage = typeof window !== "undefined" ? window.localStorage : null
          const reconciliation = {
            selection: latestRuntimeSelection,
            shouldApply: !storage || reconcileCanonicalComposerRuntimeSelection(storage, conversationId, latestRuntimeSelection),
          }
          if (reconciliation.shouldApply) {
            setSelectedModelProfileId(reconciliation.selection.modelProfileId)
            if (latestRuntimeSelection.sandboxEnvironmentId != null) {
              setSelectedSandboxEnvironmentId(
                latestRuntimeSelection.sandboxEnvironmentId
              )
            }
          }
        }
        const shouldReplaceTranscript =
          (hydratedConversationIdRef.current !== conversationId ||
            entriesRef.current.length === 0) &&
          !(handoff && !handoffConfirmed && entriesRef.current.length > 0)
        if (shouldReplaceTranscript) {
          // Replacing the projection also replaces its coverage. A previously
          // observed transport cursor must not skip content absent from this page.
          conversationSeqRef.current.set(conversationId, response.next_seq ?? 0)
          runtimeStoreRef.current.dispatch(conversationId, { type: "reset-coverage" })
        }
        if (conversationDetail) runtimeStoreRef.current.dispatch(conversationId, {
          type: "run-snapshot", run: conversationDetail.current_run ?? null, admission: conversationDetail.admission,
        })
        const activity = response.run_activities?.find(item => item.run_id === conversationDetail?.current_run?.id)
        if (activity && conversationDetail && getConversationRunLifecycle(conversationDetail) === "active") runtimeStoreRef.current.dispatch(conversationId, {
          type: "activity-snapshot", runId: activity.run_id, executionEpoch: activity.execution_epoch,
          seq: activity.seq, activityVersion: activity.activity_seq, compacting: activity.compacting,
        })
        setEntries((current) => {
          if (shouldReplaceTranscript) {
            return reduceCurrentTimeline(current, {
              type: "hydrate",
              entries: latestEntries,
            })
          }

          return reduceCurrentTimeline(current, {
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
          // Background triggers may retry the same unread page. One failed
          // loading episode has one owner; a successful read re-arms feedback.
          if (historyFailureNotifiedRef.current !== failureKey) {
            historyFailureNotifiedRef.current = failureKey
            reportChatError(error, i18n.t("chat.gateway.loadConversationFailed"),
              i18n.t("chat.gateway.loadConversationFailedTitle"))
          }
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
    [accessToken, setConversationLastSeq, reduceCurrentTimeline, latestPageLoader, reportChatError, observedWorkspaceChanges]
  )

  React.useEffect(() => {
    if (!currentConversationId || !pendingTimelineReadKey || pendingTimelineReadRef.current === pendingTimelineReadKey) return
    pendingTimelineReadRef.current = pendingTimelineReadKey
    // A pending snapshot can arrive after an older history read has filtered the
    // head. Read after that fact, using the existing fresh/coalesced page loader.
    // One bounded recovery per snapshot/view; failures keep the row and error UI.
    void syncLatestConversationMessagesPage(currentConversationId, null, "fresh").catch(() => {})
  }, [currentConversationId, pendingTimelineReadKey, syncLatestConversationMessagesPage])

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

    runtimeControllerRef.current.disconnectAll()
    clearRecoveryTimer()
    activeStreamConversationIdRef.current = null
    activeRunIdRef.current = null
    terminalEventSeenRef.current = false
    recoveryRequestIdRef.current += 1
    recoveryInFlightRef.current = false
    updateStreamStatus("idle")
    assistantEntryIdRef.current = null
    seenEventRef.current = new Set()
    setShowScrollToBottom(false)
    autoStickToBottomRef.current = true
    lastViewportScrollTopRef.current = 0
    userScrollDirectionRef.current = null
    pendingInitialBottomScrollRef.current = true
    const cachedWindow = currentConversationId
      ? conversationWindowCacheRef.current.get(currentConversationId)
      : null
    applyConversationWindow(currentConversationId, cachedWindow)
    hydratedConversationIdRef.current = null
    if (currentConversationId) {
      capabilityExposureConfirmedRef.current = null
      capabilityExposureSelectionRef.current = null
      capabilityExposurePolicyRef.current = null
      setCapabilityExposureSelection(null)
      setCapabilityExposurePolicy(null)
    }
    pendingOlderLoadMetricsRef.current = null
    olderMessagesInFlightCursorRef.current = null
    setOlderMessagesError(null)
    setIsLoadingOlderEntries(false)

    if (!currentConversationId) {
      return
    }

    // The request owner reports only current-generation failures. Keep cached
    // content visible and consume this effect's already-reported rejection.
    void syncLatestConversationMessagesPage(currentConversationId, null, "coalesce").catch(() => {})
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
    userScrollDirectionRef.current = null
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
    humanInputSubmissionGenerationRef.current += 1
    recoveryRequestIdRef.current += 1
    assistantEntryIdRef.current = null
    activeRunIdRef.current = null
    terminalEventSeenRef.current = false
    resetSeenCaches()
  }

  function applyAssistantEntryUpdate(
    current: ChatEntry[],
    updater: AssistantEntryUpdater,
    targetRunId?: string | null,
    targetInputSequence?: unknown
  ) {
    const targetInputSeq = typeof targetInputSequence === "number" && Number.isSafeInteger(targetInputSequence) ? targetInputSequence : undefined
    const normalizedRunId = targetRunId?.trim() || null
    const assistantId = targetInputSeq != null && normalizedRunId
      ? current.find((entry) => entry.role === "assistant" && entry.timelineUnitId === `run:${normalizedRunId}:anchor:${targetInputSeq + 1}`)?.id ?? null
      : normalizedRunId ? findAssistantEntryIdForRun(current, normalizedRunId) : assistantEntryIdRef.current
    if (!assistantId) {
      const provisional = updater(undefined)
      if (!provisional) return current
      const created = bindAssistantToHumanBoundary(provisional, current, targetInputSeq)
      assistantEntryIdRef.current = created.id
      return reduceCurrentTimeline(current, { type: "assistant-entry", entry: created })
    }

    const index = current.findIndex(
      (entry) => entry.role === "assistant" && entry.id === assistantId
    )
    if (index < 0) {
      const provisional = updater(undefined)
      if (!provisional) return current
      const created = bindAssistantToHumanBoundary(provisional, current, targetInputSeq)
      assistantEntryIdRef.current = created.id
      return reduceCurrentTimeline(current, { type: "assistant-entry", entry: created })
    }

    const existing = current[index]
    if (existing.role !== "assistant") return current

    const next = updater(existing)
    if (!next || next === existing) return current

    return reduceCurrentTimeline(current, { type: "assistant-entry", entry: bindAssistantToHumanBoundary(next, current, targetInputSeq) })
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
          deliveryStatus: "received",
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

  function upsertApprovalEntry(approval: ApprovalEntry) {
    setEntries(current => reconcilePendingApproval(current, approval))
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
    humanInputSubmissionGenerationRef.current += 1
    const conversationId =
      activeStreamConversationIdRef.current ?? currentConversationIdRef.current
    const awaitingRunId = runId ?? activeRunIdRef.current
    terminalEventSeenRef.current = true
    recoveryRequestIdRef.current += 1
    recoveryInFlightRef.current = false
    clearRecoveryTimer()
    activeStreamConversationIdRef.current = null
    activeRunIdRef.current = null
    if (conversationId) {
      clearConversationResumeState(conversationId)
    }
    completeAssistantEntry(undefined, awaitingRunId)
    assistantEntryIdRef.current = null
    updateStreamStatus("completed")
    if (conversationId) {
      // AwaitingHuman is also a canonical handoff: the question must acquire its
      // message_seq before the user can submit the next timeline boundary.
      void syncLatestConversationMessagesPage(conversationId)
        .then(() => refreshConversations()).catch(() => {})
    }
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

  function removeGuidedOptimisticEntry(conversationId: string, optimisticId: string) {
    if (optimisticId.startsWith("message:")) return
    conversationWindowCacheRef.current.removeEntry(conversationId, optimisticId)
    if (currentConversationIdRef.current === conversationId) {
      setEntries((current) => current.filter((entry) => entry.id !== optimisticId))
    }
  }

  function beginGuidedUserTurn(content: string, id = createMessageId("user"), inputRequestId?: string) {
    setEntries((current) => current.some(entry => entry.id === id) ? current : [...current, { id, role: "user", content, inputRequestId, deliveryStatus: "sending", inputMode: "guided" }])
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
    humanInputSubmissionGenerationRef.current += 1
    terminalEventSeenRef.current = true
    recoveryRequestIdRef.current += 1
    recoveryInFlightRef.current = false
    clearRecoveryTimer()
    activeStreamConversationIdRef.current = null
    completeAssistantEntry(undefined, runId)
    activeRunIdRef.current = null
    clearConversationResumeState(conversationId)
    assistantEntryIdRef.current = null
    updateStreamStatus("completed")
    const handoff = !runId || canonicalMessageSeqEnd == null
      ? null
      : { runId, messageSeqEnd: canonicalMessageSeqEnd }
    void refreshConversations().catch(() => {})
    void refreshPendingInputsForConversation(conversationId).catch(() => {})
    void syncTerminalConversationMessages(conversationId, handoff).catch(() => {})
  }

  function refreshFailedConversationProjection(conversationId: string) {
    void Promise.all([
      refreshConversations(),
      refreshPendingInputsForConversation(conversationId),
      syncLatestConversationMessagesPage(conversationId),
    ]).catch(() => {})
  }

  function settleConversationRecovery(conversation: Conversation) {
    const lifecycle = getConversationRunLifecycle(conversation)
    const runId = conversation.current_run?.id ?? null

    if (lifecycle === "active" || (lifecycle === "suspended" && conversation.current_run?.resume_mode === "automatic")) {
      return false
    }
    if (lifecycle === "awaiting_human") {
      markAwaitingHuman(runId)
      return true
    }
    if (lifecycle === "suspended") {
      terminalEventSeenRef.current = true
      clearConversationResumeState(conversation.id)
      recoveryRequestIdRef.current += 1
      recoveryInFlightRef.current = false
      clearRecoveryTimer()
      activeStreamConversationIdRef.current = null
      activeRunIdRef.current = null
      completeAssistantEntry(undefined, runId)
      assistantEntryIdRef.current = null
      updateStreamStatus("idle")
      return true
    }
    if (lifecycle === "failed") {
      terminalEventSeenRef.current = true
      recoveryRequestIdRef.current += 1
      recoveryInFlightRef.current = false
      clearRecoveryTimer()
      activeStreamConversationIdRef.current = null
      activeRunIdRef.current = null
      clearConversationResumeState(conversation.id)
      completeAssistantEntry(undefined, runId)
      assistantEntryIdRef.current = null
      updateStreamStatus("error")
      refreshFailedConversationProjection(conversation.id)
      return true
    }

    if (lifecycle === "completed") {
      finalizeConversationTurn(conversation.id, runId, null)
      return true
    }
    return false
  }

  function applyResumeResponse(
    response: ResumeRunResponse,
    conversationId: string
  ) {
    if (currentConversationIdRef.current !== conversationId) {
      void refreshConversations().catch(() => {})
      return
    }
    const observedRuntime = runtimeStoreRef.current.get(conversationId)
    if ((activeRunIdRef.current && response.run_id && activeRunIdRef.current !== response.run_id) ||
        (observedRuntime.runId === response.run_id && response.execution_epoch != null && observedRuntime.executionEpoch != null &&
         response.execution_epoch < observedRuntime.executionEpoch)) return
    if (response.run_id && response.execution_epoch != null) {
      runtimeStoreRef.current.dispatch(conversationId, {
        type: "connect", runId: response.run_id, executionEpoch: response.execution_epoch,
      })
    }
    if (response.input_message) {
      const canonicalEntries = mapConversationMessagesToEntries([response.input_message])
      setEntries((current) => reduceCurrentTimeline(current, {
        type: "canonical-patch", entries: canonicalEntries,
      }))
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
      projectedEvents.forEach(event => {
        notifyWorkspaceOutputEvent(event, observedWorkspaceChanges)
        applyEvent(event)
      })
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
    if (resumedRunState === "streaming" || resumedRunState === "resuming") {
      void resumeConversationStream(conversationId, response.run_id, undefined, "human-resume")
      void refreshConversations().catch(() => {})
      return
    }
    if (resumedRunState === "failed" || resumedRunState === "busy_rejected") {
      const errorMessage = formatSendErrorMessage(
        response.output?.trim() || i18n.t("chat.gateway.sendFailed")
      )
      terminalEventSeenRef.current = true
      activeRunIdRef.current = null
      updateStreamStatus("error")
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
      void Promise.all([
        refreshConversations(),
        refreshPendingInputsForConversation(conversationId),
      ]).catch(() => {})
      return
    }
    if (resumedRunState === "awaiting_human") {
      markAwaitingHuman(response.run_id ?? null)
      return
    }
    if (resumedRunState === "suspended" || !["completed", "cancelled"].includes(resumedRunState ?? "")) {
      // A receipt does not carry all continuation controls. Observe the canonical
      // run until it explicitly reaches a terminal state.
      void resumeConversationStream(conversationId, response.run_id, undefined, "human-resume")
      void refreshConversations().catch(() => {})
      return
    }

    if (response.output?.trim() && !hasForwardAssistantOutput) {
      assistantEntryIdRef.current = null
      ensureAssistantEntry()
      completeAssistantEntry(response.output)
    }

    terminalEventSeenRef.current = true
    recoveryRequestIdRef.current += 1
    recoveryInFlightRef.current = false
    clearRecoveryTimer()
    if (activeStreamConversationIdRef.current === conversationId) {
      activeStreamConversationIdRef.current = null
    }
    if (!response.run_id || activeRunIdRef.current === response.run_id) {
      activeRunIdRef.current = null
    }
    clearConversationResumeState(conversationId)
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

    if (event.event === "conversation.task_result") {
      void syncLatestConversationMessagesPage(identity.conversationId, null, "coalesce").catch(() => {})
      return
    }
    if (event.event === "input.accepted") {
      const progress = parseInputProgress(objectValue(event.metadata)?.input_progress)
      if (progress && progress.conversation_id === identity.conversationId && progress.run_id === identity.runId) {
        if (progress.kind === "guided") {
          completeAssistantEntry()
          assistantEntryIdRef.current = null
        }
        setEntries((current) => reduceCurrentTimeline(current, {
          type: "input-progress", progress, content: event.content ?? undefined,
        }))
      }
      if (event.metadata?.replayed !== true) {
        void syncLatestConversationMessagesPage(identity.conversationId).catch(() => {})
      }
      return
    }
    if ((event.event.startsWith("pending_input_") || event.event === "run.started") && event.metadata?.replayed !== true) {
      // Invalidate older pending GETs synchronously; the new response owns queue and reason together.
      pendingInputRequestRef.current += 1
      void refreshPendingInputsForConversation(identity.conversationId).catch(() => {})
      void syncLatestConversationMessagesPage(identity.conversationId).catch(() => {})
    }

    // ── Pending Input 事件 ──
    if (event.event === "pending_input_queued") {
      // A wakeup cannot project placement without the authoritative snapshot.
      // The refresh above owns queue contents, blockers and revision together.
      return
    }
    if (event.event === "pending_input_guided") {
      const id = parsePendingInputId(event)
      if (id != null) {
        const snapshot = pendingInputProjectionRef.current
        if (snapshot?.conversationId === identity.conversationId) snapshot.inputs = snapshot.inputs.filter((item) => item.pendingId !== id)
        setPreInputQueue((prev) => prev.filter((q) => q.id !== `db-${id}`))
      }
      return
    }
    if (event.event === "pending_input_consuming") {
      const id = parsePendingInputId(event)
      if (id != null) {
        const snapshot = pendingInputProjectionRef.current
        if (snapshot?.conversationId === identity.conversationId) snapshot.inputs = snapshot.inputs.filter((item) => item.pendingId !== id)
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

    // Replay lifecycle still enters the runtime reducer, but old questions must
    // not terminate this observer or reopen an already answered blocking need.
    if (event.metadata?.replayed === true &&
        (approvalNeedFromEvent(event) || userInputNeedFromEvent(event))) {
      if (isToolEvent(event.event)) applyMainEvent(event)
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
      humanInputSubmissionGenerationRef.current += 1
      const conversationId = identity.conversationId
      const errorMessage = formatRunFailureMessage(event)
      recoveryRequestIdRef.current += 1
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
      refreshFailedConversationProjection(conversationId)
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

    if (event.event === "run.suspended") {
      const runtime = runtimeStoreRef.current.get(identity.conversationId)
      if (runtime.currentRun) settleConversationRecovery({
        ...selectedConversation!, id: identity.conversationId, current_run: runtime.currentRun,
      })
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
        recoveryRequestIdRef.current += 1
        recoveryInFlightRef.current = false
        clearRecoveryTimer()
        activeStreamConversationIdRef.current = null
        activeRunIdRef.current = null
        if (conversationId) {
          clearConversationResumeState(conversationId)
        }
        completeAssistantEntry()
        assistantEntryIdRef.current = null
        updateStreamStatus("completed")
      }
      return
    }

    if (isSubScope(event)) {
      applySubagentEvent(event)
      return
    }

    if (streamStatusRef.current === "recovering") {
      // Business events may also arrive through HTTP catch-up.
      updateStreamStatus("streaming")
    }

    applyMainEvent(event)
  }

  const recoverConversationEvents = React.useEffectEvent(
    async (conversationId: string, keepPolling = true) => {
      if (!accessToken || !conversationId || currentConversationIdRef.current !== conversationId ||
          recoveryInFlightRef.current) return
      if (terminalEventSeenRef.current || streamStatusRef.current === "error") {
        clearRecoveryTimer()
        return
      }
      const readIdentity = () => {
        const runtime = runtimeStoreRef.current.get(conversationId)
        return {
          conversationId: currentConversationIdRef.current,
          runId: activeRunIdRef.current ?? runtime.runId,
          executionEpoch: runtime.executionEpoch,
          generation: humanInputSubmissionGenerationRef.current,
        }
      }
      const expected = readIdentity()
      const requestId = ++recoveryRequestIdRef.current
      const ownsRequest = () => requestId === recoveryRequestIdRef.current
      const isCurrent = () => ownsRequest() && matchesConversationOperation(expected, readIdentity())
      recoveryInFlightRef.current = true
      try {
        const afterSeq = conversationSeqRef.current.get(conversationId)
        const response = await getConversationEvents(accessToken, conversationId, { afterSeq, max: 200 })
        if (!isCurrent()) return
        for (const envelope of response.events) {
          if (!isCurrent()) break
          if (envelope.type === "event") {
            const identity = getConversationEventIdentity(envelope.event)
            if (identity?.conversationId === conversationId && expected.runId &&
                identity.runId !== expected.runId && !isConversationScopedEvent(envelope.event)) {
              // Scanning history advances even when another run is not projected.
              setConversationLastSeq(conversationId, envelope.event.seq)
              continue
            }
          }
          applyEnvelopeEvent(envelope)
          // This synchronous batch may itself observe a newer canonical epoch.
          expected.executionEpoch = runtimeStoreRef.current.get(conversationId).executionEpoch
        }
        if (!isCurrent()) return
        if (response.events.length === 0 && !terminalEventSeenRef.current) {
          const conversation = await getConversation(accessToken, conversationId)
          if (!isCurrent()) return
          const runtime = runtimeStoreRef.current.dispatch(conversationId, {
            type: "run-snapshot", run: conversation.current_run ?? null, admission: conversation.admission,
          })
          if (runtime.runId !== expected.runId) {
            runtimeControllerRef.current.disconnect(conversationId)
            recoveryRequestIdRef.current += 1
            recoveryInFlightRef.current = false
            activeStreamConversationIdRef.current = null
            activeRunIdRef.current = null
            updateStreamStatus("idle")
            void refreshConversations().catch(() => {})
            if (runtime.currentRun && getLiveConversationRun({ ...conversation, current_run: runtime.currentRun })) {
              void resumeConversationStream(conversationId, runtime.runId)
            }
            return
          }
          expected.executionEpoch = runtime.executionEpoch
          settleConversationRecovery({ ...conversation, current_run: runtime.currentRun ?? conversation.current_run })
        }
        if (isCurrent()) recoveryFailureNotifiedRef.current = null
      } catch (recoveryError) {
        if (isCurrent() && !terminalEventSeenRef.current) {
          updateStreamStatus("recovering")
          const failureKey = JSON.stringify([currentSessionId, conversationId, expected.runId, expected.executionEpoch])
          runtimeStoreRef.current.dispatch(conversationId, { type: "recovering" })
          if (recoveryFailureNotifiedRef.current !== failureKey) {
            recoveryFailureNotifiedRef.current = failureKey
            reportChatError(recoveryError, i18n.t("chat.gateway.reconnectFailed"),
              i18n.t("chat.gateway.reconnectFailedTitle"))
          }
        }
      } finally {
        if (ownsRequest()) {
          recoveryInFlightRef.current = false
          if (isCurrent() && keepPolling && !terminalEventSeenRef.current &&
              (streamStatusRef.current === "streaming" || streamStatusRef.current === "recovering")) {
            clearRecoveryTimer()
            recoveryTimerRef.current = window.setTimeout(() => {
              if (isCurrent()) void recoverConversationEvents(conversationId, true)
            }, 1200)
          }
        }
      }
    }
  )

  const resumeConversationStream = React.useEffectEvent(
    async (
      conversationId: string,
      runId?: string | null,
      afterSeq?: number | null,
      reason: "observe" | "human-resume" = "observe"
    ) => {
      if (!accessToken || !conversationId) {
        return
      }

      clearRecoveryTimer()
      recoveryRequestIdRef.current += 1
      recoveryInFlightRef.current = false
      resetTurnState()
      const generation = humanInputSubmissionGenerationRef.current
      const isCurrentConnection = () => currentConversationIdRef.current === conversationId &&
        humanInputSubmissionGenerationRef.current === generation

      activeStreamConversationIdRef.current = conversationId
      activeRunIdRef.current = runId ?? null
      // Human input is a canonical user boundary, even when the run id is unchanged.
      assistantEntryIdRef.current = reason === "human-resume"
        ? null
        : findAssistantEntryIdForRun(entriesRef.current, runId)
      const cursor = afterSeq ?? conversationSeqRef.current.get(conversationId) ?? null
      updateStreamStatus("streaming")
      persistResumeState({
        conversationId,
        runId: runId ?? null,
        afterSeq: cursor,
        force: true,
      })

      try {
        const outcome = await runtimeControllerRef.current.connect(
          conversationId,
          runId ?? null,
          cursor,
          (envelope) => {
            if (isCurrentConnection()) applyEnvelopeEvent(envelope)
          },
          (targetConversationId, targetRunId, cursor, signal, onEnvelope, onOpen) =>
            subscribeConversationEvents(accessToken, targetConversationId, {
              runId: targetRunId,
              afterSeq: cursor,
              signal,
              onOpen: () => {
                onOpen()
                if (!signal.aborted && isCurrentConnection()) recoveryFailureNotifiedRef.current = null
              },
              onEnvelope,
            })
        )

        if (!isCurrentConnection()) return
        if (outcome === "aborted") {
          clearRecoveryTimer()
          activeStreamConversationIdRef.current = null
          activeRunIdRef.current = null
          updateStreamStatus("idle")
          return
        }
        if (!terminalEventSeenRef.current) {
          updateStreamStatus("recovering")
          await recoverConversationEvents(conversationId, true)
        }
      } catch {
        if (!isCurrentConnection()) return
        // The controller retains the transport error; notify only if catch-up
        // also fails, once for this recovery episode.
        updateStreamStatus("recovering")
        await recoverConversationEvents(conversationId, true)
      }
    }
  )

  const applyEnvelopeEvent = React.useEffectEvent((envelope: GatewayChatStreamEnvelope) => {
    if (envelope.type === "receipt") {
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
      const acceptsLifecycle = acceptsRunLifecycleEvent(previousRuntime, envelope.event)
      const nextRuntime = runtimeStoreRef.current.applyEvent(envelope.event)
      if (!nextRuntime || nextRuntime === previousRuntime) {
        return
      }
      setConversationLastSeq(identity.conversationId, envelope.event.seq)
      persistResumeState({
        conversationId: identity.conversationId,
        runId: isConversationScopedEvent(envelope.event) ? nextRuntime.runId : identity.runId,
        afterSeq: envelope.event.seq,
      })
      if (!acceptsLifecycle) return
      notifyWorkspaceOutputEvent(envelope.event, observedWorkspaceChanges)
      if (currentConversationIdRef.current !== identity.conversationId) {
        void refreshConversations().catch(() => {})
        return
      }
      if (!isConversationScopedEvent(envelope.event)) {
        bindTriggerUserMessage(envelope.event)
        if (nextRuntime.runId === identity.runId) bindActiveAssistantRun(identity.runId)
      }
    }

    if (envelope.type === "error") {
      const errorMessage = formatSendErrorMessage(envelope.error)
      recoveryRequestIdRef.current += 1
      recoveryInFlightRef.current = false
      clearRecoveryTimer()
      updateStreamStatus("recovering")
      const conversationId =
        activeStreamConversationIdRef.current ?? currentConversationIdRef.current
      if (conversationId) {
        runtimeStoreRef.current.dispatch(conversationId, { type: "recovering", error: errorMessage })
        void recoverConversationEvents(conversationId, true)
      }
      return
    }

    const fingerprint = getEventFingerprint(envelope.event)
    if (seenEventRef.current.has(fingerprint)) {
      return
    }

    seenEventRef.current.add(fingerprint)
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

      // A failed run keeps its error UI; conversation facts still arrive from
      // independent tasks after that failure.
      catchupInFlightRef.current = true
      const view = { ...sendViewRef.current }
      try {
        const hasCursor = conversationSeqRef.current.has(conversationId)
        if (hydratedConversationIdRef.current !== conversationId || !hasCursor) {
          // History loading owns its notification, including coalesced reads.
          await syncLatestConversationMessagesPage(conversationId, null, "coalesce").catch(() => {})
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

        if (currentConversationIdRef.current !== conversationId) return
        if (response.events.length > 0) {
          await Promise.all([
            refreshConversations(),
            syncLatestConversationMessagesPage(conversationId).catch(() => {}),
            refreshPendingInputsForConversation(conversationId),
          ])
          return
        }

        setConversationLastSeq(conversationId, response.next_seq ?? afterSeq ?? 0)
      } catch (catchupError) {
        if (sendViewRef.current.session !== view.session || sendViewRef.current.generation !== view.generation ||
          currentConversationIdRef.current !== conversationId) return
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
      conversationSeqRef.current.get(currentConversationId)
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

  function applyInputReceipt(
    receipt: Extract<GatewayChatStreamEnvelope, { type: "receipt" }>,
    content: string,
    images: import("@/lib/api/images").ImageReference[] | undefined,
  ) {
    if (!["queued", "consuming", "consumed"].includes(receipt.status)) return
    const current = runtimeStoreRef.current.get(receipt.conversation_id).admission
    if (current && (!receipt.admission || receipt.admission.revision < current.revision ||
        receipt.admission.generation < current.generation)) return
    if (entriesRef.current.some(entry => entry.role === "user" && entry.id === `message:${receipt.message_id}` &&
        entry.inputProgress?.phase === "accepted")) return
    const queued = receipt.status === "queued"
    const inTimeline = !queued || receipt.queued_in_timeline === true
    const id = `db-${receipt.pending_id}`
    if (queued) {
      setPreInputQueue(current => current.some(item => item.id === id) ? current : [...current, {
        id, messageId: receipt.message_id, content, status: "queued", inTimeline,
      }])
    } else {
      // A claimed receipt supersedes an older pending projection even when the
      // canonical history read is still in flight. It does not create a run.
      const projection = pendingInputProjectionRef.current
      if (projection?.conversationId === receipt.conversation_id) {
        pendingInputProjectionRef.current = { ...projection,
          inputs: projection.inputs.filter(input => input.messageId !== receipt.message_id) }
      }
      setPreInputQueue(current => current.filter(item => item.messageId !== receipt.message_id))
    }
    if (inTimeline) {
      displayedConversationIdRef.current = receipt.conversation_id
      setDisplayedConversationId(receipt.conversation_id)
    }
    if (inTimeline) setEntries(current => reduceCurrentTimeline(current, {
      type: "user-entry", entry: {
        id: `message:${receipt.message_id}`, timelineUnitId: `message:${receipt.message_id}`,
        role: "user", content, images, deliveryStatus: "received",
        inputProgress: {
          message_id: receipt.message_id, conversation_id: receipt.conversation_id,
          input_request_id: receipt.input_request_id ?? undefined,
          kind: "pre_input", phase: queued ? "queued" : "received", queued_in_timeline: queued,
          run_id: null, run_state: null, execution_epoch: null, run_version: null,
        },
      },
    }))
  }

  function clearConversation() {
    messageProjectionRequestRef.current += 1
    setEntries([])
    entriesRef.current = []
    setDisplayedConversationId(null)
    displayedConversationIdRef.current = null
    hydratedConversationIdRef.current = null
    setHydratedConversationId(null)
    setIsLoadingMessages(false)
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
    recoveryRequestIdRef.current += 1
    recoveryInFlightRef.current = false
    setShowScrollToBottom(false)
    autoStickToBottomRef.current = true
    lastViewportScrollTopRef.current = 0
    userScrollDirectionRef.current = null
  }

  function refreshCapabilityExposureDraft() {
    capabilityExposurePolicyRequestRef.current += 1
    setCapabilityExposureDraftStatus("loading")
    setCapabilityExposureDraftRevision((revision) => revision + 1)
  }

  function startNewChat() {
    if (currentConversationIdRef.current === null) imageDraft.detach()
    capabilityExposureDraftDirtyRef.current = false
    capabilityExposureConfirmedRef.current = null
    capabilityExposureSelectionRef.current = null
    capabilityExposurePolicyRef.current = null
    setCapabilityExposureSelection(null)
    setCapabilityExposurePolicy(null)
    refreshCapabilityExposureDraft()
    selectConversationTarget(null)
    runtimeControllerRef.current.disconnectAll()
    updateStreamStatus("idle")
    clearConversation()
  }

  async function handleStop() {
    const conversationId =
      activeStreamConversationIdRef.current ?? currentConversationIdRef.current

    if (!conversationId || !accessToken) {
      runtimeControllerRef.current.disconnectAll()
      return
    }

    const runtime = runtimeStoreRef.current.get(conversationId)
    const expected = {conversationId,runId:runtime.runId ?? activeRunIdRef.current,
      executionEpoch:runtime.executionEpoch,generation:sendViewRef.current.generation}
    const session = sendViewRef.current.session
    const ownsOperation = () => {
      const current = runtimeStoreRef.current.get(conversationId)
      return session === sendViewRef.current.session && matchesConversationOperation(expected, {
        conversationId:currentConversationIdRef.current,runId:current.runId ?? activeRunIdRef.current,
        executionEpoch:current.executionEpoch,generation:sendViewRef.current.generation,
      })
    }

    try {
      await stopConversationRun(accessToken, conversationId)
      if (!ownsOperation()) return
      pendingInputRequestRef.current += 1
      try {
        await Promise.all([refreshConversations(), refreshPendingInputsForConversation(conversationId)])
      } catch (caught) {
        if (ownsOperation()) reportChatError(caught, i18n.t("chat.gateway.syncFailed"),
          i18n.t("chat.gateway.syncFailedTitle"))
      }
    } catch (stopError) {
      if (!ownsOperation()) return
      reportChatError(
        stopError,
        i18n.t("chat.gateway.stopFailed"),
        i18n.t("chat.gateway.stopFailedTitle")
      )
    }
  }

  async function handleResolveApproval(entryId: string, approved: boolean) {
    if (!accessToken) {
      return
    }

    const entry = entries.find(
      (item): item is ApprovalEntry =>
        item.role === "approval" && item.id === entryId
    )
    if (!entry || !entry.runId || !selectedPendingApproval ||
        selectedPendingApproval.runId !== entry.runId || selectedPendingApproval.needId !== entry.needId) return
    const targetConversationId = currentConversationIdRef.current
    if (!targetConversationId) return
    const generation = ++humanInputSubmissionGenerationRef.current
    const viewGeneration = sendViewRef.current.generation
    const isCurrentSubmission = () => currentConversationIdRef.current === targetConversationId &&
      humanInputSubmissionGenerationRef.current === generation && sendViewRef.current.generation === viewGeneration

    updateApprovalEntry(entryId, (current) => ({
      ...current,
      status: approved ? "approving" : "rejecting",
      error: null,
    }))

    try {
      if (entry.approvalId) {
        if (approved) await approveSandboxApproval(accessToken, null, {approval_id:entry.approvalId})
        else await rejectSandboxApproval(accessToken, null, {approval_id:entry.approvalId})
      }
      const resumed = await resumeRunWithApproval(
        accessToken,
        null,
        {
          run_id: entry.runId,
          session_key: entry.sessionKey,
          need_id: entry.needId,
          approved,
        }
      )
      if (resumed.run_id !== entry.runId || resumed.need_id !== entry.needId || resumed.conversation_id !== targetConversationId) {
        throw new Error(i18n.t("chat.gateway.approvalFailed"))
      }
      if (isCurrentSubmission()) {
        updateApprovalEntry(entryId, current => ({...current,status:approved ? "approved" : "rejected",error:null}))
        applyResumeResponse(resumed, targetConversationId)
      }
      else void refreshConversations().catch(() => {})
    } catch (approvalError) {
      if (!isCurrentSubmission()) return
      const message = reportChatError(
        approvalError,
        i18n.t("chat.gateway.approvalFailed"),
        i18n.t("chat.gateway.approvalFailed"),
        { toast: false }
      )
      updateApprovalEntry(entryId, (current) => ({
        ...current,
        status: "error",
        error: message,
      }))
    }
  }

  async function handleSubmitUserInput(response: AgentUserInputResponse) {
    if (!accessToken) {
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

    const targetConversationId = currentConversationIdRef.current
    if (!targetConversationId) {
      throw new Error(i18n.t("chat.agent.answerSubmitFailed"))
    }
    const view = { ...sendViewRef.current }
    const generation = ++humanInputSubmissionGenerationRef.current
    assistantEntryIdRef.current = null
    const isCurrentSubmission = () =>
      sendViewRef.current.session === view.session &&
      sendViewRef.current.generation === view.generation &&
      currentConversationIdRef.current === targetConversationId &&
      humanInputSubmissionGenerationRef.current === generation &&
      (!activeRunIdRef.current || activeRunIdRef.current === response.runId)


    try {
      const resumed = await resumeRunWithUserInput(
        accessToken,
        null,
        {
          run_id: pendingTool.runId,
          session_key: pendingTool.sessionKey,
          need_id: response.needId,
          input: response.input,
        }
      )
      if (!isCurrentSubmission()) {
        if (currentConversationIdRef.current === targetConversationId) {
          void syncLatestConversationMessagesPage(targetConversationId).catch(() => {})
        }
        void refreshConversations().catch(() => {})
        return
      }
      if (resumed.run_id !== response.runId || resumed.need_id !== response.needId ||
          resumed.conversation_id !== targetConversationId || !resumed.input_message) {
        throw new Error(i18n.t("chat.agent.answerSubmitFailed"))
      }
      applyResumeResponse(resumed, targetConversationId)
    } catch (submitError) {
      if (!isCurrentSubmission()) return
      // A lost acknowledgement can still have committed; recover the canonical tail.
      void syncLatestConversationMessagesPage(targetConversationId).catch(() => {})
      throw submitError
    }
  }

  // 普通输入始终交给后端裁决立即执行或入队；前端不再推断 run 是否活跃。
  async function sendContentToApi(
    content: string,
    mode?: "guided",
    onAccepted?: (conversationId: string, isCurrentView: boolean) => void,
    images: ImageReference[] = []
  ) {
    if (!accessToken || (!content.trim() && images.length === 0)) {
      return
    }
    if (typeof globalThis.crypto?.randomUUID !== "function") {
      notify.error({
        title: i18n.t("chat.gateway.sendFailedTitle"),
        description: i18n.t(window.isSecureContext ? "chat.gateway.unsupportedBrowser" : "chat.gateway.httpsRequired"),
        duration: 6000,
      })
      return false
    }
    if (selectedModelProfileId && !isModelCatalogLoaded) {
      notify.error({ title: i18n.t("chat.gateway.sendFailedTitle"), description: i18n.t(modelCatalog.error ? "chat.composer.modelCatalogFailed" : "chat.composer.catalogLoading") })
      return false
    }
    if (selectedModelProfileId && !modelProfiles.some(model => model.id === selectedModelProfileId)) {
      notify.error({ title: i18n.t("chat.gateway.sendFailedTitle"), description: i18n.t("interaction.unavailableModel") })
      return false
    }
    if (selectedSandboxEnvironmentId && !isSandboxCatalogLoaded) {
      notify.error({ title: i18n.t("chat.gateway.sendFailedTitle"), description: i18n.t(sandboxCatalog.error ? "chat.composer.sandboxCatalogFailed" : "chat.composer.catalogLoading") })
      return false
    }
    if (selectedSandboxEnvironmentId && !sandboxOptions.some(option => option.environmentId === selectedSandboxEnvironmentId)) {
      notify.error({ title: i18n.t("chat.gateway.sendFailedTitle"), description: i18n.t("interaction.unavailableEnvironment") })
      return false
    }
    const submissionModelProfileId = resolveConfirmedComposerModelProfileId(
      selectedModelProfileId,
      isModelCatalogLoaded,
      modelProfiles.map((profile) => profile.id)
    )
    const submissionRuntimeSelection = {
      modelProfileId: submissionModelProfileId,
      sandboxEnvironmentId: selectedSandboxEnvironmentId,
    }
    const sandboxPayload = selectedSandboxEnvironmentId
      ? { environment_id: selectedSandboxEnvironmentId }
      : { environment_id: undefined }
    const submissionConversationId =
      currentConversationIdRef.current ?? currentConversationId
    const submissionCapabilityRevision = capabilityExposureSaveRevisionRef.current
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
    const submissionAgentEvolutionWorkspaceId =
      undefined
    const submissionRuntimeOverrides = { workspace: { mode: "disabled" as const } }

    if (mode === "guided") {
      const targetConversationId = submissionConversationId
      if (!targetConversationId) {
        return
      }

      const guidedGeneration = humanInputSubmissionGenerationRef.current
      const guidedView = { ...sendViewRef.current }
      const ownsGuidedSession = () => sendViewRef.current.session === guidedView.session
      const isCurrentGuidedSubmission = () => ownsGuidedSession() && sendViewRef.current.generation === guidedView.generation && currentConversationIdRef.current === targetConversationId && humanInputSubmissionGenerationRef.current === guidedGeneration
      let guidedAccepted = false
      const inputRequestId = crypto.randomUUID()
      const optimisticId = createMessageId("guided")
      beginGuidedUserTurn(content, optimisticId, inputRequestId)
      try {
        await streamConversationSend(
          accessToken,
          {
            conversation_id: targetConversationId,
            input_request_id: inputRequestId,
            content,
            images,
            stream: false,
            channel: "web",
            input_mode: mode,
            model_profile_id: submissionModelProfileId || undefined,
            sandbox: sandboxPayload,
            agent_iteration_requested: iterationRequestedForSubmission,
            runtime_overrides: submissionRuntimeOverrides,
            capability_exposure: submissionCapabilityExposure,
          },
          {
            onEnvelope: (envelope) => {
              if (envelope.type !== "receipt" || envelope.conversation_id !== targetConversationId || envelope.input_request_id !== inputRequestId) {
                throw new Error("Invalid conversation input receipt")
              }
              guidedAccepted = true
              if (!ownsGuidedSession()) return
              runtimeStoreRef.current.dispatch(targetConversationId, { type: "admission-snapshot", admission: envelope.admission ?? null })
              void refreshConversations().catch(() => {})
              if (!isCurrentGuidedSubmission()) {
                removeGuidedOptimisticEntry(targetConversationId, optimisticId)
                return
              }
              pendingInputRequestRef.current += 1
              if (envelope.status === "guided_injected") {
                setEntries((current) => reduceCurrentTimeline(current, { type: "input-receipt", optimisticId, messageId: envelope.message_id }))
              } else {
                setEntries((current) => current.filter((entry) => entry.id !== optimisticId))
                applyInputReceipt(envelope, content, images)
              }
              void Promise.all([
                refreshPendingInputsForConversation(targetConversationId),
                syncLatestConversationMessagesPage(targetConversationId, null, "fresh"),
              ]).catch(() => {})
            },
          }
        )
        // Guided input belongs to the existing run; it does not commit next-send preferences.
        if (!guidedAccepted) throw new Error("Missing conversation input receipt")
        return true
      } catch (enqueueError) {
        if (guidedAccepted) return true
        if (!isCurrentGuidedSubmission()) {
          removeGuidedOptimisticEntry(targetConversationId, optimisticId)
          return false
        }
        setEntries((current) => current.filter((entry) => entry.id !== optimisticId))
        reportChatError(
          enqueueError,
          i18n.t("chat.gateway.sendFailed"),
          i18n.t("chat.gateway.sendFailedTitle"),
          { format: formatSendErrorMessage }
        )
        return false
      }
    }

    const controller = new AbortController()
    pendingSubmissionRef.current = controller
    const releaseSubmission = () => {
      if (pendingSubmissionRef.current !== controller) return
      pendingSubmissionRef.current = null
      setIsSubmittingInput(false)
    }
    const submissionOwner = { session: currentSessionId, workspace: attachmentWorkspace?.id }
    let submissionViewGeneration = sendViewRef.current.generation
    let submissionSelectionVersion = getConversationSelectionIdentity().version
    const submissionLifecycle = submissionLifecycleRef.current
    const submissionPreferenceRevision = runtimePreferenceRevisionRef.current
    const ownsSession = () => getConversationSelectionIdentity().sessionId === submissionOwner.session
    const isCurrentSubmission = () => ownsSession()
      && submissionLifecycleRef.current === submissionLifecycle
      && getConversationSelectionIdentity().version === submissionSelectionVersion
      && sendViewRef.current.workspace === submissionOwner.workspace
      && sendViewRef.current.generation === submissionViewGeneration
    const canUpdateRecentSelection = () => isCurrentSubmission()
      && runtimePreferenceRevisionRef.current === submissionPreferenceRevision
    setIsSubmittingInput(true)

    let targetConversationId = submissionConversationId
    if (!targetConversationId) {
      try {
        const createdConversation = await createConversation(buildConversationTitle(content), { select: false })
        if (!ownsSession()) { releaseSubmission(); return false }
        targetConversationId = createdConversation.id
        // The hook captures the submitted draft object, never the newer draft.
        imageDraft.moveTo(`${submissionOwner.session}:${targetConversationId}:${submissionOwner.workspace}`)
        if (isCurrentSubmission()) {
          skipNextConversationSyncRef.current = targetConversationId
          clearConversation()
          setIsSubmittingInput(true)
          if (iterationRequestedForSubmission !== undefined) {
            const handoffTargetKey = agentNodeManagementTargetKey(
              targetConversationId,
              submissionAgentEvolutionWorkspaceId
            )
            pendingAgentIterationHandoffsRef.current.set(handoffTargetKey, {
              requested: iterationRequestedForSubmission,
            })
            setAgentIterationConversationId(targetConversationId)
            setAgentIterationRequestedState(iterationRequestedForSubmission)
            setIsAgentIterationResolved(true)
            setIsAgentIterationLoading(true)
          }
          selectConversationTarget(targetConversationId)
          submissionViewGeneration = sendViewRef.current.generation
          submissionSelectionVersion = getConversationSelectionIdentity().version
          setIsSubmittingInput(true)
        }
        if (typeof window !== "undefined") {
          writeComposerRuntimeSelectionDraft(
            window.localStorage,
            targetConversationId,
            submissionRuntimeSelection,
            { updateRecent: canUpdateRecentSelection() }
          )
        }
      } catch (createError) {
        releaseSubmission()
        if (!isCurrentSubmission()) return false
        reportChatError(
          createError,
          i18n.t("chat.gateway.initFailed"),
          i18n.t("chat.gateway.initFailedTitle")
        )
        return false
      }
    }

    try {
      await primeConversationCursor(targetConversationId)
    } catch (primeError) {
      releaseSubmission()
      if (!isCurrentSubmission()) return false
      reportChatError(
        primeError,
        i18n.t("chat.gateway.initFailed"),
        i18n.t("chat.gateway.initFailedTitle")
      )
      reconcileAgentIterationHandoff(
        targetConversationId,
        submissionAgentEvolutionWorkspaceId
      )
      return false
    }

    if (!ownsSession()) { releaseSubmission(); return false }
    const inputRequestId = crypto.randomUUID()
    let accepted = false
    const acceptSubmission = (commitSelection = true) => {
      if (accepted) {
        return
      }
      accepted = true
      releaseSubmission()
      if (ownsSession() && typeof window !== "undefined") {
        if (commitSelection) {
          commitAcceptedComposerRuntimeSelection(
            window.localStorage,
            targetConversationId,
            submissionRuntimeSelection,
            { updateRecent: canUpdateRecentSelection() }
          )
        } else if (canUpdateRecentSelection()) {
          writeRecentComposerRuntimeSelection(window.localStorage, submissionRuntimeSelection)
        }
      }
      onAccepted?.(targetConversationId, isCurrentSubmission())
      if (!isCurrentSubmission()) return
      // Ordinary send persists this selection before acknowledging admission.
      // A newly created conversation skips initial history hydration; its ACK
      // must still establish a rollback baseline for later preference saves.
      if (submissionCapabilityExposure &&
        capabilityExposureConfirmedRevisionRef.current <= submissionCapabilityRevision) {
        const previousConfirmed = capabilityExposureConfirmedRef.current
        capabilityExposureConfirmedRef.current = submissionCapabilityExposure
        capabilityExposureConfirmedRevisionRef.current = submissionCapabilityRevision
        if (capabilityExposureSaveRevisionRef.current === submissionCapabilityRevision ||
          (!capabilityExposurePendingSavesRef.current.get(submissionViewGeneration) &&
            capabilityExposureSelectionRef.current === previousConfirmed)) {
          capabilityExposureSelectionRef.current = submissionCapabilityExposure
          setCapabilityExposureSelection(submissionCapabilityExposure)
        }
      }
      reconcileAgentIterationHandoff(
        targetConversationId,
        submissionAgentEvolutionWorkspaceId
      )
    }

    try {
      await streamConversationSend(
        accessToken,
        {
          conversation_id: targetConversationId,
          input_request_id: inputRequestId,
          content,
          images,
          stream: true,
          channel: "web",
          input_mode: mode, // 仅引导模式显式传递；其他情况由后端根据活跃状态自动决定
          model_profile_id: submissionModelProfileId || undefined,
          sandbox: sandboxPayload,
          agent_iteration_requested: iterationRequestedForSubmission,
          runtime_overrides: submissionRuntimeOverrides,
          capability_exposure: submissionCapabilityExposure,
        },
        {
          signal: controller.signal,
          onEnvelope: (envelope) => {
            if (envelope.type !== "receipt" || envelope.conversation_id !== targetConversationId || envelope.input_request_id !== inputRequestId) {
              throw new Error("Invalid conversation input receipt")
            }
            // ACK is durable input admission, never a synthetic run or stream.
            if (ownsSession()) runtimeStoreRef.current.dispatch(targetConversationId, {
              type: "admission-snapshot", admission: envelope.admission ?? null,
            })
            acceptSubmission()
            if (ownsSession()) void refreshConversations().catch(() => {})
            if (!isCurrentSubmission()) return
            pendingInputRequestRef.current += 1
            applyInputReceipt(envelope, content, images)
            void Promise.all([
              refreshPendingInputsForConversation(targetConversationId),
              // The ACK is newer than a history read started before the send.
              // Publish the existing freshness barrier before any old page lands.
              syncLatestConversationMessagesPage(targetConversationId, null, "fresh"),
            ]).catch(() => {})
          },
        }
      )
      if (!accepted) throw new Error("Missing conversation input receipt")
      return true
    } catch (sendError) {
      // Once acknowledged, observation errors cannot undo admission or resend it.
      if (accepted) return true
      if (!isCurrentSubmission()) return false
      reconcileAgentIterationHandoff(targetConversationId, submissionAgentEvolutionWorkspaceId)
      if (!controller.signal.aborted) reportChatError(
        sendError,
        i18n.t("chat.gateway.sendFailed"),
        i18n.t("chat.gateway.sendFailedTitle"),
        { format: formatSendErrorMessage }
      )
      return false
    } finally {
      releaseSubmission()
    }
  }

  async function handleSend() {
    const content = composer.trim()
    if ((!content && imageDraft.images.length === 0) || !imageDraft.ready || !accessToken || isSubmittingInput) {
      return
    }

    const submittedImages = imageDraft.images
    const submittedImageIds = imageDraft.items.map((item) => item.id)
    if (submittedImages.length && !modelProfiles.find((model) => model.id === selectedModelProfileId)?.supports_vision && !auxiliaryVisionAvailable) { notify.error({ title: i18n.t("chat.gateway.sendFailedTitle"), description: i18n.t("images.visionRequired") }); return }
    const submittedComposer = composer
    await sendContentToApi(content, undefined, (acceptedConversationId, isCurrentView) => {
      if (isCurrentView && currentConversationIdRef.current === acceptedConversationId) setComposer((current) => (current === submittedComposer ? "" : current))
      imageDraft.clear(submittedImageIds)
    }, submittedImages)
  }

  function handleSandboxEnvironmentChange(value: string) {
    runtimePreferenceRevisionRef.current += 1
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
    runtimePreferenceRevisionRef.current += 1
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
    const revision = ++capabilityExposureSaveRevisionRef.current
    const view = { ...sendViewRef.current }
    const ownsView = () => sendViewRef.current.session === view.session &&
      sendViewRef.current.generation === view.generation &&
      currentConversationIdRef.current === conversationId
    capabilityExposureSelectionRef.current = selection
    setCapabilityExposureSelection(selection)
    const conversationId = currentConversationIdRef.current
    if (!conversationId) {
      capabilityExposureDraftDirtyRef.current = true
    }
    if (!accessToken || !conversationId) return

    const pendingSaves = capabilityExposurePendingSavesRef.current
    pendingSaves.set(view.generation, (pendingSaves.get(view.generation) ?? 0) + 1)
    capabilityExposureSaveChainRef.current = capabilityExposureSaveChainRef.current
      .catch(() => undefined)
      .then(async () => {
        try {
          const saved = await setConversationCapabilityExposure(
            accessToken,
            conversationId,
            selection
          )
          if (ownsView()) {
            capabilityExposureConfirmedRef.current = saved.selection
            capabilityExposureConfirmedRevisionRef.current = revision
            if (capabilityExposureSaveRevisionRef.current === revision) {
              capabilityExposureSelectionRef.current = saved.selection
              setCapabilityExposureSelection(saved.selection)
            }
          }
        } catch (caught) {
          if (!ownsView()) return
          if (capabilityExposureSaveRevisionRef.current === revision) {
            const confirmed = capabilityExposureConfirmedRef.current
            capabilityExposureSelectionRef.current = confirmed
            setCapabilityExposureSelection(confirmed)
          }
          reportChatError(
            caught,
            i18n.t("chat.composer.capabilityUpdateFailed"),
            i18n.t("chat.composer.capabilityUpdateFailedTitle")
          )
        } finally {
          const remaining = (pendingSaves.get(view.generation) ?? 1) - 1
          if (remaining) pendingSaves.set(view.generation, remaining)
          else pendingSaves.delete(view.generation)
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
      const conversationId = currentConversationId
      const generation = humanInputSubmissionGenerationRef.current
      const isCurrentPromotion = () => currentConversationIdRef.current === conversationId && humanInputSubmissionGenerationRef.current === generation
      const guidedEntryId = beginGuidedUserTurn(item.content, item.messageId ? `message:${item.messageId}` : undefined)
      setPreInputQueue((prev) => prev.filter((queueItem) => queueItem.id !== id))
      void promotePendingInput(
        accessToken,
        conversationId,
        dbId
      ).then((response) => {
        if (!isCurrentPromotion()) {
          removeGuidedOptimisticEntry(conversationId, guidedEntryId)
          if (currentConversationIdRef.current === conversationId) {
            void syncLatestConversationMessagesPage(conversationId).catch(() => {})
          }
          return
        }
        void syncLatestConversationMessagesPage(conversationId).catch(() => {})
        setEntries((current) =>
          reduceCurrentTimeline(current, { type:"input-receipt", optimisticId:guidedEntryId, messageId:response.pending_input.message_id })
        )
      }).catch((promoteError) => {
        if (!isCurrentPromotion()) {
          removeGuidedOptimisticEntry(conversationId, guidedEntryId)
          if (currentConversationIdRef.current === conversationId) {
            void syncLatestConversationMessagesPage(conversationId).catch(() => {})
          }
          return
        }
        reportChatError(
          promoteError,
          i18n.t("chat.gateway.promoteFailed"),
          i18n.t("chat.gateway.promoteFailed")
        )
        setEntries((current) => current.filter((entry) => entry.id !== guidedEntryId || (entry.role === "user" && entry.inputProgress?.phase === "accepted")))
        setPreInputQueue((prev) => {
          if (prev.some((queueItem) => queueItem.id === id)) {
            return prev
          }
          return [...prev, { ...item, status: "queued" }]
        })
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
      const conversationId = currentConversationId
      const generation = humanInputSubmissionGenerationRef.current
      const isCurrentDelete = () => currentConversationIdRef.current === conversationId && humanInputSubmissionGenerationRef.current === generation
      setPreInputQueue((prev) =>
        prev.map((queueItem) =>
          queueItem.id === id ? { ...queueItem, status: "deleting" } : queueItem
        )
      )
      void deletePendingInput(
        accessToken,
        conversationId,
        dbId
      )
        .then(() => {
          if (!isCurrentDelete()) return
          messageProjectionRequestRef.current += 1
          olderMessagesInFlightCursorRef.current = null
          void refreshPendingInputsForConversation(conversationId).then(() => syncLatestConversationMessagesPage(conversationId)).catch(() => {})
          setPreInputQueue((prev) => prev.filter((q) => q.id !== id))
        })
        .catch((deleteError) => {
          if (!isCurrentDelete()) return
          reportChatError(
            deleteError,
            i18n.t("chat.gateway.deletePendingFailed"),
            i18n.t("chat.gateway.deletePendingFailed")
          )
          setPreInputQueue((prev) =>
            prev.map((queueItem) =>
              queueItem.id === id ? { ...queueItem, status: "queued" } : queueItem
            )
          )
        })
      return
    }

    setPreInputQueue((prev) => prev.filter((q) => q.id !== id))
  }

  async function handleResumePreInputQueue() {
    const conversationId = currentConversationIdRef.current
    if (!accessToken || !conversationId || pendingQueueAction !== "idle") {
      return
    }
    const generation = humanInputSubmissionGenerationRef.current
    const view = { ...sendViewRef.current }
    const isCurrentResume = () => sendViewRef.current.session === view.session && sendViewRef.current.generation === view.generation && currentConversationIdRef.current === conversationId && humanInputSubmissionGenerationRef.current === generation
    setPendingQueueAction("resuming")
    try {
      await resumePendingInputs(accessToken, conversationId)
      if (!isCurrentResume()) return
      pendingInputRequestRef.current += 1
      try {
        await Promise.all([
          refreshConversations(),
          refreshPendingInputsForConversation(conversationId),
          syncLatestConversationMessagesPage(conversationId).catch(() => {}),
        ])
      } catch (caught) {
        if (isCurrentResume()) reportChatError(caught, i18n.t("chat.gateway.syncFailed"),
          i18n.t("chat.gateway.syncFailedTitle"))
      }
    } catch (caught) {
      if (!isCurrentResume()) return
      reportChatError(
        caught,
        i18n.t("chat.composer.resumeQueueFailed"),
        i18n.t("chat.composer.resumeQueueFailed")
      )
    } finally {
      if (isCurrentResume()) setPendingQueueAction("idle")
    }
  }

  async function handleClearPreInputQueue() {
    const conversationId = currentConversationIdRef.current
    if (!accessToken || !conversationId || pendingQueueAction !== "idle") {
      return
    }
    const generation = humanInputSubmissionGenerationRef.current
    const view = { ...sendViewRef.current }
    const isCurrentClear = () => sendViewRef.current.session === view.session && sendViewRef.current.generation === view.generation && currentConversationIdRef.current === conversationId && humanInputSubmissionGenerationRef.current === generation
    setPendingQueueAction("clearing")
    try {
      await clearPendingInputs(accessToken, conversationId)
      if (!isCurrentClear()) return
      messageProjectionRequestRef.current += 1
      olderMessagesInFlightCursorRef.current = null
      try {
        await refreshPendingInputsForConversation(conversationId)
        if (!isCurrentClear()) return
        await syncLatestConversationMessagesPage(conversationId).catch(() => {})
      } catch (caught) {
        if (isCurrentClear()) reportChatError(caught, i18n.t("chat.gateway.syncFailed"),
          i18n.t("chat.gateway.syncFailedTitle"))
      }
    } catch (caught) {
      if (!isCurrentClear()) return
      reportChatError(
        caught,
        i18n.t("chat.composer.clearQueueFailed"),
        i18n.t("chat.composer.clearQueueFailed")
      )
    } finally {
      if (isCurrentClear()) setPendingQueueAction("idle")
    }
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
    <div className="relative flex min-h-0 flex-1 flex-col [--chat-header-height:2.75rem]">
      <ChatSidebarHeader
        manageAgentPath={currentConversationId ? `/agent-nodes?${new URLSearchParams({ conversation: currentConversationId, workspace: "" })}` : undefined}
        bindStatus={bindStatus}
        selectedConversationTitle={selectedConversationTitle}
        selectedConversationId={currentConversationId}
        conversations={headerConversations}
        onSelectConversation={selectConversationTarget}
        onRefreshConversations={handleRefreshConversationList}
        onRenameConversation={accessToken ? renameConversation : undefined}
        onStartNewChat={startNewChat}
        isFullScreen={isFullScreen}
        onFullScreenChange={onFullScreenChange}
        onCollapseSidebar={toggleSidebar}
      />

      <SidebarContent className="overflow-hidden bg-sidebar/50">
        <ChatMessageList
          key={currentConversationId ?? "draft"}
          rowWindowRef={rowWindowRef}
          onOpenConversation={selectConversationTarget}
          compactingRunId={compactingRunId}
          accessToken={accessToken}
          onImageReference={imageDraft.addReference}
          onInspectRun={canInspectRun ? (runId) => {
            if (currentConversationId) setInspectedRun({ conversationId: currentConversationId, runId })
          } : undefined}
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
          onViewportScrollIntent={handleViewportScrollIntent}
          onLoadOlderConversationMessagesPage={loadOlderConversationMessagesPage}
          onScrollToBottomClick={handleScrollToBottomClick}
          onStreamingContentProgress={handleStreamingContentProgress}
          onApproveApproval={handleApproveApproval}
          onRejectApproval={handleRejectApproval}
          activeHumanRunId={selectedPendingUserInput?.runId ?? selectedPendingApproval?.runId ?? null}
          activeHumanNeedId={selectedPendingUserInput?.needId ?? selectedPendingApproval?.needId ?? null}
          activeHumanNeedKind={selectedPendingApproval ? "approval" : selectedPendingUserInput ? "user_input" : null}
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

      {accessToken && inspectedRun && inspectedRun.conversationId === currentConversationId && canInspectRun && (
        <RunObservationPanel accessToken={accessToken} conversationId={inspectedRun.conversationId} runId={inspectedRun.runId} onClose={() => setInspectedRun(null)} />
      )}

      <AgentPlanPanel tool={currentPlanTool} isFullScreen={isFullScreen} />

      <ChatComposer
        modelPickerFooter={<Link to="/models">{i18n.t("interaction.viewModels")}</Link>}
        attachedImages={imageDraft.images}
        imageCount={imageDraft.items.length}
        imagesReady={imageDraft.ready}
        onImageFiles={imageDraft.enabled ? imageDraft.addFiles : undefined}
        imageActions={accessToken && attachmentWorkspace ? <WorkspaceImagePicker key={`${accessToken}:${currentConversationId}:${attachmentWorkspace.id}`} accessToken={accessToken} workspaceId={attachmentWorkspace.id} disabled={!imageDraft.enabled || imageDraft.items.length >= 4} onSelect={imageDraft.addReference} renderTrigger={(open) => <ImageAttachmentActions disabled={!imageDraft.enabled || imageDraft.items.length >= 4} onFiles={imageDraft.addFiles} onWorkspace={open} />} /> : <ImageAttachmentActions disabled onFiles={imageDraft.addFiles} />}
        imageAttachments={<ImageAttachments items={imageDraft.items} accessToken={accessToken} onRemove={id => {
          const image = imageDraft.items.find(item => item.id === id)?.image
          if (image) setComposer(removeImageFileReference(composer, image))
          imageDraft.remove(id)
        }} onRetry={(item) => { void imageDraft.retry(item) }} />}
        isFullScreen={isFullScreen}
        composer={composer}
        isSending={isSending}
        canStop={canStop}
        isSubmittingInput={isSubmittingInput}
        canPromoteToGuided={
          selectedConversation?.current_run?.accepts_guided_input === true
        }
        canResumePreInputQueue={canResumePreInputQueue}
        blockedPreInputRunStatus={blockedPreInputRunStatus}
        blockedPreInputErrorCode={blockedPreInputErrorCode}
        pendingQueueAction={pendingQueueAction}
        preInputQueue={displayedPreInputQueue}
        accessToken={accessToken}
        workspaces={workspaces}
        currentWorkspaceId={attachmentWorkspace?.id}
        fileReferenceScope={currentConversationId ?? "new"}
        modelOptions={modelOptions}
        isModelCatalogLoaded={isModelCatalogLoaded}
        isModelCatalogLoading={modelCatalog.isLoading || modelCatalog.isRefreshing}
        modelCatalogError={modelCatalog.error ? i18n.t("chat.composer.modelCatalogFailed") : null}
        onModelCatalogRefresh={() => { void modelCatalog.reload() }}
        isSandboxCatalogLoaded={isSandboxCatalogLoaded}
        sandboxCatalogError={sandboxCatalog.error ? i18n.t("chat.composer.sandboxCatalogFailed") : null}
        selectedModelProfileId={selectedModelProfileId}
        sandboxOptions={sandboxOptions}
        isRefreshingSandboxOptions={isRefreshingSandboxOptions}
        selectedSandboxEnvironmentId={selectedSandboxEnvironmentId}
        capabilityExposureSelection={capabilityExposureSelection}
        capabilityExposurePolicy={capabilityExposurePolicy}
        capabilityExposureDraftStatus={capabilityExposureDraftStatus}
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
        onCapabilityExposureDraftRefresh={refreshCapabilityExposureDraft}
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
        onResumePreInputQueue={() => {
          void handleResumePreInputQueue()
        }}
        onClearPreInputQueue={() => {
          void handleClearPreInputQueue()
        }}
      />
    </div>
  )
}
