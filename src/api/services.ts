/**
 * Service API - 与 Service Manager 交互
 */

import type { Service, CreateServiceRequest, UpdateServiceRequest, Session, SessionDetail, CreateSessionRequest, ExecuteRequest, ExecuteResponse, SSEEvent, ConfigResponse } from '../types'

function buildApiUrl(serviceUrl: string, path: string): string {
  return `${serviceUrl}${path}`
}

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
    host: item.host,
    port: item.port,
    workingDir: item.working_dir,
    status: item.status,
    pid: item.pid,
    autoStart: item.auto_start,
    createdAt: item.created_at,
    configFile: item.config_file,
    directUrl: item.direct_url,
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
    host: item.host,
    port: item.port,
    workingDir: item.working_dir,
    status: item.status,
    pid: item.pid,
    autoStart: item.auto_start,
    createdAt: item.created_at,
    configFile: item.config_file,
    directUrl: item.direct_url,
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
    host: item.host,
    port: item.port,
    workingDir: item.working_dir,
    status: item.status,
    pid: item.pid,
    autoStart: item.auto_start,
    createdAt: item.created_at,
    configFile: item.config_file,
    directUrl: item.direct_url,
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
      host: data.host,
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
    host: item.host,
    port: item.port,
    workingDir: item.working_dir,
    status: item.status,
    pid: item.pid,
    autoStart: item.auto_start,
    createdAt: item.created_at,
    configFile: item.config_file,
    directUrl: item.direct_url,
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
    host: item.host,
    port: item.port,
    workingDir: item.working_dir,
    status: item.status,
    pid: item.pid,
    autoStart: item.auto_start,
    createdAt: item.created_at,
    configFile: item.config_file,
    directUrl: item.direct_url,
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
    host: item.host,
    port: item.port,
    workingDir: item.working_dir,
    status: item.status,
    pid: item.pid,
    autoStart: item.auto_start,
    createdAt: item.created_at,
    configFile: item.config_file,
    directUrl: item.direct_url,
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
    host: item.host,
    port: item.port,
    workingDir: item.working_dir,
    status: item.status,
    pid: item.pid,
    autoStart: item.auto_start,
    createdAt: item.created_at,
    configFile: item.config_file,
    directUrl: item.direct_url,
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
    
    const res = await fetch(buildApiUrl(serviceUrl, '/api/health'), {
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
export async function listSessions(serviceUrl: string): Promise<SessionsResponse> {
  const res = await fetch(buildApiUrl(serviceUrl, '/api/sessions'))
  
  if (!res.ok) {
    throw new Error(`Failed to fetch sessions: ${res.status}`)
  }
  
  const data = await res.json()
  
  // 新 API 返回 { items: [...], total: n }
  return {
    items: data.items.map((item: any) => ({
      id: item.id,
      title: item.title,
      created_at: item.created_at,
      updated_at: item.updated_at,
      archived: item.archived,
      archived_at: item.archived_at,
      isActive: item.archived === 0,
    })),
    total: data.total,
  }
}

/**
 * 列出归档的 Sessions
 */
export async function listArchivedSessions(serviceUrl: string): Promise<Session[]> {
  const res = await fetch(buildApiUrl(serviceUrl, '/api/sessions/archived'))
  
  if (!res.ok) {
    throw new Error(`Failed to fetch archived sessions: ${res.status}`)
  }
  
  const data = await res.json()
  
  return data.map((item: any) => ({
    id: item.id,
    title: item.title,
    created_at: item.created_at,
    updated_at: item.updated_at,
    archived: item.archived,
    archived_at: item.archived_at,
    isActive: false,
  }))
}

/**
 * 获取 Session 详情（包含消息）
 */
export async function getSessionDetail(serviceUrl: string, sessionId: string): Promise<SessionDetail> {
  const res = await fetch(buildApiUrl(serviceUrl, `/api/sessions/${sessionId}`))
  
  if (!res.ok) {
    throw new Error(`Failed to fetch session detail: ${res.status}`)
  }
  
  const data = await res.json()
  
  return {
    id: data.id,
    title: data.title,
    created_at: data.created_at,
    updated_at: data.updated_at,
    archived: data.archived,
    archived_at: data.archived_at,
    messages: data.messages.map((msg: any) => ({
      id: msg.id,
      session_id: msg.session_id,
      role: msg.role,
      content: msg.content,
      created_at: msg.created_at,
    })),
  }
}

/**
 * 获取 Session 消息
 */
export async function getSessionMessages(serviceUrl: string, sessionId: string): Promise<SessionMessage[]> {
  const res = await fetch(buildApiUrl(serviceUrl, `/api/sessions/${sessionId}/messages`))
  
  if (!res.ok) {
    throw new Error(`Failed to fetch session messages: ${res.status}`)
  }
  
  const data = await res.json()
  
  return data.map((msg: any) => ({
    id: msg.id,
    session_id: msg.session_id,
    role: msg.role,
    content: msg.content,
    created_at: msg.created_at,
  }))
}

/**
 * 创建 Session (CLI serve 模式)
 */
export async function createSession(serviceUrl: string, data?: { title?: string }): Promise<Session> {
  const res = await fetch(buildApiUrl(serviceUrl, '/api/sessions'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data || {}),
  })
  
  if (!res.ok) {
    throw new Error(`Failed to create session: ${res.status}`)
  }
  
  const item = await res.json()
  
  return {
    id: item.id,
    title: item.title,
    created_at: item.created_at,
    updated_at: item.updated_at,
    archived: item.archived,
    archived_at: item.archived_at,
    isActive: true,
  }
}

/**
 * 删除 Session (软删除/归档)
 */
export async function deleteSession(serviceUrl: string, sessionId: string): Promise<boolean> {
  const res = await fetch(buildApiUrl(serviceUrl, `/api/sessions/${sessionId}`), {
    method: 'DELETE',
  })
  
  if (!res.ok) {
    throw new Error(`Failed to delete session: ${res.status}`)
  }
  
  const data = await res.json()
  return data === true || data.success === true
}

/**
 * 恢复归档的 Session
 */
export async function restoreSession(serviceUrl: string, sessionId: string): Promise<Session> {
  const res = await fetch(buildApiUrl(serviceUrl, `/api/sessions/${sessionId}/restore`), {
    method: 'POST',
  })
  
  if (!res.ok) {
    throw new Error(`Failed to restore session: ${res.status}`)
  }
  
  const item = await res.json()
  
  return {
    id: item.id,
    title: item.title,
    created_at: item.created_at,
    updated_at: item.updated_at,
    archived: item.archived,
    archived_at: item.archived_at,
    isActive: true,
  }
}

/**
 * 永久删除 Session
 */
export async function permanentDeleteSession(serviceUrl: string, sessionId: string): Promise<boolean> {
  const res = await fetch(buildApiUrl(serviceUrl, `/api/sessions/${sessionId}/permanent`), {
    method: 'DELETE',
  })
  
  if (!res.ok) {
    throw new Error(`Failed to permanently delete session: ${res.status}`)
  }
  
  const data = await res.json()
  return data === true || data.success === true
}

/**
 * 更新 Session (重命名)
 */
export async function updateSession(serviceUrl: string, sessionId: string, data: { title?: string }): Promise<Session> {
  const res = await fetch(buildApiUrl(serviceUrl, `/api/sessions/${sessionId}`), {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })
  
  if (!res.ok) {
    const error = await res.json().catch(() => ({}))
    throw new Error(error.error || `Failed to update session: ${res.status}`)
  }
  
  const item = await res.json()
  
  return {
    id: item.id,
    title: item.title,
    created_at: item.created_at,
    updated_at: item.updated_at,
    archived: item.archived,
    archived_at: item.archived_at,
    isActive: item.archived === 0,
  }
}

/**
 * 执行任务
 */
export async function execute(serviceUrl: string, data: ExecuteRequest): Promise<ExecuteResponse> {
  const res = await fetch(buildApiUrl(serviceUrl, '/api/execute'), {
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
 * 执行任务（流式返回）
 * 使用 fetch 读取 SSE 流，比 EventSource 更可靠
 * 
 * @param serviceUrl - 服务 URL
 * @param data - 执行请求参数
 * @param onEvent - 事件回调
 * @param signal - AbortController signal 用于取消
 */
export async function executeStream(
  serviceUrl: string,
  data: ExecuteRequest,
  onEvent: (event: SSEEvent) => void,
  signal?: AbortSignal,
): Promise<void> {
  const res = await fetch(buildApiUrl(serviceUrl, '/api/execute/stream'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
    signal,
  })
  
  if (!res.ok) {
    const error = await res.text().catch(() => '')
    throw new Error(error || `Failed to execute: ${res.status}`)
  }
  
  const reader = res.body?.getReader()
  if (!reader) {
    throw new Error('Response body is not readable')
  }
  
  const decoder = new TextDecoder()
  let buffer = ''
  
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      
      buffer += decoder.decode(value, { stream: true })
      
      // 解析 SSE 事件 (事件以 \n\n 分隔)
      const parts = buffer.split('\n\n')
      buffer = parts.pop() || ''
      
      for (const part of parts) {
        if (!part.trim()) continue
        
        const lines = part.split('\n')
        let eventType = 'message'
        let eventData = ''
        
        for (const line of lines) {
          if (line.startsWith('event:')) {
            eventType = line.slice(6).trim()
          } else if (line.startsWith('data:')) {
            eventData = line.slice(5).trim()
          }
        }
        
        // 忽略 ping 事件
        if (eventType === 'ping') continue
        
        if (eventData) {
          try {
            const data = JSON.parse(eventData)
            onEvent({ type: eventType, ...data })
          } catch {
            // 非 JSON 数据
            onEvent({ type: eventType, content: eventData })
          }
        } else {
          onEvent({ type: eventType })
        }
      }
    }
  } finally {
    reader.releaseLock()
  }
}

/**
 * 获取服务端配置
 */
export async function getConfig(serviceUrl: string): Promise<ConfigResponse> {
  const res = await fetch(buildApiUrl(serviceUrl, '/api/config'))

  if (!res.ok) {
    const error = await res.text().catch(() => '')
    throw new Error(error || `Failed to fetch config: ${res.status}`)
  }

  return res.json()
}

/**
 * 取消当前任务
 */
export async function cancelTask(serviceUrl: string): Promise<void> {
  const res = await fetch(buildApiUrl(serviceUrl, '/api/cancel'), {
    method: 'POST',
  })
  
  if (!res.ok) {
    const error = await res.text().catch(() => '')
    throw new Error(error || `Failed to cancel: ${res.status}`)
  }
}

/**
 * 订阅 SSE 事件流（CLI serve 模式使用 /api/stream 或 /events）
 * 注意：这个函数保留用于全局事件监听，
 * 对于任务执行，推荐使用 executeStream
 */
export function subscribeToStream(
  serviceUrl: string,
  _sessionId: string, // CLI 模式不需要 sessionId，保留参数兼容
  onEvent: (event: SSEEvent) => void,
  onError?: (error: Error) => void,
): () => void {
  // CLI serve 模式使用 /api/stream 或 /events
  const eventSource = new EventSource(buildApiUrl(serviceUrl, '/api/stream'))
  
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

// ============ PTY 终端管理 ============

import type { PtySession, CreatePtyRequest, ResizePtyRequest } from '../types'

/**
 * 列出所有 PTY 终端
 */
export async function listPtySessions(serviceUrl: string): Promise<PtySession[]> {
  const res = await fetch(buildApiUrl(serviceUrl, '/api/pty'))
  
  if (!res.ok) {
    throw new Error(`Failed to fetch PTY sessions: ${res.status}`)
  }
  
  return res.json()
}

/**
 * 获取 PTY 终端详情
 */
export async function getPtySession(serviceUrl: string, ptyId: string): Promise<PtySession> {
  const res = await fetch(buildApiUrl(serviceUrl, `/api/pty/${ptyId}`))
  
  if (!res.ok) {
    throw new Error(`Failed to fetch PTY session: ${res.status}`)
  }
  
  return res.json()
}

/**
 * 创建新的 PTY 终端
 */
export async function createPtySession(serviceUrl: string, data: CreatePtyRequest): Promise<PtySession> {
  const res = await fetch(buildApiUrl(serviceUrl, '/api/pty'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })
  
  if (!res.ok) {
    const error = await res.text().catch(() => '')
    throw new Error(error || `Failed to create PTY session: ${res.status}`)
  }
  
  return res.json()
}

/**
 * 删除 PTY 终端
 */
export async function deletePtySession(serviceUrl: string, ptyId: string): Promise<void> {
  const res = await fetch(buildApiUrl(serviceUrl, `/api/pty/${ptyId}`), {
    method: 'DELETE',
  })
  
  if (!res.ok) {
    throw new Error(`Failed to delete PTY session: ${res.status}`)
  }
}

/**
 * 调整 PTY 终端大小
 */
export async function resizePtySession(serviceUrl: string, ptyId: string, size: ResizePtyRequest): Promise<void> {
  const res = await fetch(buildApiUrl(serviceUrl, `/api/pty/${ptyId}/resize`), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(size),
  })
  
  if (!res.ok) {
    throw new Error(`Failed to resize PTY session: ${res.status}`)
  }
}

/**
 * 创建 PTY WebSocket 连接
 * 
 * @param serviceUrl - 服务 URL (http://...)
 * @param ptyId - PTY 会话 ID
 * @param onData - 接收数据回调
 * @param onClose - 连接关闭回调
 * @returns WebSocket 对象
 */
export function connectPtyWebSocket(
  serviceUrl: string,
  ptyId: string,
  onData: (data: string) => void,
  onClose?: () => void,
  onError?: (error: Error) => void,
): WebSocket {
  // 将 http:// 转换为 ws://
  const wsUrl = serviceUrl.replace(/^http/, 'ws') + `/api/pty/${ptyId}/connect`
  
  const ws = new WebSocket(wsUrl)
  
  ws.onmessage = (event) => {
    try {
      const msg = JSON.parse(event.data)
      if (msg.type === 'data' && msg.data) {
        onData(msg.data)
      }
    } catch {
      // 如果不是 JSON，直接作为文本处理
      onData(event.data)
    }
  }
  
  ws.onclose = () => {
    onClose?.()
  }
  
  ws.onerror = () => {
    onError?.(new Error('WebSocket connection error'))
  }
  
  return ws
}
