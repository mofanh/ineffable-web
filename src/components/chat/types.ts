export interface ToolCall {
  id: string
  name: string
  status: 'running' | 'done'
  output?: string
  logs?: string[] // 实时输出日志
  progress?: number
  total?: number
  arguments?: Record<string, unknown> // 工具参数
}

// 内容片段：可以是文本或工具调用
export interface ContentSegment {
  type: 'text' | 'tool'
  content?: string
  tool?: ToolCall
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
