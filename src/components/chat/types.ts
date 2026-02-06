export type ToolCallStatus =
  | 'pending'
  | 'awaiting'
  | 'running'
  | 'completed'
  | 'denied'
  | 'failed'
  | 'done'

export interface ToolCall {
  id: string
  name: string
  displayName?: string
  icon?: string
  status: ToolCallStatus
  requiresApproval?: boolean
  riskLevel?: 'low' | 'medium' | 'high'
  description?: string
  output?: string
  error?: string
  logs?: string[] // 实时输出日志
  progress?: number
  total?: number
  durationMs?: number
  arguments?: Record<string, unknown> // 工具参数
}

// 内容片段：可以是文本、工具调用、推理或差异
export interface ContentSegment {
  id?: string // 片段唯一标识
  type: 'text' | 'tool' | 'reasoning' | 'thinking' | 'diff'
  content?: string // 文本、推理或思考内容
  tool?: ToolCall // 工具调用
  diff?: string | DiffFile[] // 差异内容（统一格式或结构化对象）
}

// 差异文件结构
export interface DiffFile {
  oldPath: string
  newPath: string
  hunks: DiffHunk[]
  mode?: 'modify' | 'add' | 'delete' | 'rename'
}

// 差异块结构
export interface DiffHunk {
  oldStart: number
  oldLines: number
  newStart: number
  newLines: number
  lines: DiffLine[]
}

// 差异行
export interface DiffLine {
  type: 'addition' | 'deletion' | 'neutral'
  content: string
}

export interface Message {
  id: string
  role: 'user' | 'assistant' | 'system'
  content: string // 保留用于兼容
  timestamp: number
  status?: 'streaming' | 'completed' | 'error'
  segments: ContentSegment[] // 按顺序的内容片段
  pendingToolCalls: Map<string, ToolCall> // 正在等待的工具调用
}
