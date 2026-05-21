import {
  normalizeGatewayEnvelope,
  type GatewayChatStreamEnvelope,
} from "@/lib/api/chat/gateway-events"

export type AppUser = {
  id: string
  email: string
  display_name: string
  avatar_url?: string | null
  phone?: string | null
  status: string
}

export type Workspace = {
  id: string
  slug: string
  name: string
  owner_user_id: string
  workspace_type?: "personal" | "team" | string
  plan: string
  status: string
  settings_json?: Record<string, unknown> | null
}

export type WorkspaceObject = {
  id: string
  workspace_id: string
  parent_id?: string | null
  kind: "folder" | "file" | string
  name: string
  path: string
  mime_type?: string | null
  current_version_id?: string | null
  created_by_actor_type: "user" | "agent" | string
  created_by_actor_id: string
  updated_by_actor_type: "user" | "agent" | string
  updated_by_actor_id: string
  created_at: string
  updated_at: string
}

export type WorkspaceTreeResponse = {
  workspace_id: string
  user_id: string
  objects: WorkspaceObject[]
}

export type WorkspaceObjectVersion = {
  id: string
  object_id: string
  version_no: number
  storage_bucket: string
  storage_key: string
  content_sha256: string
  size_bytes: number
  created_by_actor_type: "user" | "agent" | string
  created_by_actor_id: string
  created_at: string
}

export type WorkspaceObjectContentResponse = {
  object: WorkspaceObject
  version: WorkspaceObjectVersion
  content: string
}

export type Conversation = {
  id: string
  workspace_id: string
  created_by: string
  title: string
  visibility: string
  status: string
  last_message_at?: string | null
  current_run_id?: string | null
  current_run?: ConversationRunSummary | null
  created_at: string
  updated_at: string
}

export type ConversationRunSummary = {
  id: string
  status: string
  started_at?: string | null
  completed_at?: string | null
  is_streaming: boolean
  is_live: boolean
}

export type ConversationMessageRecord = {
  id: string
  conversation_id: string
  run_id?: string | null
  created_by?: string | null
  role: string
  message_type: string
  content: string
  content_json?: Record<string, unknown> | null
  metadata_json?: Record<string, unknown> | null
  created_at: string
  updated_at: string
}

export type ConversationEventsResponse = {
  events: GatewayChatStreamEnvelope[]
  next_seq?: number | null
}

export type ConversationMessagesResponse = {
  messages: ConversationMessageRecord[]
  next_seq?: number | null
}

export type AuthTokenPair = {
  access_token: string
  refresh_token: string
  access_expires_at: number
  refresh_expires_at: number
  session_id: string
}

export type AuthResponse = {
  user: AppUser
  tokens: AuthTokenPair
}

export type UserSessionRecord = {
  id: string
  user_id: string
  refresh_token_jti: string
  access_token_jti?: string | null
  device_info?: Record<string, unknown> | null
  ip_address?: string | null
  user_agent?: string | null
  status: string
  last_seen_at: string
  expires_at: string
  revoked_at?: string | null
  created_at: string
  updated_at: string
}

export type MeResponse = {
  user: AppUser
  current_workspace_id?: string | null
  roles?: string[]
  permissions?: string[]
  workspaces: Workspace[]
}

export type SandboxExecutionSessionStatus =
  | "created"
  | "queued"
  | "running"
  | "streaming"
  | "interrupted"
  | "failed"
  | "completed"
  | "recoverable_disconnected"

export type SandboxPreferenceMode =
  | "auto"
  | "local_daemon"
  | "cloud_runtime"
  | "specified_environment"

export type SandboxProviderStatus =
  | "unregistered"
  | "registered"
  | "online"
  | "busy"
  | "offline"
  | "error"
  | "revoked"

export type SandboxEnvironmentStatus =
  | "created"
  | "bound"
  | "ready"
  | "busy"
  | "offline"
  | "error"
  | "revoked"

export type SandboxProviderStatusView = {
  provider_id: string
  provider_type: "local_daemon" | "cloud_runtime"
  runtime_kind: "local_daemon" | "cloud_runtime"
  status: SandboxProviderStatus
  display_name: string
  version: string
  environment_id?: string | null
  bound_project_id?: string | null
  last_seen_at?: string | null
}

export type SandboxEnvironmentView = {
  environment_id: string
  provider_id: string
  workspace_id?: string | null
  project_id?: string | null
  environment_type: "local" | "cloud"
  status: SandboxEnvironmentStatus
  policy_profile?: string | null
  metadata_json?: Record<string, unknown> | null
}

export type SandboxProjectPreference = {
  workspace_id?: string | null
  project_id: string
  preference_mode: SandboxPreferenceMode
  environment_id?: string | null
  updated_at?: string | null
}

export type SandboxCapabilityHint = {
  file_read?: boolean
  file_write?: boolean
  command_exec?: boolean
  command_profile?: string | null
  mcp_server?: string | null
  mcp_tool?: string | null
}

export type SandboxEnvironmentSelection = {
  environment?: SandboxEnvironmentView | null
  provider?: SandboxProviderStatusView | null
  preference_mode: SandboxPreferenceMode
  selected: boolean
  reason: string
}

export type SandboxProjectEnvironmentSummary = {
  workspace_id?: string | null
  project_id: string
  preference: SandboxProjectPreference
  providers: SandboxProviderStatusView[]
  environments: SandboxEnvironmentView[]
  path_grants: SandboxPathGrant[]
  recommended: SandboxEnvironmentSelection
}

export type SandboxWorkspaceEnvironmentListResponse = {
  workspace_id?: string | null
  providers: SandboxProviderStatusView[]
  environments: SandboxEnvironmentView[]
}

export type SandboxPathGrant = {
  grant_id: string
  environment_id: string
  project_id?: string | null
  path: string
  access_mode: "read_only" | "read_write"
  created_at: string
}

export type SandboxPathGrantListResponse = {
  environment_id: string
  grants: SandboxPathGrant[]
}

export type SandboxFileOperation =
  | { operation: "list_dir"; path: string }
  | { operation: "read_file"; path: string }
  | { operation: "write_file"; path: string; content: string }

export type SandboxCommandOperation = {
  operation: "command"
  profile: "safe_readonly" | "safe_dev_basic" | string
  command: string
  args: string[]
  cwd: string
  timeout_seconds: number
}

export type SandboxExecutionRequestResponse = {
  execution_request_id: string
  execution_session_id: string
  environment_id: string
  provider_id: string
  status: SandboxExecutionSessionStatus
}

export type SandboxExecutionSession = {
  execution_session_id: string
  execution_request_id: string
  environment_id: string
  provider_id: string
  status: SandboxExecutionSessionStatus
  current_step?: string | null
  checkpoint_ref?: string | null
  failure_reason?: string | null
  metadata_json?: Record<string, unknown> | null
}

export type SandboxLogView = {
  log_id: string
  execution_session_id: string
  stream: string
  message: string
  metadata_json?: Record<string, unknown> | null
  created_at: string
}

export type SandboxArtifactView = {
  artifact_id: string
  execution_session_id: string
  artifact_type: string
  name: string
  uri: string
  metadata_json?: Record<string, unknown> | null
  created_at: string
}

export type SandboxCheckpointView = {
  checkpoint_id: string
  execution_session_id: string
  checkpoint_ref: string
  metadata_json?: Record<string, unknown> | null
  created_at: string
}

export type SandboxExecutionTimeline = {
  session: SandboxExecutionSession
  logs: SandboxLogView[]
  artifacts: SandboxArtifactView[]
  checkpoints: SandboxCheckpointView[]
}

export type SandboxToolCallSessionsResponse = {
  sessions: SandboxExecutionSession[]
}

export type SandboxApprovalStatus = "pending" | "approved" | "rejected"

export type SandboxApproval = {
  approval_id: string
  execution_request_id: string
  execution_session_id: string
  environment_id: string
  provider_id: string
  status: SandboxApprovalStatus
  reason?: string | null
  created_at: string
}

export type SandboxApprovalListResponse = {
  approvals: SandboxApproval[]
}

export type ResumeRunResponse = {
  output?: string
  session_key?: string
  agent_id?: string
  run_id?: string | null
  run_state?: string | null
  pending_need?: Record<string, unknown> | null
  resumable?: boolean | null
  forward_messages?: import("@/lib/api/chat/gateway-events").GatewayForwardMessage[]
}

const API_BASE_URL =
  (import.meta.env.VITE_GATEWAY_API_BASE_URL as string | undefined)?.trim() ||
  (import.meta.env.VITE_API_BASE_URL as string | undefined)?.trim() ||
  ""

function toUrl(path: string) {
  if (!API_BASE_URL) {
    return path
  }

  const normalizedBase = API_BASE_URL.replace(/\/$/, "")
  const normalizedPath = path.startsWith("/") ? path : `/${path}`

  return `${normalizedBase}${normalizedPath}`
}

function buildHeaders(options?: {
  accessToken?: string | null
  workspaceId?: string | null
  accept?: string
}) {
  const headers: Record<string, string> = {
    Accept: options?.accept ?? "application/json",
  }

  if (options?.accessToken) {
    headers.Authorization = `Bearer ${options.accessToken}`
  }

  if (options?.workspaceId) {
    headers["x-tenant-id"] = options.workspaceId
  }

  return headers
}

async function parseError(response: Response) {
  const text = await response.text()

  try {
    const parsed = JSON.parse(text) as { error?: string }
    return parsed.error || text || `Request failed: ${response.status}`
  } catch {
    return text || `Request failed: ${response.status}`
  }
}

function withRecoverableFlag(error: Error, recoverable: boolean) {
  return Object.assign(error, { recoverable })
}

async function requestJson<T>(
  path: string,
  options?: {
    method?: "GET" | "POST" | "PATCH" | "DELETE"
    accessToken?: string | null
    workspaceId?: string | null
    body?: unknown
  }
) {
  const response = await fetch(toUrl(path), {
    method: options?.method ?? "GET",
    headers: {
      ...buildHeaders({
        accessToken: options?.accessToken,
        workspaceId: options?.workspaceId,
      }),
      ...(options?.body ? { "Content-Type": "application/json" } : {}),
    },
    body: options?.body ? JSON.stringify(options.body) : undefined,
  })

  if (!response.ok) {
    throw new Error(await parseError(response))
  }

  return (await response.json()) as T
}

async function parseSseStream(
  response: Response,
  onEnvelope: (envelope: GatewayChatStreamEnvelope) => void
) {
  if (!response.body) {
    throw new Error("Stream body is empty")
  }

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ""

  const flushEvent = (rawEvent: string) => {
    const lines = rawEvent.split(/\r?\n/)
    const dataLines = lines
      .filter((line) => line.startsWith("data:"))
      .map((line) => line.slice(5).trimStart())

    if (!dataLines.length) {
      return
    }

    let parsed: unknown = dataLines.join("\n")
    try {
      parsed = JSON.parse(dataLines.join("\n")) as unknown
    } catch {
      parsed = dataLines.join("\n")
    }

    const envelope = normalizeGatewayEnvelope(parsed)
    if (envelope) {
      onEnvelope(envelope)
    }
  }

  while (true) {
    const { done, value } = await reader.read()
    if (done) {
      break
    }

    buffer += decoder.decode(value, { stream: true })
    let separatorIndex = buffer.search(/\r?\n\r?\n/)
    while (separatorIndex >= 0) {
      const rawEvent = buffer.slice(0, separatorIndex)
      buffer = buffer.slice(separatorIndex + (buffer[separatorIndex] === "\r" ? 4 : 2))
      flushEvent(rawEvent)
      separatorIndex = buffer.search(/\r?\n\r?\n/)
    }
  }

  buffer += decoder.decode()
  if (buffer.trim()) {
    flushEvent(buffer)
  }
}

export function getGatewayApiBaseUrl() {
  return API_BASE_URL || "(same-origin)"
}

export function registerUser(payload: {
  email: string
  display_name: string
  password: string
  avatar_url?: string | null
  phone?: string | null
}) {
  return requestJson<AuthResponse>("/gateway/v1/users/register", {
    method: "POST",
    body: payload,
  })
}

export function loginUser(payload: { email: string; password: string }) {
  return requestJson<AuthResponse>("/gateway/v1/auth/login", {
    method: "POST",
    body: payload,
  })
}

export function refreshToken(refresh_token: string) {
  return requestJson<{ tokens: AuthTokenPair }>("/gateway/v1/auth/refresh", {
    method: "POST",
    body: { refresh_token },
  })
}

export function fetchMe(accessToken: string, workspaceId?: string | null) {
  return requestJson<MeResponse>("/gateway/v1/auth/me", {
    accessToken,
    workspaceId,
  })
}

export function logoutUser(accessToken: string, workspaceId?: string | null) {
  return requestJson<{ session: unknown }>("/gateway/v1/auth/logout", {
    method: "POST",
    accessToken,
    workspaceId,
    body: {},
  })
}

export function fetchAuthSessions(accessToken: string, workspaceId?: string | null) {
  return requestJson<{ sessions: UserSessionRecord[] }>("/gateway/v1/auth/sessions", {
    accessToken,
    workspaceId,
  })
}

export function revokeAuthSession(
  accessToken: string,
  sessionId: string,
  workspaceId?: string | null
) {
  return requestJson<{ session: UserSessionRecord }>(
    "/gateway/v1/auth/sessions/revoke",
    {
      method: "POST",
      accessToken,
      workspaceId,
      body: { session_id: sessionId },
    }
  )
}

export function createWorkspace(
  accessToken: string,
  payload: {
    slug: string
    name: string
    plan?: string
    settings_json?: Record<string, unknown>
  }
) {
  return requestJson<{ workspace: Workspace }>("/gateway/v1/workspaces/create", {
    method: "POST",
    accessToken,
    body: payload,
  })
}

export function listWorkspaces(accessToken: string) {
  return requestJson<{ workspaces: Workspace[] }>("/gateway/v1/workspaces/list", {
    accessToken,
  })
}

export function listWorkspaceTree(accessToken: string, workspaceId: string) {
  return requestJson<WorkspaceTreeResponse>(
    `/gateway/v1/workspaces/${workspaceId}/tree`,
    {
      accessToken,
      workspaceId,
    }
  )
}

export function createWorkspaceFolder(
  accessToken: string,
  workspaceId: string,
  payload: { name: string; parent_id?: string | null }
) {
  return requestJson<{ object: WorkspaceObject }>(
    `/gateway/v1/workspaces/${workspaceId}/folders`,
    {
      method: "POST",
      accessToken,
      workspaceId,
      body: payload,
    }
  )
}

export function createWorkspaceFile(
  accessToken: string,
  workspaceId: string,
  payload: {
    name: string
    content: string
    parent_id?: string | null
    mime_type?: string | null
  }
) {
  return requestJson<{ object: WorkspaceObject; version: WorkspaceObjectVersion }>(
    `/gateway/v1/workspaces/${workspaceId}/files`,
    {
      method: "POST",
      accessToken,
      workspaceId,
      body: payload,
    }
  )
}

export function getWorkspaceObjectContent(
  accessToken: string,
  workspaceId: string,
  objectId: string
) {
  return requestJson<WorkspaceObjectContentResponse>(
    `/gateway/v1/workspace-objects/${objectId}/content`,
    {
      accessToken,
      workspaceId,
    }
  )
}

export function updateWorkspaceObjectContent(
  accessToken: string,
  workspaceId: string,
  objectId: string,
  payload: {
    content: string
    mime_type?: string | null
    expected_version_id?: string | null
  }
) {
  return requestJson<{
    object: WorkspaceObject
    version: WorkspaceObjectVersion
  }>(`/gateway/v1/workspace-objects/${objectId}/content`, {
    method: "PATCH",
    accessToken,
    workspaceId,
    body: payload,
  })
}

export function listWorkspaceObjectVersions(
  accessToken: string,
  workspaceId: string,
  objectId: string
) {
  return requestJson<{
    object: WorkspaceObject
    versions: WorkspaceObjectVersion[]
  }>(`/gateway/v1/workspace-objects/${objectId}/versions`, {
    accessToken,
    workspaceId,
  })
}

export function getWorkspaceObjectVersionContent(
  accessToken: string,
  workspaceId: string,
  versionId: string
) {
  return requestJson<WorkspaceObjectContentResponse>(
    `/gateway/v1/workspace-object-versions/${versionId}/content`,
    {
      accessToken,
      workspaceId,
    }
  )
}

export function restoreWorkspaceObjectVersion(
  accessToken: string,
  workspaceId: string,
  objectId: string,
  payload: {
    version_id: string
    expected_version_id?: string | null
  }
) {
  return requestJson<{
    object: WorkspaceObject
    version: WorkspaceObjectVersion
  }>(`/gateway/v1/workspace-objects/${objectId}/restore-version`, {
    method: "POST",
    accessToken,
    workspaceId,
    body: payload,
  })
}

export function renameMoveWorkspaceObject(
  accessToken: string,
  workspaceId: string,
  objectId: string,
  payload: { name?: string; parent_id?: string | null }
) {
  return requestJson<{ object: WorkspaceObject }>(
    `/gateway/v1/workspace-objects/${objectId}`,
    {
      method: "PATCH",
      accessToken,
      workspaceId,
      body: payload,
    }
  )
}

export function deleteWorkspaceObject(
  accessToken: string,
  workspaceId: string,
  objectId: string
) {
  return requestJson<{ object: WorkspaceObject }>(
    `/gateway/v1/workspace-objects/${objectId}`,
    {
      method: "DELETE",
      accessToken,
      workspaceId,
    }
  )
}

export function createConversation(
  accessToken: string,
  workspaceId: string,
  payload: { title: string }
) {
  return requestJson<Conversation>("/gateway/v1/conversations/create", {
    method: "POST",
    accessToken,
    workspaceId,
    body: payload,
  })
}

export function listConversations(
  accessToken: string,
  workspaceId: string,
  options?: { limit?: number; offset?: number }
) {
  const params = new URLSearchParams()
  if (options?.limit != null) {
    params.set("limit", String(options.limit))
  }
  if (options?.offset != null) {
    params.set("offset", String(options.offset))
  }

  const suffix = params.toString() ? `?${params.toString()}` : ""

  return requestJson<{ conversations: Conversation[] }>(
    `/gateway/v1/conversations/list${suffix}`,
    {
      accessToken,
      workspaceId,
    }
  )
}

export function getConversation(
  accessToken: string,
  workspaceId: string,
  conversationId: string
) {
  const params = new URLSearchParams({
    conversation_id: conversationId,
  })

  return requestJson<Conversation>(
    `/gateway/v1/conversations/get?${params.toString()}`,
    {
      accessToken,
      workspaceId,
    }
  )
}

export function getConversationMessages(
  accessToken: string,
  workspaceId: string,
  conversationId: string
) {
  const params = new URLSearchParams({
    conversation_id: conversationId,
  })

  return requestJson<ConversationMessagesResponse>(
    `/gateway/v1/conversations/messages?${params.toString()}`,
    {
      accessToken,
      workspaceId,
    }
  )
}

export function getSandboxProjectEnvironmentSummary(
  accessToken: string | null,
  workspaceId: string | null,
  projectId: string
) {
  const params = new URLSearchParams()
  if (workspaceId) {
    params.set("workspace_id", workspaceId)
  }
  const suffix = params.toString() ? `?${params.toString()}` : ""

  return requestJson<SandboxProjectEnvironmentSummary>(
    `/gateway/v1/sandbox/projects/${encodeURIComponent(projectId)}/environment-summary${suffix}`,
    {
      accessToken,
      workspaceId,
    }
  )
}

export function listSandboxWorkspaceEnvironments(
  accessToken: string | null,
  workspaceId: string | null
) {
  const params = new URLSearchParams()
  if (workspaceId) {
    params.set("workspace_id", workspaceId)
  }
  const suffix = params.toString() ? `?${params.toString()}` : ""

  return requestJson<SandboxWorkspaceEnvironmentListResponse>(
    `/gateway/v1/sandbox/environments${suffix}`,
    {
      accessToken,
      workspaceId,
    }
  )
}

export function upsertSandboxProjectPreference(
  accessToken: string | null,
  workspaceId: string | null,
  payload: {
    workspace_id?: string | null
    project_id: string
    preference_mode: SandboxPreferenceMode
    environment_id?: string | null
  }
) {
  return requestJson<SandboxProjectPreference>(
    "/gateway/v1/sandbox/projects/preferences",
    {
      method: "POST",
      accessToken,
      workspaceId,
      body: payload,
    }
  )
}

export function selectSandboxEnvironment(
  accessToken: string | null,
  workspaceId: string | null,
  payload: {
    workspace_id?: string | null
    project_id: string
    preference_mode?: SandboxPreferenceMode
    environment_id?: string | null
    capability_hint?: SandboxCapabilityHint
  }
) {
  return requestJson<SandboxEnvironmentSelection>(
    "/gateway/v1/sandbox/environments/select",
    {
      method: "POST",
      accessToken,
      workspaceId,
      body: payload,
    }
  )
}

export function listSandboxPathGrants(
  accessToken: string | null,
  workspaceId: string | null,
  environmentId: string
) {
  return requestJson<SandboxPathGrantListResponse>(
    `/gateway/v1/sandbox/environments/${encodeURIComponent(environmentId)}/path-grants`,
    {
      accessToken,
      workspaceId,
    }
  )
}

export function createSandboxFileExecutionRequest(
  accessToken: string | null,
  workspaceId: string | null,
  payload: {
    environment_id?: string
    project_id?: string
    operation: SandboxFileOperation
    metadata_json?: Record<string, unknown>
  }
) {
  return requestJson<SandboxExecutionRequestResponse>(
    "/gateway/v1/sandbox/execution-requests/file",
    {
      method: "POST",
      accessToken,
      workspaceId,
      body: payload,
    }
  )
}

export function createSandboxCommandExecutionRequest(
  accessToken: string | null,
  workspaceId: string | null,
  payload: {
    environment_id?: string
    project_id?: string
    operation: SandboxCommandOperation
    metadata_json?: Record<string, unknown>
  }
) {
  return requestJson<SandboxExecutionRequestResponse>(
    "/gateway/v1/sandbox/execution-requests/command",
    {
      method: "POST",
      accessToken,
      workspaceId,
      body: payload,
    }
  )
}

export function getSandboxExecutionSession(
  accessToken: string | null,
  workspaceId: string | null,
  executionSessionId: string
) {
  return requestJson<SandboxExecutionSession>(
    `/gateway/v1/sandbox/execution-sessions/${encodeURIComponent(executionSessionId)}`,
    {
      accessToken,
      workspaceId,
    }
  )
}

export function getSandboxExecutionTimeline(
  accessToken: string | null,
  workspaceId: string | null,
  executionSessionId: string
) {
  return requestJson<SandboxExecutionTimeline>(
    `/gateway/v1/sandbox/execution-sessions/${encodeURIComponent(executionSessionId)}/timeline`,
    {
      accessToken,
      workspaceId,
    }
  )
}

export function listSandboxSessionsForToolCall(
  accessToken: string | null,
  workspaceId: string | null,
  toolCallId: string
) {
  return requestJson<SandboxToolCallSessionsResponse>(
    `/gateway/v1/sandbox/tool-calls/${encodeURIComponent(toolCallId)}/execution-sessions`,
    {
      accessToken,
      workspaceId,
    }
  )
}

export function interruptSandboxExecutionSession(
  accessToken: string | null,
  workspaceId: string | null,
  payload: {
    execution_session_id: string
    reason?: string
  }
) {
  return requestJson<{
    execution_session_id: string
    status: SandboxExecutionSessionStatus
  }>("/gateway/v1/sandbox/execution-sessions/interrupt", {
    method: "POST",
    accessToken,
    workspaceId,
    body: payload,
  })
}

export function listPendingSandboxApprovals(
  accessToken: string | null,
  workspaceId: string | null
) {
  return requestJson<SandboxApprovalListResponse>(
    "/gateway/v1/sandbox/approvals/pending",
    {
      accessToken,
      workspaceId,
    }
  )
}

export function approveSandboxApproval(
  accessToken: string | null,
  workspaceId: string | null,
  payload: {
    approval_id: string
    reason?: string
  }
) {
  return requestJson<SandboxApproval>("/gateway/v1/sandbox/approvals/approve", {
    method: "POST",
    accessToken,
    workspaceId,
    body: payload,
  })
}

export function rejectSandboxApproval(
  accessToken: string | null,
  workspaceId: string | null,
  payload: {
    approval_id: string
    reason?: string
  }
) {
  return requestJson<SandboxApproval>("/gateway/v1/sandbox/approvals/reject", {
    method: "POST",
    accessToken,
    workspaceId,
    body: payload,
  })
}

export function resumeRunWithApproval(
  accessToken: string | null,
  workspaceId: string | null,
  payload: {
    run_id?: string | null
    session_key?: string | null
    need_id: string
    approved: boolean
  }
) {
  return requestJson<ResumeRunResponse>("/gateway/v1/runs/resume", {
    method: "POST",
    accessToken,
    workspaceId,
    body: {
      run_id: payload.run_id,
      session_key: payload.session_key,
      resolution: {
        kind: "approval",
        need_id: payload.need_id,
        approved: payload.approved,
      },
    },
  })
}

export async function getConversationEvents(
  accessToken: string,
  workspaceId: string,
  conversationId: string,
  options?: {
    afterSeq?: number
    max?: number
  }
) {
  const params = new URLSearchParams({
    conversation_id: conversationId,
  })
  if (options?.afterSeq != null) {
    params.set("after_seq", String(options.afterSeq))
  }
  if (options?.max != null) {
    params.set("max", String(options.max))
  }

  const response = await requestJson<{
    events: unknown[]
    next_seq?: number | null
  }>(`/gateway/v1/conversations/events?${params.toString()}`, {
    accessToken,
    workspaceId,
  })

  return {
    events: response.events
      .map((event) => normalizeGatewayEnvelope(event))
      .filter((event): event is GatewayChatStreamEnvelope => event !== null),
    next_seq: response.next_seq ?? null,
  } satisfies ConversationEventsResponse
}

export async function subscribeConversationEvents(
  accessToken: string,
  workspaceId: string,
  conversationId: string,
  options: {
    runId?: string | null
    afterSeq?: number | null
    signal?: AbortSignal
    onEnvelope: (envelope: GatewayChatStreamEnvelope) => void
  }
) {
  const params = new URLSearchParams({
    conversation_id: conversationId,
  })
  if (options.runId) {
    params.set("run_id", options.runId)
  }
  if (options.afterSeq != null) {
    params.set("after_seq", String(options.afterSeq))
  }

  const response = await fetch(
    toUrl(`/gateway/v1/conversations/subscribe?${params.toString()}`),
    {
      method: "GET",
      headers: buildHeaders({
        accessToken,
        workspaceId,
        accept: "text/event-stream, application/json",
      }),
      signal: options.signal,
    }
  )

  if (!response.ok) {
    throw withRecoverableFlag(new Error(await parseError(response)), true)
  }

  const contentType = response.headers.get("content-type")?.toLowerCase() ?? ""
  try {
    if (contentType.includes("text/event-stream")) {
      await parseSseStream(response, options.onEnvelope)
      return
    }

    const parsed = normalizeGatewayEnvelope(await response.json())
    if (parsed) {
      options.onEnvelope(parsed)
    }
  } catch (error) {
    const next =
      error instanceof Error ? error : new Error("Failed to read gateway stream")
    throw withRecoverableFlag(next, true)
  }
}

export async function streamConversationSend(
  accessToken: string,
  workspaceId: string,
  payload: {
    conversation_id: string
    content: string
    stream?: boolean
    channel?: string
    input_mode?: string
    sandbox?: {
      environment_id?: string
    }
  },
  options: {
    signal?: AbortSignal
    onEnvelope: (envelope: GatewayChatStreamEnvelope) => void
  }
) {
  const response = await fetch(toUrl("/gateway/v1/conversations/send"), {
    method: "POST",
    headers: {
      ...buildHeaders({
        accessToken,
        workspaceId,
        accept: "text/event-stream, application/json",
      }),
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
    signal: options.signal,
  })

  if (!response.ok) {
    throw withRecoverableFlag(new Error(await parseError(response)), false)
  }

  const contentType = response.headers.get("content-type")?.toLowerCase() ?? ""
  try {
    if (contentType.includes("text/event-stream")) {
      await parseSseStream(response, options.onEnvelope)
      return
    }

    const parsed = normalizeGatewayEnvelope(await response.json())
    if (parsed) {
      options.onEnvelope(parsed)
    }
  } catch (error) {
    const next =
      error instanceof Error ? error : new Error("Failed to read gateway stream")
    throw withRecoverableFlag(next, true)
  }
}

export function stopConversationRun(
  accessToken: string,
  workspaceId: string,
  conversationId: string
) {
  return requestJson<{
    ok: boolean
    cancelled: boolean
    conversation_id: string
    run_id?: string | null
  }>("/gateway/v1/conversations/stop", {
    method: "POST",
    accessToken,
    workspaceId,
    body: {
      conversation_id: conversationId,
    },
  })
}

// ── Pending Inputs API ──

export type PendingInputItem = {
  id: number
  conversation_id: string
  message_id: string
  session_key: string
  content: string
  kind: string
  seq: number
  status: string
  created_at: string
}

export function getPendingInputs(
  accessToken: string,
  workspaceId: string,
  conversationId: string
) {
  return requestJson<{ pending_inputs: PendingInputItem[] }>(
    `/gateway/v1/conversations/${conversationId}/pending-inputs`,
    {
      accessToken,
      workspaceId,
    }
  )
}

export function promotePendingInput(
  accessToken: string,
  workspaceId: string,
  conversationId: string,
  pendingId: number
) {
  return requestJson<{ ok: boolean; pending_input: PendingInputItem }>(
    `/gateway/v1/conversations/${conversationId}/pending-inputs/${pendingId}/promote`,
    {
      method: "PATCH",
      accessToken,
      workspaceId,
    }
  )
}

export function deletePendingInput(
  accessToken: string,
  workspaceId: string,
  conversationId: string,
  pendingId: number
) {
  return requestJson<{ ok: boolean }>(
    `/gateway/v1/conversations/${conversationId}/pending-inputs/${pendingId}`,
    {
      method: "DELETE",
      accessToken,
      workspaceId,
    }
  )
}
