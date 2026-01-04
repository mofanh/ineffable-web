/**
 * Service API - 与 Service Manager 交互
 */

import type { Service, CreateServiceRequest, UpdateServiceRequest, Session, SessionDetail, CreateSessionRequest, ExecuteRequest, ExecuteResponse, SSEEvent } from '../types'

// ============ Service 管理 (通过 Service Manager) ============

/**
 * 列出所有 Service
 */
export async function listServices(serverUrl: string): Promise<Service[]> {
  const res = await fetch(`${serverUrl}/api/services`)
  
  if (!res.ok) {
    throw new Error(`Failed to fetch services: ${res.status}`)
  }
  
  const data = await res.json()
  
  // 转换字段命名 (snake_case -> camelCase)
  return data.map((item: any) => ({
    id: item.id,
    name: item.name,
    port: item.port,
    workingDir: item.working_dir,
    status: item.status,
    pid: item.pid,
    autoStart: item.auto_start,
    createdAt: item.created_at,
  }))
}

/**
 * 获取单个 Service
 */
export async function getService(serverUrl: string, serviceId: string): Promise<Service> {
  const res = await fetch(`${serverUrl}/api/services/${serviceId}`)
  
  if (!res.ok) {
    throw new Error(`Failed to fetch service: ${res.status}`)
  }
  
  const item = await res.json()
  
  return {
    id: item.id,
    name: item.name,
    port: item.port,
    workingDir: item.working_dir,
    status: item.status,
    pid: item.pid,
    autoStart: item.auto_start,
    createdAt: item.created_at,
  }
}

/**
 * 创建 Service
 */
export async function createService(serverUrl: string, data: CreateServiceRequest): Promise<Service> {
  const res = await fetch(`${serverUrl}/api/services`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })
  
  if (!res.ok) {
    const error = await res.json().catch(() => ({}))
    throw new Error(error.error || `Failed to create service: ${res.status}`)
  }
  
  const item = await res.json()
  
  return {
    id: item.id,
    name: item.name,
    port: item.port,
    workingDir: item.working_dir,
    status: item.status,
    pid: item.pid,
    autoStart: item.auto_start,
    createdAt: item.created_at,
  }
}

/**
 * 更新 Service
 */
export async function updateService(serverUrl: string, serviceId: string, data: UpdateServiceRequest): Promise<Service> {
  const res = await fetch(`${serverUrl}/api/services/${serviceId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: data.name,
      port: data.port,
      working_dir: data.working_dir,
      auto_start: data.auto_start,
    }),
  })
  
  if (!res.ok) {
    const error = await res.json().catch(() => ({}))
    throw new Error(error.error || `Failed to update service: ${res.status}`)
  }
  
  const item = await res.json()
  
  return {
    id: item.id,
    name: item.name,
    port: item.port,
    workingDir: item.working_dir,
    status: item.status,
    pid: item.pid,
    autoStart: item.auto_start,
    createdAt: item.created_at,
  }
}

/**
 * 删除 Service
 */
export async function deleteService(serverUrl: string, serviceId: string): Promise<void> {
  const res = await fetch(`${serverUrl}/api/services/${serviceId}`, {
    method: 'DELETE',
  })
  
  if (!res.ok) {
    const error = await res.json().catch(() => ({}))
    throw new Error(error.error || `Failed to delete service: ${res.status}`)
  }
}

/**
 * 启动 Service
 */
export async function startService(serverUrl: string, serviceId: string): Promise<Service> {
  const res = await fetch(`${serverUrl}/api/services/${serviceId}/start`, {
    method: 'POST',
  })
  
  if (!res.ok) {
    const error = await res.json().catch(() => ({}))
    throw new Error(error.error || `Failed to start service: ${res.status}`)
  }
  
  const item = await res.json()
  
  return {
    id: item.id,
    name: item.name,
    port: item.port,
    workingDir: item.working_dir,
    status: item.status,
    pid: item.pid,
    autoStart: item.auto_start,
    createdAt: item.created_at,
  }
}

/**
 * 停止 Service
 */
export async function stopService(serverUrl: string, serviceId: string): Promise<Service> {
  const res = await fetch(`${serverUrl}/api/services/${serviceId}/stop`, {
    method: 'POST',
  })
  
  if (!res.ok) {
    const error = await res.json().catch(() => ({}))
    throw new Error(error.error || `Failed to stop service: ${res.status}`)
  }
  
  const item = await res.json()
  
  return {
    id: item.id,
    name: item.name,
    port: item.port,
    workingDir: item.working_dir,
    status: item.status,
    pid: item.pid,
    autoStart: item.auto_start,
    createdAt: item.created_at,
  }
}

/**
 * 重启 Service
 */
export async function restartService(serverUrl: string, serviceId: string): Promise<Service> {
  const res = await fetch(`${serverUrl}/api/services/${serviceId}/restart`, {
    method: 'POST',
  })
  
  if (!res.ok) {
    const error = await res.json().catch(() => ({}))
    throw new Error(error.error || `Failed to restart service: ${res.status}`)
  }
  
  const item = await res.json()
  
  return {
    id: item.id,
    name: item.name,
    port: item.port,
    workingDir: item.working_dir,
    status: item.status,
    pid: item.pid,
    autoStart: item.auto_start,
    createdAt: item.created_at,
  }
}

// ============ Service 直连 API ============

/**
 * 构建 Service URL
 */
export function buildServiceUrl(serverUrl: string, port: number): string {
  // 从 serverUrl 提取 host
  const url = new URL(serverUrl)
  return `${url.protocol}//${url.hostname}:${port}`
}

/**
 * 检查 Service 健康状态
 */
export async function checkServiceHealth(serviceUrl: string): Promise<boolean> {
  try {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 3000)
    
    const res = await fetch(`${serviceUrl}/api/health`, {
      signal: controller.signal,
    })
    
    clearTimeout(timeoutId)
    return res.ok
  } catch {
    return false
  }
}

/**
 * 列出 Sessions (CLI serve 模式)
 */
export async function listSessions(serviceUrl: string): Promise<{ currentSessionId: string; sessions: Session[] }> {
  const res = await fetch(`${serviceUrl}/api/sessions`)
  
  if (!res.ok) {
    throw new Error(`Failed to fetch sessions: ${res.status}`)
  }
  
  const data = await res.json()
  
  // CLI serve 模式返回 { current_session_id, sessions: [...] }
  return {
    currentSessionId: data.current_session_id,
    sessions: data.sessions.map((item: any) => ({
      id: item.id,
      messageCount: item.message_count,
      isActive: item.is_active,
    })),
  }
}

/**
 * 获取 Session 详情（包含消息）
 */
export async function getSessionDetail(serviceUrl: string, sessionId: string): Promise<SessionDetail> {
  const res = await fetch(`${serviceUrl}/api/sessions/${sessionId}`)
  
  if (!res.ok) {
    throw new Error(`Failed to fetch session detail: ${res.status}`)
  }
  
  const data = await res.json()
  
  return {
    id: data.id,
    messages: data.messages.map((msg: any) => ({
      role: msg.role,
      content: msg.content,
      timestamp: msg.timestamp,
    })),
    isActive: data.is_active,
  }
}

/**
 * 创建 Session (注意: CLI serve 模式可能不支持此功能)
 */
export async function createSession(serviceUrl: string, data: CreateSessionRequest): Promise<Session> {
  const res = await fetch(`${serviceUrl}/api/sessions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })
  
  if (!res.ok) {
    throw new Error(`Failed to create session: ${res.status}`)
  }
  
  const item = await res.json()
  
  return {
    id: item.id,
    messageCount: item.message_count || 0,
    isActive: item.is_active ?? true,
    workingDir: item.working_dir,
    createdAt: item.created_at,
    lastActivity: item.last_activity,
  }
}

/**
 * 删除 Session
 */
export async function deleteSession(serviceUrl: string, sessionId: string): Promise<void> {
  const res = await fetch(`${serviceUrl}/api/sessions/${sessionId}`, {
    method: 'DELETE',
  })
  
  if (!res.ok) {
    throw new Error(`Failed to delete session: ${res.status}`)
  }
}

/**
 * 执行任务
 */
export async function execute(serviceUrl: string, data: ExecuteRequest): Promise<ExecuteResponse> {
  const res = await fetch(`${serviceUrl}/api/execute`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })
  
  if (!res.ok) {
    const error = await res.text().catch(() => '')
    throw new Error(error || `Failed to execute: ${res.status}`)
  }
  
  return res.json()
}

/**
 * 订阅 SSE 事件流（CLI serve 模式使用 /api/stream 或 /events）
 */
export function subscribeToStream(
  serviceUrl: string,
  _sessionId: string, // CLI 模式不需要 sessionId，保留参数兼容
  onEvent: (event: SSEEvent) => void,
  onError?: (error: Error) => void,
): () => void {
  // CLI serve 模式使用 /api/stream 或 /events
  const eventSource = new EventSource(`${serviceUrl}/api/stream`)
  
  eventSource.onmessage = (e) => {
    try {
      const event = JSON.parse(e.data) as SSEEvent
      onEvent(event)
    } catch (err) {
      console.error('Failed to parse SSE event:', err)
    }
  }
  
  // 监听特定事件类型
  const eventTypes = ['delta', 'task_started', 'task_completed', 'task_aborted', 'tool_start', 'tool_complete']
  eventTypes.forEach(type => {
    eventSource.addEventListener(type, (e: MessageEvent) => {
      try {
        const data = JSON.parse(e.data)
        onEvent({ type, ...data })
      } catch (err) {
        console.error(`Failed to parse ${type} event:`, err)
      }
    })
  })
  
  eventSource.onerror = (e) => {
    console.error('SSE error:', e)
    onError?.(new Error('SSE connection error'))
  }
  
  // 返回取消订阅函数
  return () => {
    eventSource.close()
  }
}
