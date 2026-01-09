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
}

/** Session - 代表一个对话会话 */
export interface Session {
  id: string
  name?: string  // 会话标题
  messageCount: number
  isActive: boolean
  workingDir?: string
  createdAt?: string
  lastActivity?: string
}

/** Sessions 列表响应 */
export interface SessionsResponse {
  currentSessionId: string
  sessions: Session[]
}

/** 消息信息 */
export interface MessageInfo {
  role: 'user' | 'assistant' | 'system'
  content: string
  timestamp?: number
}

/** Session 详情（包含消息） */
export interface SessionDetail {
  id: string
  messages: MessageInfo[]
  isActive: boolean
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

/** 创建 Service 请求 */
export interface CreateServiceRequest {
  name: string
  port: number
  working_dir: string
  auto_start?: boolean
  config_file?: string
}

/** 更新 Service 请求 */
export interface UpdateServiceRequest {
  name?: string
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
