import * as React from "react"

import { SandboxApprovalsCard } from "@/components/sandbox/sandbox-approvals-card"
import { SandboxExecutionCard, type SandboxOperationMode } from "@/components/sandbox/sandbox-execution-card"
import { SandboxGrantsCard } from "@/components/sandbox/sandbox-grants-card"
import { SandboxRuntimeStrip } from "@/components/sandbox/sandbox-runtime-strip"
import { SandboxSessionCard } from "@/components/sandbox/sandbox-session-card"
import {
  SandboxStatusCard,
} from "@/components/sandbox/sandbox-status-card"
import { SandboxTimelineCard } from "@/components/sandbox/sandbox-timeline-card"
import {
  approveSandboxApproval,
  createSandboxCommandExecutionRequest,
  createSandboxFileExecutionRequest,
  getSandboxExecutionTimeline,
  getSandboxProjectEnvironmentSummary,
  getSandboxExecutionSession,
  interruptSandboxExecutionSession,
  listPendingSandboxApprovals,
  listSandboxPathGrants,
  listSandboxSessionsForToolCall,
  rejectSandboxApproval,
  selectSandboxEnvironment,
  upsertSandboxProjectPreference,
  type SandboxApproval,
  type SandboxEnvironmentSelection,
  type SandboxExecutionSession,
  type SandboxExecutionTimeline,
  type SandboxPathGrant,
  type SandboxPreferenceMode,
  type SandboxProjectEnvironmentSummary,
} from "@/lib/api/gateway-client"
import { useAppSession } from "@/contexts/app-session"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"

const STORAGE_KEYS = {
  preferenceMode: "ineffable.sandbox.console.preference_mode",
  environmentId: "ineffable.sandbox.console.environment_id",
  projectId: "ineffable.sandbox.console.project_id",
  toolCallId: "ineffable.sandbox.console.tool_call_id",
}

function readStorage(key: string) {
  if (typeof window === "undefined") {
    return ""
  }
  return window.localStorage.getItem(key) ?? ""
}

function writeStorage(key: string, value: string) {
  if (typeof window === "undefined") {
    return
  }
  window.localStorage.setItem(key, value)
}

function parseArgs(input: string) {
  return input
    .split(/\s+/)
    .map((item) => item.trim())
    .filter(Boolean)
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Request failed"
}

export function SandboxConsolePage() {
  const { accessToken, currentWorkspace } = useAppSession()
  const workspaceId = currentWorkspace?.id ?? null
  const [preferenceMode, setPreferenceMode] = React.useState<SandboxPreferenceMode>(() => {
    const stored = readStorage(STORAGE_KEYS.preferenceMode)
    return [
      "auto",
      "local_daemon",
      "cloud_runtime",
      "specified_environment",
    ].includes(stored)
      ? (stored as SandboxPreferenceMode)
      : "auto"
  })
  const [environmentId, setEnvironmentId] = React.useState(() =>
    readStorage(STORAGE_KEYS.environmentId)
  )
  const [projectId, setProjectId] = React.useState(() => readStorage(STORAGE_KEYS.projectId))
  const [summary, setSummary] = React.useState<SandboxProjectEnvironmentSummary | null>(null)
  const [selection, setSelection] = React.useState<SandboxEnvironmentSelection | null>(null)
  const [grants, setGrants] = React.useState<SandboxPathGrant[]>([])
  const [approvals, setApprovals] = React.useState<SandboxApproval[]>([])
  const [session, setSession] = React.useState<SandboxExecutionSession | null>(null)
  const [timeline, setTimeline] = React.useState<SandboxExecutionTimeline | null>(null)
  const [toolCallId, setToolCallId] = React.useState(() =>
    readStorage(STORAGE_KEYS.toolCallId)
  )
  const [toolCallSessions, setToolCallSessions] = React.useState<SandboxExecutionSession[]>([])
  const [operationMode, setOperationMode] = React.useState<SandboxOperationMode>("write_file")
  const [path, setPath] = React.useState("")
  const [content, setContent] = React.useState("hello from sandbox")
  const [commandProfile, setCommandProfile] = React.useState("safe_readonly")
  const [command, setCommand] = React.useState("pwd")
  const [commandArgs, setCommandArgs] = React.useState("")
  const [cwd, setCwd] = React.useState("")
  const [isLoadingGrants, setIsLoadingGrants] = React.useState(false)
  const [isLoadingApprovals, setIsLoadingApprovals] = React.useState(false)
  const [isLoadingSession, setIsLoadingSession] = React.useState(false)
  const [isLoadingTimeline, setIsLoadingTimeline] = React.useState(false)
  const [isLoadingSummary, setIsLoadingSummary] = React.useState(false)
  const [isSavingPreference, setIsSavingPreference] = React.useState(false)
  const [isSubmitting, setIsSubmitting] = React.useState(false)
  const [summaryError, setSummaryError] = React.useState<string | null>(null)
  const [grantsError, setGrantsError] = React.useState<string | null>(null)
  const [approvalsError, setApprovalsError] = React.useState<string | null>(null)
  const [sessionError, setSessionError] = React.useState<string | null>(null)
  const [timelineError, setTimelineError] = React.useState<string | null>(null)

  React.useEffect(() => {
    writeStorage(STORAGE_KEYS.preferenceMode, preferenceMode)
  }, [preferenceMode])

  React.useEffect(() => {
    writeStorage(STORAGE_KEYS.environmentId, environmentId)
  }, [environmentId])

  React.useEffect(() => {
    writeStorage(STORAGE_KEYS.projectId, projectId)
  }, [projectId])

  React.useEffect(() => {
    writeStorage(STORAGE_KEYS.toolCallId, toolCallId)
  }, [toolCallId])

  const effectiveEnvironmentId =
    environmentId.trim() ||
    selection?.environment?.environment_id ||
    summary?.recommended.environment?.environment_id ||
    ""

  const loadTimeline = React.useCallback(
    async (executionSessionId: string) => {
      setIsLoadingTimeline(true)
      setTimelineError(null)
      try {
        const next = await getSandboxExecutionTimeline(
          accessToken,
          workspaceId,
          executionSessionId
        )
        setTimeline(next)
        setSession(next.session)
      } catch (error) {
        setTimelineError(errorMessage(error))
      } finally {
        setIsLoadingTimeline(false)
      }
    },
    [accessToken, workspaceId]
  )

  const refreshEnvironmentSummary = React.useCallback(async () => {
    const trimmedProjectId = projectId.trim()
    if (!trimmedProjectId) {
      setSummary(null)
      setSelection(null)
      setSummaryError(null)
      return
    }

    setIsLoadingSummary(true)
    setSummaryError(null)
    try {
      const response = await getSandboxProjectEnvironmentSummary(
        accessToken,
        workspaceId,
        trimmedProjectId
      )
      setSummary(response)
      setSelection(response.recommended)
      setPreferenceMode(response.preference.preference_mode)
      setEnvironmentId(
        response.preference.environment_id ??
          response.recommended.environment?.environment_id ??
          ""
      )
    } catch (error) {
      setSummaryError(errorMessage(error))
    } finally {
      setIsLoadingSummary(false)
    }
  }, [accessToken, projectId, workspaceId])

  const savePreference = React.useCallback(async () => {
    const trimmedProjectId = projectId.trim()
    if (!trimmedProjectId) {
      setSummaryError("需要先填写 project_id。")
      return
    }
    if (preferenceMode === "specified_environment" && !environmentId.trim()) {
      setSummaryError("Pinned preference 需要选择 environment。")
      return
    }

    setIsSavingPreference(true)
    setSummaryError(null)
    try {
      await upsertSandboxProjectPreference(accessToken, workspaceId, {
        workspace_id: workspaceId,
        project_id: trimmedProjectId,
        preference_mode: preferenceMode,
        environment_id:
          preferenceMode === "specified_environment" ? environmentId.trim() : undefined,
      })
      const nextSelection = await selectSandboxEnvironment(accessToken, workspaceId, {
        workspace_id: workspaceId,
        project_id: trimmedProjectId,
        preference_mode: preferenceMode,
        environment_id:
          preferenceMode === "specified_environment" ? environmentId.trim() : undefined,
        capability_hint: {
          file_read: operationMode === "read_file" || operationMode === "list_dir",
          file_write: operationMode === "write_file",
          command_exec: operationMode === "command",
          command_profile: operationMode === "command" ? commandProfile : undefined,
        },
      })
      setSelection(nextSelection)
      await refreshEnvironmentSummary()
    } catch (error) {
      setSummaryError(errorMessage(error))
    } finally {
      setIsSavingPreference(false)
    }
  }, [
    accessToken,
    commandProfile,
    environmentId,
    operationMode,
    preferenceMode,
    projectId,
    refreshEnvironmentSummary,
    workspaceId,
  ])

  const refreshGrants = React.useCallback(async () => {
    if (!effectiveEnvironmentId) {
      setGrants([])
      setGrantsError(null)
      return
    }
    setIsLoadingGrants(true)
    setGrantsError(null)
    try {
      const response = await listSandboxPathGrants(
        accessToken,
        workspaceId,
        effectiveEnvironmentId
      )
      setGrants(response.grants)
      const writable = response.grants.find((grant) => grant.access_mode === "read_write")
      const fallbackPath = writable?.path ?? response.grants[0]?.path ?? ""
      setPath((current) => current || (fallbackPath ? `${fallbackPath}/result.txt` : ""))
      setCwd((current) => current || fallbackPath)
    } catch (error) {
      setGrantsError(errorMessage(error))
    } finally {
      setIsLoadingGrants(false)
    }
  }, [accessToken, effectiveEnvironmentId, workspaceId])

  const refreshApprovals = React.useCallback(async () => {
    setIsLoadingApprovals(true)
    setApprovalsError(null)
    try {
      const response = await listPendingSandboxApprovals(accessToken, workspaceId)
      setApprovals(response.approvals)
    } catch (error) {
      setApprovalsError(errorMessage(error))
    } finally {
      setIsLoadingApprovals(false)
    }
  }, [accessToken, workspaceId])

  const refreshSession = React.useCallback(async () => {
    if (!session?.execution_session_id) {
      return
    }
    setIsLoadingSession(true)
    setSessionError(null)
    try {
      const next = await getSandboxExecutionSession(
        accessToken,
        workspaceId,
        session.execution_session_id
      )
      setSession(next)
      await loadTimeline(next.execution_session_id)
    } catch (error) {
      setSessionError(errorMessage(error))
    } finally {
      setIsLoadingSession(false)
    }
  }, [accessToken, loadTimeline, session?.execution_session_id, workspaceId])

  const refreshAll = React.useCallback(async () => {
    await refreshEnvironmentSummary()
    await Promise.all([refreshGrants(), refreshApprovals()])
  }, [refreshApprovals, refreshEnvironmentSummary, refreshGrants])

  React.useEffect(() => {
    void refreshAll()
  }, [refreshAll])

  const submitExecution = React.useCallback(async () => {
    const trimmedEnvironmentId = effectiveEnvironmentId
    if (!trimmedEnvironmentId) {
      setSessionError("需要先选择可用 environment。")
      return
    }

    setIsSubmitting(true)
    setSessionError(null)
    try {
      const basePayload = {
        environment_id: trimmedEnvironmentId,
        project_id: projectId.trim() || undefined,
        metadata_json: {
          source: "sandbox-console",
        },
      }

      const response =
        operationMode === "command"
          ? await createSandboxCommandExecutionRequest(accessToken, workspaceId, {
              ...basePayload,
              operation: {
                operation: "command",
                profile: commandProfile,
                command: command.trim(),
                args: parseArgs(commandArgs),
                cwd: cwd.trim(),
                timeout_seconds: 10,
              },
            })
          : await createSandboxFileExecutionRequest(accessToken, workspaceId, {
              ...basePayload,
              operation:
                operationMode === "write_file"
                  ? {
                      operation: "write_file",
                      path: path.trim(),
                      content,
                    }
                  : operationMode === "read_file"
                    ? {
                        operation: "read_file",
                        path: path.trim(),
                      }
                    : {
                        operation: "list_dir",
                        path: path.trim(),
                      },
            })

      const next = await getSandboxExecutionSession(
        accessToken,
        workspaceId,
        response.execution_session_id
      )
      setSession(next)
      await loadTimeline(next.execution_session_id)
      await refreshApprovals()
    } catch (error) {
      setSessionError(errorMessage(error))
    } finally {
      setIsSubmitting(false)
    }
  }, [
    accessToken,
    command,
    commandArgs,
    commandProfile,
    content,
    cwd,
    effectiveEnvironmentId,
    loadTimeline,
    operationMode,
    path,
    projectId,
    refreshApprovals,
    workspaceId,
  ])

  const approve = React.useCallback(
    async (approval: SandboxApproval) => {
      try {
        await approveSandboxApproval(accessToken, workspaceId, {
          approval_id: approval.approval_id,
          reason: "approved from sandbox console",
        })
        await refreshApprovals()
        const next = await getSandboxExecutionSession(
          accessToken,
          workspaceId,
          approval.execution_session_id
        )
        setSession(next)
        await loadTimeline(next.execution_session_id)
      } catch (error) {
        setApprovalsError(errorMessage(error))
      }
    },
    [accessToken, loadTimeline, refreshApprovals, workspaceId]
  )

  const reject = React.useCallback(
    async (approval: SandboxApproval) => {
      try {
        await rejectSandboxApproval(accessToken, workspaceId, {
          approval_id: approval.approval_id,
          reason: "rejected from sandbox console",
        })
        await refreshApprovals()
        const next = await getSandboxExecutionSession(
          accessToken,
          workspaceId,
          approval.execution_session_id
        )
        setSession(next)
        await loadTimeline(next.execution_session_id)
      } catch (error) {
        setApprovalsError(errorMessage(error))
      }
    },
    [accessToken, loadTimeline, refreshApprovals, workspaceId]
  )

  const interruptLast = React.useCallback(async () => {
    if (!session?.execution_session_id) {
      setSessionError("还没有可中断的 session。")
      return
    }
    setIsLoadingSession(true)
    setSessionError(null)
    try {
      await interruptSandboxExecutionSession(accessToken, workspaceId, {
        execution_session_id: session.execution_session_id,
        reason: "interrupted from sandbox console",
      })
      const next = await getSandboxExecutionSession(
        accessToken,
        workspaceId,
        session.execution_session_id
      )
      setSession(next)
      await loadTimeline(next.execution_session_id)
    } catch (error) {
      setSessionError(errorMessage(error))
    } finally {
      setIsLoadingSession(false)
    }
  }, [accessToken, loadTimeline, session?.execution_session_id, workspaceId])

  const refreshTimeline = React.useCallback(async () => {
    const executionSessionId =
      timeline?.session.execution_session_id ?? session?.execution_session_id
    if (!executionSessionId) {
      return
    }
    await loadTimeline(executionSessionId)
  }, [loadTimeline, session?.execution_session_id, timeline?.session.execution_session_id])

  const lookupToolCallSessions = React.useCallback(async () => {
    const trimmedToolCallId = toolCallId.trim()
    if (!trimmedToolCallId) {
      setTimelineError("需要先填写 tool_call_id。")
      return
    }
    setIsLoadingTimeline(true)
    setTimelineError(null)
    try {
      const response = await listSandboxSessionsForToolCall(
        accessToken,
        workspaceId,
        trimmedToolCallId
      )
      setToolCallSessions(response.sessions)
      const latest = response.sessions[0]
      if (latest) {
        await loadTimeline(latest.execution_session_id)
      }
    } catch (error) {
      setTimelineError(errorMessage(error))
    } finally {
      setIsLoadingTimeline(false)
    }
  }, [accessToken, loadTimeline, toolCallId, workspaceId])

  const selectToolCallSession = React.useCallback(
    async (nextSession: SandboxExecutionSession) => {
      setSession(nextSession)
      await loadTimeline(nextSession.execution_session_id)
    },
    [loadTimeline]
  )

  const canSubmit =
    Boolean(effectiveEnvironmentId) &&
    (operationMode === "command"
      ? Boolean(command.trim()) && Boolean(cwd.trim())
      : Boolean(path.trim()))

  return (
    <div className="space-y-4">
      <SandboxRuntimeStrip
        projectId={projectId}
        summary={summary}
        selection={selection}
        isLoading={isLoadingSummary || isLoadingGrants || isLoadingApprovals}
        onRefresh={refreshAll}
      />

      <SandboxStatusCard
        preferenceMode={preferenceMode}
        environmentId={environmentId}
        projectId={projectId}
        summary={summary}
        selection={selection}
        isLoading={isLoadingSummary || isLoadingGrants || isLoadingApprovals}
        isSaving={isSavingPreference}
        error={summaryError}
        onPreferenceModeChange={setPreferenceMode}
        onEnvironmentIdChange={setEnvironmentId}
        onProjectIdChange={setProjectId}
        onRefresh={refreshAll}
        onSavePreference={savePreference}
      />

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_380px]">
        <div className="space-y-4">
          <SandboxExecutionCard
            operationMode={operationMode}
            path={path}
            content={content}
            command={command}
            commandArgs={commandArgs}
            commandProfile={commandProfile}
            cwd={cwd}
            canSubmit={canSubmit}
            isSubmitting={isSubmitting}
            onOperationModeChange={setOperationMode}
            onPathChange={setPath}
            onContentChange={setContent}
            onCommandChange={setCommand}
            onCommandArgsChange={setCommandArgs}
            onCommandProfileChange={setCommandProfile}
            onCwdChange={setCwd}
            onSubmit={submitExecution}
            onInterruptLast={interruptLast}
          />
          <SandboxSessionCard
            session={session}
            error={sessionError}
            isLoading={isLoadingSession}
            onRefresh={refreshSession}
          />
          <SandboxTimelineCard
            timeline={timeline}
            toolCallId={toolCallId}
            toolCallSessions={toolCallSessions}
            error={timelineError}
            isLoading={isLoadingTimeline}
            onToolCallIdChange={setToolCallId}
            onLookupToolCall={lookupToolCallSessions}
            onSelectSession={selectToolCallSession}
            onRefresh={refreshTimeline}
          />
        </div>

        <div className="space-y-4">
          <SandboxGrantsCard
            grants={grants}
            isLoading={isLoadingGrants}
            error={grantsError}
            onRefresh={refreshGrants}
          />
          <SandboxApprovalsCard
            approvals={approvals}
            isLoading={isLoadingApprovals}
            error={approvalsError}
            onRefresh={refreshApprovals}
            onApprove={approve}
            onReject={reject}
          />
          <Card className="bg-muted/40">
            <CardHeader>
              <CardTitle className="text-base">Selection Policy</CardTitle>
              <CardDescription>
                当前项目的 sandbox preference 已接入后端聚合 API。
              </CardDescription>
            </CardHeader>
            <CardContent className="text-muted-foreground text-sm leading-6">
              LLM 后续仍只提交执行意图，由 server orchestrator 根据 project preference、environment 状态和 capability hint 决定执行位置。
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
