// ============ 会话刷新管理 Hook ============

import { useCallback, useImperativeHandle, forwardRef } from 'react'
import type { Server, Session } from '../../types'
import { listSessions } from '../../api/services'
import type { SidebarHandle } from '../../components/sidebar/types'

interface UseSessionRefreshOptions {
  selectedServer: Server | null
  services: ServiceWithSessions[]
  directSessions: Session[] | undefined
  setDirectSessions: React.Dispatch<React.SetStateAction<Session[] | undefined>>
  setServices: React.Dispatch<React.SetStateAction<ServiceWithSessions[]>>
}

interface ServiceWithSessions extends Service {
  expanded: boolean
  loadingSessions: boolean
  sessions: Session[]
}

export function useSessionRefresh(options: UseSessionRefreshOptions) {
  const { selectedServer, services, directSessions, setDirectSessions, setServices } = options

  const refreshSessionTitle = useCallback(async (serviceUrl: string, sessionId: string) => {
    if (!selectedServer) return null
    try {
      const { sessions } = await listSessions(serviceUrl)
      const target = sessions.find(s => s.id === sessionId)
      if (!target) return null

      // 直连模式：更新直连会话列表
      if (selectedServer.connectionType === 'direct') {
        setDirectSessions(prev => {
          if (!prev || prev.length === 0) return prev
          let changed = false
          const next = prev.map(s => {
            if (s.id !== sessionId) return s
            const merged: Session = { ...s, name: target.name, createdAt: target.createdAt }
            changed = true
            return merged
          })
          return changed ? sortSessionsStable(next) : prev
        })
        return { id: target.id, name: target.name, createdAt: target.createdAt }
      }

      // Hub 模式：找到对应 service，更新它的 sessions
      setServices(prev => {
        const { buildServiceUrl } = await import('../../api/services')
        const serviceId = prev.find(s => buildServiceUrl(selectedServer.url, s.port) === serviceUrl)?.id
        if (!serviceId) return prev

        return prev.map(s => {
          if (s.id !== serviceId) return s
          if (!s.sessions || s.sessions.length === 0) return s
          let changed = false
          const updatedSessions = s.sessions.map(sess => {
            if (sess.id !== sessionId) return sess
            changed = true
            return { ...sess, name: target.name, createdAt: target.createdAt }
          })
          return changed ? { ...s, sessions: sortSessionsStable(updatedSessions) } : s
        })
      })

      return { id: target.id, name: target.name, createdAt: target.createdAt }
    } catch (err) {
      console.error('Failed to refresh session title:', err)
      return null
    }
  }, [selectedServer, setDirectSessions, setServices])

  return { refreshSessionTitle }
}

function sortSessionsStable(sessions: Session[]): Session[] {
  return [...sessions].sort((a, b) => {
    const parseCreatedAtMs = (s: Session): number | null => {
      if (!s.createdAt) return null
      const t = Date.parse(s.createdAt)
      return Number.isFinite(t) ? t : null
    }
    const ta = parseCreatedAtMs(a)
    const tb = parseCreatedAtMs(b)
    if (ta != null && tb != null) return tb - ta
    if (ta != null) return -1
    if (tb != null) return 1
    return a.id.localeCompare(b.id)
  })
}

// 导出带 ref 的包装组件
export const withSessionRefresh = (
  Component: React.ComponentType<any>,
  options: UseSessionRefreshOptions
) => {
  return forwardRef<SidebarHandle, any>((props, ref) => {
    const { refreshSessionTitle } = useSessionRefresh(options)
    
    useImperativeHandle(ref, () => ({
      refreshSessionTitle,
    }), [refreshSessionTitle])

    return <Component {...props} />
  })
}
