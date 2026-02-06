// ============ 类型定义 ============

/** 连接类型 */
export type ConnectionType = 'hub' | 'direct'

/** Server - 代表一个 Service Manager 实例或直连的 CLI 服务 */
export interface Server {
  id: string
  name: string
  url: string  // Service Manager URL 或直连 CLI URL, e.g., "http://192.168.1.100:7000"
  status: 'online' | 'offline' | 'unknown'
  serviceCount?: number
  /** 连接类型: hub=通过 Service Manager, direct=直连 CLI */
  connectionType?: ConnectionType
}

/** Service - 代表一个 AI Agent 服务 */
export interface Service {
  id: string
  name: string
  port: number
  workingDir: string
  status: 'running' | 'stopped' | 'starting' | 'failed'
  pid?: number | null
  autoStart: boolean
  createdAt: string
  serverId?: string  // 所属 Server ID
  serverUrl?: string // 所属 Server URL
  /** Hub 返回的绑定地址（可选，兼容旧 Hub） */
  host?: string
  /** Hub 托管的配置文件路径（可选） */
  configFile?: string
  /** Hub 计算出的直连 CLI URL（可选） */
  directUrl?: string
}

/** Session - 代表一个对话会话 */
export interface Session {
  id: string
  title: string
  created_at: number
  updated_at: number
  archived: number
  archived_at: number | null
  // 前端计算字段
  messageCount?: number
  isActive?: boolean
  workingDir?: string
}

/** 分页会话列表响应 */
export interface SessionsResponse {
  items: Session[]
  total: number
}

/** 归档会话列表响应 */
export type ArchivedSessionsResponse = Session[]

/** Session 消息 */
export interface SessionMessage {
  id: string
  session_id: string
  role: string
  content: string
  created_at: number
}

/** Session 详情（包含消息） */
export interface SessionDetail {
  id: string
  title: string
  created_at: number
  updated_at: number
  archived: number
  archived_at: number | null
  messages: SessionMessage[]
}

/** SSE 事件类型 */
export interface SSEEvent {
  type: string
  task_id?: string
  content?: string
  delta?: string
  tool?: string
  call_id?: string
  arguments?: Record<string, unknown>
  output?: string
  success?: boolean
  duration_ms?: number
  turns?: number
  reason?: string
  error?: string
  // tool_call_progress 事件字段
  tool_name?: string
  progress_type?: 'log' | 'progress' | 'output'
  message?: string
  progress?: number
  total?: number
  [key: string]: unknown
}

/** /api/config 响应 */
export interface ConfigResponse {
  project: {
    name: string
    version: string
    description: string
  }
  llm: {
    provider: string
    model: string
    stream: boolean
  }
  mcp_enabled: boolean
}

/** 工具审批请求（WebSocket） */
export interface ToolApprovalRequest {
  type: 'tool_approval_request'
  call_id: string
  name: string
  args: Record<string, unknown>
  risk_level: 'low' | 'medium' | 'high'
  description?: string
}

/** 工具审批响应（WebSocket） */
export interface ToolApprovalResponse {
  type: 'tool_approval_response'
  call_id: string
  approved: boolean
  remember?: 'session' | 'always' | null
}

/** 创建 Service 请求 */
export interface CreateServiceRequest {
  name: string
  /** CLI serve 的 bind host（可选） */
  host?: string
  port: number
  working_dir: string
  auto_start?: boolean
  config_file?: string
  /** 由 Hub 写入托管 config 的 JSON 内容（可选） */
  config_json?: unknown
}

/** 更新 Service 请求 */
export interface UpdateServiceRequest {
  name?: string
  host?: string
  port?: number
  working_dir?: string
  auto_start?: boolean
}

/** 创建 Session 请求 */
export interface CreateSessionRequest {
  working_dir: string
}

/** 执行任务请求 */
export interface ExecuteRequest {
  task_id?: string
  session_id?: string
  prompt: string  // CLI serve 模式使用 prompt
  stream?: boolean
}

/** 执行任务响应 */
export interface ExecuteResponse {
  task_id: string
  success?: boolean
  content?: string
  error?: string
}

/** PTY 终端会话 */
export interface PtySession {
  id: string
  pid: number | null
  command: string
  status: string
  created_at: number
}

/** 创建 PTY 请求 */
export interface CreatePtyRequest {
  command: string
  args?: string[]
  working_dir?: string
  env?: Record<string, string>
  size?: { cols: number; rows: number }
}

/** 调整 PTY 大小请求 */
export interface ResizePtyRequest {
  cols: number
  rows: number
}

// ============ Skills Types ============

/** Skill 信息 */
export interface SkillInfo {
  name: string
  description: string
  short_description?: string
  path: string
  scope: string
}

/** Skill 错误信息 */
export interface SkillErrorInfo {
  path: string
  message: string
}

/** Skills 列表条目（按 cwd 分组） */
export interface SkillsListEntry {
  cwd: string
  skills: SkillInfo[]
  errors: SkillErrorInfo[]
  match_reasons?: Record<string, string[]>
}

/** Skills 列表响应 */
export interface SkillsListResponse {
  data: SkillsListEntry[]
}

/** Skills 列表请求 */
export interface SkillsListRequest {
  cwds?: string[]
  force_reload?: boolean
  include_match_reasons?: boolean
  input?: string
}
