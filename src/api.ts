export type ApiResponse<T> = {
  success: boolean
  data: T | null
  error: any
}

// 智能体状态
export type AgentStatus = 'idle' | 'running' | 'completed' | 'error' | 'paused' | 'offline'

// 智能体信息（来自后端）
export interface RegisteredAgent {
  id: string
  name: string
  description: string
  capabilities: string[]
  endpoint: string
  status: AgentStatus
  current_task?: string
  task_count: number
  last_activity: number
  registered_at: number
  working_dir?: string
}

export async function execute(prompt: string) {
  const res = await fetch('/api/execute', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt }),
  })
  const json = (await res.json()) as ApiResponse<any>
  if (!res.ok || !json.success) throw new Error(json.error?.message || 'execute failed')
  return json.data
}

export async function getStatus() {
  const res = await fetch('/api/status')
  const json = (await res.json()) as ApiResponse<any>
  return json
}

export async function getHealth() {
  const res = await fetch('/api/health')
  const json = (await res.json()) as ApiResponse<any>
  return json
}

// ============ 多智能体 API ============

/**
 * 获取所有已注册的智能体
 */
export async function getAgents(): Promise<RegisteredAgent[]> {
  const res = await fetch('/api/agents')
  const json = (await res.json()) as ApiResponse<RegisteredAgent[]>
  if (!res.ok || !json.success) {
    console.warn('Failed to get agents:', json.error)
    return []
  }
  return json.data || []
}

/**
 * 获取单个智能体详情
 */
export async function getAgent(agentId: string): Promise<RegisteredAgent | null> {
  const res = await fetch(`/api/agents/${agentId}`)
  const json = (await res.json()) as ApiResponse<RegisteredAgent>
  if (!res.ok || !json.success) {
    return null
  }
  return json.data
}

/**
 * 向指定智能体发送执行请求
 */
export async function executeOnAgent(agentId: string, prompt: string) {
  const res = await fetch(`/api/agents/${agentId}/execute`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt }),
  })
  const json = (await res.json()) as ApiResponse<any>
  if (!res.ok || !json.success) throw new Error(json.error?.message || 'execute failed')
  return json.data
}

/**
 * SSE 事件类型
 */
export type SSEEvent = {
  type: string
  task_id?: string
  content?: string
  delta?: string
  tool?: string
  call_id?: string
  arguments?: Record<string, any>
  output?: string
  success?: boolean
  duration_ms?: number
  turns?: number
  reason?: string
  [k: string]: any
}

/**
 * 向指定智能体发送流式执行请求
 * 使用 POST + SSE 流式返回
 */
export function executeOnAgentStream(
  agentId: string,
  prompt: string,
  onEvent: (event: SSEEvent) => void,
  onError?: (error: Error) => void,
  onComplete?: () => void
): () => void {
  const controller = new AbortController()
  
  fetch(`/api/agents/${agentId}/execute/stream`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt }),
    signal: controller.signal,
  })
    .then(async (res) => {
      if (!res.ok) {
        const text = await res.text()
        throw new Error(`Request failed: ${res.status} ${text}`)
      }
      
      const reader = res.body?.getReader()
      if (!reader) {
        throw new Error('No response body')
      }
      
      const decoder = new TextDecoder()
      let buffer = ''
      
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        
        buffer += decoder.decode(value, { stream: true })
        
        // 解析 SSE 格式
        const lines = buffer.split('\n')
        buffer = lines.pop() || '' // 保留最后一个不完整的行
        
        let eventType = ''
        let eventData = ''
        
        for (const line of lines) {
          if (line.startsWith('event: ')) {
            eventType = line.slice(7).trim()
          } else if (line.startsWith('data: ')) {
            eventData = line.slice(6)
          } else if (line === '' && eventData) {
            // 空行表示事件结束
            try {
              const parsed = JSON.parse(eventData) as SSEEvent
              parsed.type = eventType || parsed.type || 'unknown'
              onEvent(parsed)
            } catch (e) {
              console.warn('Failed to parse SSE event:', eventData)
            }
            eventType = ''
            eventData = ''
          }
        }
      }
      
      onComplete?.()
    })
    .catch((err) => {
      if (err.name !== 'AbortError') {
        onError?.(err)
      }
    })
  
  // 返回取消函数
  return () => controller.abort()
}

// ============ 智能体创建/管理 API ============

/**
 * 创建智能体请求参数
 */
export interface CreateAgentRequest {
  /** 智能体名称 */
  name: string
  /** 智能体描述 */
  description?: string
  /** 工作目录（绝对路径） */
  working_dir: string
  /** 服务端口 */
  port: number
  /** 能力标签 */
  capabilities?: string[]
  /** 系统提示词 */
  system_prompt?: string
  /** LLM 提供商 */
  llm_provider?: string
  /** LLM 模型 */
  llm_model?: string
}

/**
 * 创建智能体响应
 */
export interface CreateAgentResponse {
  agent_id: string
  config_path: string
  started: boolean
  message: string
}

/**
 * 创建新智能体（生成配置文件并启动）
 */
export async function createAgent(req: CreateAgentRequest): Promise<CreateAgentResponse> {
  const res = await fetch('/api/agents/create', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(req),
  })
  const json = (await res.json()) as ApiResponse<CreateAgentResponse>
  if (!res.ok || !json.success) {
    throw new Error(json.error || 'Failed to create agent')
  }
  return json.data!
}

/**
 * 停止智能体
 */
export async function stopAgent(agentId: string): Promise<void> {
  const res = await fetch(`/api/agents/${agentId}/stop`, {
    method: 'POST',
  })
  const json = (await res.json()) as ApiResponse<string>
  if (!res.ok || !json.success) {
    throw new Error(json.error || 'Failed to stop agent')
  }
}

/**
 * 重启智能体
 */
export async function restartAgent(agentId: string): Promise<void> {
  const res = await fetch(`/api/agents/${agentId}/restart`, {
    method: 'POST',
  })
  const json = (await res.json()) as ApiResponse<string>
  if (!res.ok || !json.success) {
    throw new Error(json.error || 'Failed to restart agent')
  }
}

/**
 * 删除智能体
 */
export async function deleteAgent(agentId: string): Promise<void> {
  const res = await fetch(`/api/agents/${agentId}`, {
    method: 'DELETE',
  })
  const json = (await res.json()) as ApiResponse<string>
  if (!res.ok || !json.success) {
    throw new Error(json.error || 'Failed to delete agent')
  }
}

/**
 * 更新智能体请求（PATCH 语义，所有字段可选）
 */
export interface UpdateAgentRequest {
  /** 智能体名称 */
  name?: string
  /** 智能体描述 */
  description?: string
  /** 能力标签 */
  capabilities?: string[]
  /** 智能体服务地址 */
  endpoint?: string
}

/**
 * 更新智能体信息
 */
export async function updateAgent(agentId: string, req: UpdateAgentRequest): Promise<RegisteredAgent> {
  const res = await fetch(`/api/agents/${agentId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(req),
  })
  const json = (await res.json()) as ApiResponse<RegisteredAgent>
  if (!res.ok || !json.success) {
    throw new Error(json.error || 'Failed to update agent')
  }
  return json.data!
}

/**
 * 取消任务响应
 */
export interface CancelTaskResponse {
  success: boolean
  message: string
  task_id?: string
}

/**
 * 取消智能体当前任务
 */
export async function cancelAgentTask(agentId: string): Promise<CancelTaskResponse> {
  const res = await fetch(`/api/agents/${agentId}/cancel`, {
    method: 'POST',
  })
  const json = (await res.json()) as ApiResponse<CancelTaskResponse>
  if (!res.ok || !json.success) {
    throw new Error(json.error || 'Failed to cancel task')
  }
  return json.data!
}
