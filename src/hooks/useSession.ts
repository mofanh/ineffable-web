import { useEffect, useRef, useCallback, useState } from 'react'

interface UseSessionOptions {
  /** 是否持久化（关闭 Web 后保留 Agent） */
  persistent?: boolean
  /** 自动心跳间隔（毫秒） */
  heartbeatInterval?: number
}

interface SessionState {
  /** Session ID */
  sessionId: string | null
  /** 是否已初始化 */
  initialized: boolean
  /** 错误信息 */
  error: string | null
}

/**
 * Session Hook - 管理 Web 会话生命周期
 * 
 * 功能：
 * - 创建 Session 并获取 Session ID
 * - 页面关闭时自动通知后端清理 Agent
 * - 支持持久化模式（关闭后保留 Agent）
 */
export function useSession(options: UseSessionOptions = {}) {
  const { persistent = false, heartbeatInterval = 30000 } = options
  
  const [state, setState] = useState<SessionState>({
    sessionId: null,
    initialized: false,
    error: null,
  })
  
  const heartbeatTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // 创建 Session
  const createSession = useCallback(async () => {
    try {
      const res = await fetch('/api/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ persistent }),
      })
      
      if (!res.ok) {
        throw new Error(`Failed to create session: ${res.statusText}`)
      }
      
      const data = await res.json()
      const sessionId = data.data?.session_id
      
      if (sessionId) {
        setState({
          sessionId,
          initialized: true,
          error: null,
        })
        
        // 保存到 sessionStorage
        sessionStorage.setItem('ineffable_session_id', sessionId)
        
        console.log('Session created:', sessionId)
        return sessionId
      } else {
        throw new Error('No session_id in response')
      }
    } catch (e) {
      const error = e instanceof Error ? e.message : 'Unknown error'
      setState(prev => ({ ...prev, error, initialized: true }))
      console.error('Failed to create session:', error)
      return null
    }
  }, [persistent])

  // 关闭 Session
  const closeSession = useCallback(async (sessionId: string) => {
    try {
      await fetch(`/api/session/${sessionId}`, {
        method: 'DELETE',
      })
      console.log('Session closed:', sessionId)
    } catch (e) {
      console.error('Failed to close session:', e)
    }
  }, [])

  // 关联 Agent 到当前 Session
  const attachAgent = useCallback(async (agentId: string) => {
    if (!state.sessionId) {
      console.warn('No session to attach agent to')
      return false
    }
    
    // 这里可以添加 API 调用来显式关联 Agent
    // 目前通过 WebSocket 连接时自动关联
    console.log('Agent attached to session:', agentId, state.sessionId)
    return true
  }, [state.sessionId])

  // 初始化
  useEffect(() => {
    // 检查是否有现有 Session
    const existingSessionId = sessionStorage.getItem('ineffable_session_id')
    
    if (existingSessionId) {
      // 尝试复用现有 Session
      setState({
        sessionId: existingSessionId,
        initialized: true,
        error: null,
      })
      console.log('Reusing existing session:', existingSessionId)
    } else {
      // 创建新 Session
      createSession()
    }

    // 页面关闭时清理
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      const sessionId = sessionStorage.getItem('ineffable_session_id')
      if (sessionId && !persistent) {
        // 使用 sendBeacon 确保请求发送
        navigator.sendBeacon(`/api/session/${sessionId}`, '')
        sessionStorage.removeItem('ineffable_session_id')
      }
    }

    // 页面隐藏时也尝试清理（移动端）
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden' && !persistent) {
        const sessionId = sessionStorage.getItem('ineffable_session_id')
        if (sessionId) {
          navigator.sendBeacon(`/api/session/${sessionId}`, '')
        }
      }
    }

    window.addEventListener('beforeunload', handleBeforeUnload)
    document.addEventListener('visibilitychange', handleVisibilityChange)

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      
      if (heartbeatTimerRef.current) {
        clearInterval(heartbeatTimerRef.current)
      }
    }
  }, [createSession, persistent])

  return {
    sessionId: state.sessionId,
    initialized: state.initialized,
    error: state.error,
    attachAgent,
    closeSession: () => state.sessionId && closeSession(state.sessionId),
  }
}

/**
 * 全局 Session 提供者
 * 用于在应用级别管理 Session
 */
export function useGlobalSession() {
  return useSession({ persistent: false })
}
