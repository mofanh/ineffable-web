import {
  normalizeGatewayEnvelope,
  type GatewayChatStreamEnvelope,
} from "@/lib/api/chat/gateway-events"
import {
  buildApiHeaders,
  createApiError,
  createIdempotencyKey,
  getApiBaseUrl,
  isAccessTokenExpiredError,
  parseApiError,
  requestApiJson,
  toApiUrl,
} from "@/lib/api/base-client"

export {
  createApiError,
  getApiBaseUrl,
  isAccessTokenExpiredError,
}

export type AppUser = {
  id: string
  email: string
  display_name: string
  avatar_url?: string | null
  phone?: string | null
  status: string
  role?: "user" | "admin" | string
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

export type WorkspaceMembership = {
  id: string
  workspace_id: string
  user_id: string
  role: "owner" | "admin" | "member" | "viewer" | string
  status: "active" | "invited" | "removed" | string
  joined_at: string
  invited_by?: string | null
  created_at: string
  updated_at: string
}

export type WorkspaceInvitation = {
  id: string
  workspace_id: string
  email: string
  role: "owner" | "admin" | "member" | "viewer" | string
  status: "pending" | "accepted" | "expired" | "revoked" | string
  invited_by: string
  accepted_by?: string | null
  expires_at: string
  created_at: string
  updated_at: string
}

export type IncomingWorkspaceInvitation = {
  invitation: WorkspaceInvitation
  workspace: Workspace
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

export type Automation = {
  id: string
  user_id: string
  conversation_id: string
  name: string
  description?: string | null
  message: string
  trigger_kind: string
  trigger_spec: Record<string, unknown>
  status: string
  next_run_at?: string | null
  last_run_at?: string | null
}

export type AutomationRun = {
  id: string
  automation_id: string
  user_id: string
  conversation_id?: string | null
  status: string
  error?: string | null
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
  page?: {
    before?: string | null
    has_older: boolean
  }
}

export type ModelProfile = {
  id: string
  display_name: string
  context_window_tokens?: number | null
  max_output_tokens?: number | null
  supports_tool_calls: boolean
  supports_reasoning: boolean
  supports_json_schema: boolean
  supports_vision: boolean
  usage_multiplier: number
  plan_id: string
  input_multiplier: number
  output_multiplier: number
  reasoning_multiplier: number
  cached_input_multiplier: number
  max_tokens_per_request?: number | null
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

function withRecoverableFlag(error: Error, recoverable: boolean) {
  return Object.assign(error, { recoverable })
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

export function registerUser(payload: {
  email: string
  display_name: string
  password: string
  avatar_url?: string | null
  phone?: string | null
}) {
  return requestApiJson<AuthResponse>("/gateway/v1/users/register", {
    method: "POST",
    body: payload,
  })
}

export function loginUser(payload: { email: string; password: string }) {
  return requestApiJson<AuthResponse>("/gateway/v1/auth/login", {
    method: "POST",
    body: payload,
  })
}

export function refreshToken(refresh_token: string) {
  return requestApiJson<{ tokens: AuthTokenPair }>("/gateway/v1/auth/refresh", {
    method: "POST",
    body: { refresh_token },
  })
}

export function fetchMe(accessToken: string, workspaceId?: string | null) {
  return requestApiJson<MeResponse>("/gateway/v1/auth/me", {
    accessToken,
    workspaceId,
  })
}

export function logoutUser(accessToken: string, workspaceId?: string | null) {
  return requestApiJson<{ session: unknown }>("/gateway/v1/auth/logout", {
    method: "POST",
    accessToken,
    workspaceId,
    body: {},
  })
}

export function fetchAuthSessions(accessToken: string, workspaceId?: string | null) {
  return requestApiJson<{ sessions: UserSessionRecord[] }>("/gateway/v1/auth/sessions", {
    accessToken,
    workspaceId,
  })
}

export function revokeAuthSession(
  accessToken: string,
  sessionId: string,
  workspaceId?: string | null
) {
  return requestApiJson<{ session: UserSessionRecord }>(
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
  return requestApiJson<{ workspace: Workspace; membership?: WorkspaceMembership }>(
    "/gateway/v1/workspaces/create",
    {
    method: "POST",
    accessToken,
    body: payload,
    }
  )
}

export function listWorkspaces(accessToken: string) {
  return requestApiJson<{ workspaces: Workspace[] }>("/gateway/v1/workspaces/list", {
    accessToken,
  })
}

export function listWorkspaceMembers(accessToken: string, workspaceId: string) {
  return requestApiJson<{ members: WorkspaceMembership[] }>(
    `/gateway/v1/workspaces/${workspaceId}/members`,
    {
      accessToken,
      workspaceId,
    }
  )
}

export function updateWorkspaceMemberRole(
  accessToken: string,
  workspaceId: string,
  userId: string,
  role: string
) {
  return requestApiJson<{ membership: WorkspaceMembership }>(
    `/gateway/v1/workspaces/${workspaceId}/members/${userId}`,
    {
      method: "PATCH",
      accessToken,
      workspaceId,
      body: { role },
    }
  )
}

export function removeWorkspaceMember(
  accessToken: string,
  workspaceId: string,
  userId: string
) {
  return requestApiJson<{ membership: WorkspaceMembership }>(
    `/gateway/v1/workspaces/${workspaceId}/members/${userId}`,
    {
      method: "DELETE",
      accessToken,
      workspaceId,
    }
  )
}

export function inviteWorkspaceMember(
  accessToken: string,
  workspaceId: string,
  payload: { email: string; role: string; invite_base_url?: string }
) {
  return requestApiJson<{
    invitation: WorkspaceInvitation
    invite_token: string
    invite_url: string
    email_receipt_provider?: string | null
    email_error?: string | null
  }>(`/gateway/v1/workspaces/${workspaceId}/invitations`, {
    method: "POST",
    accessToken,
    workspaceId,
    body: payload,
  })
}

export function listWorkspaceInvitations(accessToken: string, workspaceId: string) {
  return requestApiJson<{ invitations: WorkspaceInvitation[] }>(
    `/gateway/v1/workspaces/${workspaceId}/invitations`,
    {
      accessToken,
      workspaceId,
    }
  )
}

export function listIncomingWorkspaceInvitations(accessToken: string) {
  return requestApiJson<{ invitations: IncomingWorkspaceInvitation[] }>(
    "/gateway/v1/workspace-invitations/incoming",
    {
      accessToken,
    }
  )
}

export function revokeWorkspaceInvitation(
  accessToken: string,
  workspaceId: string,
  invitationId: string
) {
  return requestApiJson<{ invitation: WorkspaceInvitation }>(
    `/gateway/v1/workspaces/${workspaceId}/invitations/${invitationId}`,
    {
      method: "DELETE",
      accessToken,
      workspaceId,
    }
  )
}

export function acceptWorkspaceInvitation(accessToken: string, token: string) {
  return requestApiJson<{
    workspace: Workspace
    membership: WorkspaceMembership
    invitation: WorkspaceInvitation
  }>(`/gateway/v1/workspace-invitations/${encodeURIComponent(token)}/accept`, {
    method: "POST",
    accessToken,
  })
}

export function acceptWorkspaceInvitationById(
  accessToken: string,
  invitationId: string
) {
  return requestApiJson<{
    workspace: Workspace
    membership: WorkspaceMembership
    invitation: WorkspaceInvitation
  }>(
    `/gateway/v1/workspace-invitations/${encodeURIComponent(invitationId)}/accept-by-id`,
    {
      method: "POST",
      accessToken,
    }
  )
}

export function listWorkspaceTree(accessToken: string, workspaceId: string) {
  return requestApiJson<WorkspaceTreeResponse>(
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
  return requestApiJson<{ object: WorkspaceObject }>(
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
  return requestApiJson<{ object: WorkspaceObject; version: WorkspaceObjectVersion }>(
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
  return requestApiJson<WorkspaceObjectContentResponse>(
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
  return requestApiJson<{
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
  return requestApiJson<{
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
  return requestApiJson<WorkspaceObjectContentResponse>(
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
  return requestApiJson<{
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
  return requestApiJson<{ object: WorkspaceObject }>(
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
  return requestApiJson<{ object: WorkspaceObject }>(
    `/gateway/v1/workspace-objects/${objectId}`,
    {
      method: "DELETE",
      accessToken,
      workspaceId,
    }
  )
}

export function listAutomations(accessToken: string) {
  return requestApiJson<{ automations: Automation[] }>("/gateway/v1/automations", {
    accessToken,
  })
}

export function createAutomation(
  accessToken: string,
  payload: {
    conversation_id: string
    name: string
    description?: string | null
    message: string
    trigger_kind?: string | null
    trigger_spec?: Record<string, unknown>
  }
) {
  return requestApiJson<{ automation: Automation }>("/gateway/v1/automations", {
    method: "POST",
    accessToken,
    body: payload,
  })
}

export function updateAutomation(
  accessToken: string,
  automationId: string,
  payload: {
    conversation_id?: string
    name?: string
    description?: string | null
    message?: string
    trigger_kind?: string | null
    trigger_spec?: Record<string, unknown>
    status?: string
  }
) {
  return requestApiJson<{ automation: Automation }>(
    `/gateway/v1/automations/${encodeURIComponent(automationId)}`,
    {
      method: "PATCH",
      accessToken,
      body: payload,
    }
  )
}

export function deleteAutomation(accessToken: string, automationId: string) {
  return requestApiJson<{ automation: Automation }>(
    `/gateway/v1/automations/${encodeURIComponent(automationId)}`,
    {
      method: "DELETE",
      accessToken,
    }
  )
}

export function runAutomation(accessToken: string, automationId: string) {
  return requestApiJson<{
    automation_run: AutomationRun
    conversation_id: string
    send_status: number
  }>(`/gateway/v1/automations/${encodeURIComponent(automationId)}/run`, {
    method: "POST",
    accessToken,
  })
}

export function listAutomationRuns(accessToken: string, automationId: string) {
  return requestApiJson<{ runs: AutomationRun[] }>(
    `/gateway/v1/automations/${encodeURIComponent(automationId)}/runs`,
    {
      accessToken,
    }
  )
}

export function tickDueAutomations(accessToken: string) {
  return requestApiJson<{
    triggered: Array<{
      automation_run: AutomationRun
      conversation_id: string
      send_status: number
    }>
    failed: Array<{ automation_id: string; status: number }>
  }>("/gateway/v1/automations/tick", {
    method: "POST",
    accessToken,
  })
}

export function createConversation(
  accessToken: string,
  payload: { title: string }
) {
  return requestApiJson<Conversation>("/gateway/v1/conversations/create", {
    method: "POST",
    accessToken,
    body: payload,
  })
}

export function listConversations(
  accessToken: string,
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

  return requestApiJson<{ conversations: Conversation[] }>(
    `/gateway/v1/conversations/list${suffix}`,
    {
      accessToken,
    }
  )
}

export function getConversation(
  accessToken: string,
  conversationId: string
) {
  const params = new URLSearchParams({
    conversation_id: conversationId,
  })

  return requestApiJson<Conversation>(
    `/gateway/v1/conversations/get?${params.toString()}`,
    {
      accessToken,
    }
  )
}

export function getConversationMessages(
  accessToken: string,
  conversationId: string,
  options?: {
    limit?: number
    before?: string | null
  }
) {
  const params = new URLSearchParams({
    conversation_id: conversationId,
  })
  if (options?.limit != null) {
    params.set("limit", String(options.limit))
  }
  if (options?.before) {
    params.set("before", options.before)
  }

  return requestApiJson<ConversationMessagesResponse>(
    `/gateway/v1/conversations/messages?${params.toString()}`,
    {
      accessToken,
    }
  )
}

export function listModelProfiles(accessToken: string) {
  return requestApiJson<{ profiles: ModelProfile[] }>(
    "/gateway/v1/models/profiles",
    {
      accessToken,
    }
  )
}

export type AdminModelProfile = {
  id: string
  display_name: string
  endpoint_kind: string
  upstream_model_name: string
  upstream_base_url?: string | null
  upstream_api_key_ref?: string | null
  default_temperature?: number | null
  default_top_p?: number | null
  default_frequency_penalty?: number | null
  default_presence_penalty?: number | null
  default_max_tokens?: number | null
  context_window_tokens?: number | null
  max_output_tokens?: number | null
  supports_tool_calls: boolean
  supports_reasoning: boolean
  supports_json_schema: boolean
  supports_vision: boolean
  usage_multiplier: number
  enabled: boolean
  sort_order: number
  metadata_json: Record<string, unknown>
}

export type AdminPlan = {
  id: string
  name: string
  display_name: string
  monthly_credit_limit?: number | null
  enabled: boolean
}

export type AdminPlanModelAccess = {
  plan_id: string
  model_profile_id: string
  visible: boolean
  usable: boolean
  input_multiplier: number
  output_multiplier: number
  reasoning_multiplier: number
  cached_input_multiplier: number
  max_tokens_per_request?: number | null
  max_requests_per_day?: number | null
}

export type AdminLlmSecret = {
  secret_ref: string
  status: string
  has_secret: boolean
  metadata_json: Record<string, unknown>
  rotated_at?: string | null
}

export type AdminLlmSecretPayload = {
  secret_ref: string
  secret: string
  status: string
  metadata_json: Record<string, unknown>
}

export type AdminUser = AppUser & {
  created_at?: string
  updated_at?: string
  archived_at?: string | null
}

export type AdminUserPlanAssignment = {
  id: string
  user_id: string
  plan_id: string
  status: string
  effective_from: string
  effective_until?: string | null
}

export type AdminUserMonthlyUsage = {
  user_id: string
  period_yyyymm: string
  prompt_tokens: number
  completion_tokens: number
  reasoning_tokens: number
  cached_input_tokens: number
  raw_total_tokens: number
  charged_credits: number
  updated_at: string
}

export type AdminModelProfilePayload = AdminModelProfile

export type AdminPlanPayload = AdminPlan

export type AdminPlanModelAccessPayload = AdminPlanModelAccess

export function listAdminModelProfiles(accessToken: string) {
  return requestApiJson<{ profiles: AdminModelProfile[] }>(
    "/gateway/v1/admin/models/profiles",
    { accessToken },
  )
}

export function upsertAdminModelProfile(
  accessToken: string,
  payload: AdminModelProfilePayload,
) {
  return requestApiJson<{ profile: AdminModelProfile }>(
    "/gateway/v1/admin/models/profiles",
    {
      method: "PUT",
      accessToken,
      body: payload,
    },
  )
}

export function listAdminPlans(accessToken: string) {
  return requestApiJson<{ plans: AdminPlan[] }>("/gateway/v1/admin/plans", {
    accessToken,
  })
}

export function listAdminLlmSecrets(accessToken: string) {
  return requestApiJson<{ secrets: AdminLlmSecret[] }>(
    "/gateway/v1/admin/llm/secrets",
    { accessToken },
  )
}

export function upsertAdminLlmSecret(
  accessToken: string,
  payload: AdminLlmSecretPayload,
) {
  return requestApiJson<{ secret: AdminLlmSecret }>(
    "/gateway/v1/admin/llm/secrets",
    {
      method: "PUT",
      accessToken,
      body: payload,
    },
  )
}

export function upsertAdminPlan(accessToken: string, payload: AdminPlanPayload) {
  return requestApiJson<{ plan: AdminPlan }>("/gateway/v1/admin/plans", {
    method: "PUT",
    accessToken,
    body: payload,
  })
}

export function listAdminPlanModelAccess(
  accessToken: string,
  planId: string,
) {
  return requestApiJson<{ access: AdminPlanModelAccess[] }>(
    `/gateway/v1/admin/plans/${encodeURIComponent(planId)}/models`,
    { accessToken },
  )
}

export function upsertAdminPlanModelAccess(
  accessToken: string,
  payload: AdminPlanModelAccessPayload,
) {
  return requestApiJson<{ access: AdminPlanModelAccess }>(
    "/gateway/v1/admin/plan-model-access",
    {
      method: "PUT",
      accessToken,
      body: payload,
    },
  )
}

export function listAdminUsers(accessToken: string, limit = 100, offset = 0) {
  const params = new URLSearchParams({
    limit: String(limit),
    offset: String(offset),
  })
  return requestApiJson<{ users: AdminUser[] }>(
    `/gateway/v1/admin/users?${params.toString()}`,
    { accessToken },
  )
}

export function setAdminUserRole(
  accessToken: string,
  payload: { user_id: string; role: "user" | "admin" },
) {
  return requestApiJson<{ user: AdminUser }>("/gateway/v1/admin/users/role", {
    method: "PUT",
    accessToken,
    body: payload,
  })
}

export function listAdminUserPlanAssignments(
  accessToken: string,
  userId: string,
) {
  return requestApiJson<{ assignments: AdminUserPlanAssignment[] }>(
    `/gateway/v1/admin/users/${encodeURIComponent(userId)}/plans`,
    { accessToken },
  )
}

export function assignAdminUserPlan(
  accessToken: string,
  payload: {
    user_id: string
    plan_id: string
    status?: string
    effective_until?: string | null
  },
) {
  return requestApiJson<{ assignment: AdminUserPlanAssignment }>(
    "/gateway/v1/admin/user-plan-assignments",
    {
      method: "POST",
      accessToken,
      body: {
        status: "active",
        effective_until: null,
        ...payload,
      },
    },
  )
}

export function listAdminUserMonthlyUsage(
  accessToken: string,
  userId: string,
  limit = 12,
) {
  return requestApiJson<{ usage: AdminUserMonthlyUsage[] }>(
    `/gateway/v1/admin/users/${encodeURIComponent(userId)}/usage/monthly?limit=${encodeURIComponent(String(limit))}`,
    { accessToken },
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

  return requestApiJson<SandboxProjectEnvironmentSummary>(
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

  return requestApiJson<SandboxWorkspaceEnvironmentListResponse>(
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
  return requestApiJson<SandboxProjectPreference>(
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
  return requestApiJson<SandboxEnvironmentSelection>(
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
  return requestApiJson<SandboxPathGrantListResponse>(
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
  return requestApiJson<SandboxExecutionRequestResponse>(
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
  return requestApiJson<SandboxExecutionRequestResponse>(
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
  return requestApiJson<SandboxExecutionSession>(
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
  return requestApiJson<SandboxExecutionTimeline>(
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
  return requestApiJson<SandboxToolCallSessionsResponse>(
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
  return requestApiJson<{
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
  return requestApiJson<SandboxApprovalListResponse>(
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
  return requestApiJson<SandboxApproval>("/gateway/v1/sandbox/approvals/approve", {
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
  return requestApiJson<SandboxApproval>("/gateway/v1/sandbox/approvals/reject", {
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
  return requestApiJson<ResumeRunResponse>("/gateway/v1/runs/resume", {
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

  const response = await requestApiJson<{
    events: unknown[]
    next_seq?: number | null
  }>(`/gateway/v1/conversations/events?${params.toString()}`, {
    accessToken,
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
    toApiUrl(`/gateway/v1/conversations/subscribe?${params.toString()}`),
    {
      method: "GET",
      headers: buildApiHeaders({
        accessToken,
        accept: "text/event-stream, application/json",
      }),
      signal: options.signal,
    }
  )

  if (!response.ok) {
    throw withRecoverableFlag(createApiError(await parseApiError(response)), true)
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
  payload: {
    conversation_id: string
    content: string
    stream?: boolean
    channel?: string
    input_mode?: string
    model_profile_id?: string
    sandbox?: {
      environment_id?: string
    }
  },
  options: {
    signal?: AbortSignal
    idempotencyKey?: string
    onEnvelope: (envelope: GatewayChatStreamEnvelope) => void
  }
) {
  const response = await fetch(toApiUrl("/gateway/v1/conversations/send"), {
    method: "POST",
    headers: {
      ...buildApiHeaders({
        accessToken,
        accept: "text/event-stream, application/json",
      }),
      "Content-Type": "application/json",
      "Idempotency-Key":
        options.idempotencyKey ?? createIdempotencyKey("conversation-send"),
    },
    body: JSON.stringify(payload),
    signal: options.signal,
  })

  if (!response.ok) {
    throw withRecoverableFlag(createApiError(await parseApiError(response)), false)
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
  conversationId: string
) {
  return requestApiJson<{
    ok: boolean
    cancelled: boolean
    conversation_id: string
    run_id?: string | null
  }>("/gateway/v1/conversations/stop", {
    method: "POST",
    accessToken,
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
  conversationId: string
) {
  return requestApiJson<{ pending_inputs: PendingInputItem[] }>(
    `/gateway/v1/conversations/${conversationId}/pending-inputs`,
    {
      accessToken,
    }
  )
}

export function promotePendingInput(
  accessToken: string,
  conversationId: string,
  pendingId: number
) {
  return requestApiJson<{ ok: boolean; pending_input: PendingInputItem }>(
    `/gateway/v1/conversations/${conversationId}/pending-inputs/${pendingId}/promote`,
    {
      method: "PATCH",
      accessToken,
    }
  )
}

export function deletePendingInput(
  accessToken: string,
  conversationId: string,
  pendingId: number
) {
  return requestApiJson<{ ok: boolean }>(
    `/gateway/v1/conversations/${conversationId}/pending-inputs/${pendingId}`,
    {
      method: "DELETE",
      accessToken,
    }
  )
}
