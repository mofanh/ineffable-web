// ============ 会话列表管理 Hook ============

import { useState, useCallback, useEffect } from 'react'
import type { Server, Service, Session } from '../../types'
import { 
  listSessions, 
  createSession, 
  deleteSession, 
  updateSession,
  buildServiceUrl 
} from '../../api/services'

interface UseSessionsOptions {
  selectedServer: Server | null
  initialSessionId?: string
  onSessionSelect?: (server: Server, service: Service, session: Session, serviceUrl: string) => void
}

interface UseSessionsReturn {
  // Hub 模式
  services: ServiceWithSessions[]
  // 直连模式
  directSessions: Session[] | undefined
  loadingDirectSessions: boolean
  showSessionMenuId: string | null
  setShowSessionMenuId: (id: string | null) => void
  loadDirectSessions: () => Promise<void>
  handleCreateSession: (service: ServiceWithSessions, e: React.MouseEvent) => Promise<void>
  handleDeleteSession: (service: ServiceWithSessions, session: Session, e: React.MouseEvent) => Promise<void>
  handleRenameSession: (service: ServiceWithSessions, session: Session, newName: string) => Promise<void>
  handleCreateDirectSession: () => Promise<void>
  handleDeleteDirectSession: (session: Session, e: React.MouseEvent) => Promise<void>
  handleRenameDirectSession: (session: Session, newName: string) => Promise<void>
}

interface ServiceWithSessions extends Service {
  expanded: boolean
  loadingSessions: boolean
  sessions: Session[]
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

export function useSessions(options: UseSessionsOptions): UseSessionsReturn {
  const { selectedServer, initialSessionId, onSessionSelect } = options
  
  const [services, setServices] = useState<ServiceWithSessions[]>([])
  const [directSessions, setDirectSessions] = useState<Session[]>()
  const [loadingDirectSessions, setLoadingDirectSessions] = useState(false)
  const [showSessionMenuId, setShowSessionMenuId] = useState<string | null>(null)
  const [urlInitialized, setUrlInitialized] = useState(false)

  // 加载直连模式会话
  const loadDirectSessions = useCallback(async () => {
    if (!selectedServer || selectedServer.connectionType !== 'direct') return
    setLoadingDirectSessions(true)
    try {
      const { sessions: sessionList } = await listSessions(selectedServer.url)
      setDirectSessions(sortSessionsStable(sessionList))
    } catch (err) {
      console.error('Failed to load direct sessions:', err)
      setDirectSessions([])
    } finally {
      setLoadingDirectSessions(false)
    }
  }, [selectedServer])

  // 当选择直连服务器后加载会话
  useEffect(() => {
    if (selectedServer?.connectionType === 'direct') {
      loadDirectSessions()
    } else {
      setDirectSessions(undefined)
    }
  }, [selectedServer?.connectionType, loadDirectSessions])

  // URL 初始化选择会话
  useEffect(() => {
    if (!initialSessionId || !selectedServer || urlInitialized) return

    if (selectedServer.connectionType === 'direct') {
      // 直连模式
      if (!directSessions || directSessions.length === 0) return
      
      const targetSession = directSessions.find(s => s.id === initialSessionId) || directSessions[0]
      if (targetSession) {
        const virtualService: Service = {
          id: 'direct',
          name: selectedServer.name,
          port: 0,
          workingDir: '',
          status: 'running',
          autoStart: false,
          createdAt: '',
        }
        onSessionSelect?.(selectedServer, virtualService, targetSession, selectedServer.url)
        setUrlInitialized(true)
      }
    }
  }, [initialSessionId, selectedServer, directSessions, urlInitialized, onSessionSelect])

  // 创建会话（Hub模式）
  const handleCreateSession = useCallback(async (service: ServiceWithSessions, e: React.MouseEvent) => {
    e.stopPropagation()
    if (!selectedServer) return
    try {
      const serviceUrl = buildServiceUrl(selectedServer.url, service.port)
      const newSession = await createSession(serviceUrl)
      setServices(prev => prev.map(s => 
        s.id === service.id ? { ...s, sessions: sortSessionsStable([...(s.sessions || []), newSession]) } : s
      ))
      onSessionSelect?.(selectedServer, service, newSession, serviceUrl)
    } catch (err) {
      throw err
    }
  }, [selectedServer, onSessionSelect])

  // 删除会话（Hub模式）
  const handleDeleteSession = useCallback(async (service: ServiceWithSessions, session: Session, e: React.MouseEvent) => {
    e.stopPropagation()
    if (!selectedServer) return
    try {
      const serviceUrl = buildServiceUrl(selectedServer.url, service.port)
      await deleteSession(serviceUrl, session.id)
      setServices(prev => prev.map(s => 
        s.id === service.id ? { ...s, sessions: s.sessions.filter(sess => sess.id !== session.id) } : s
      ))
    } catch (err) {
      throw err
    }
  }, [selectedServer])

  // 重命名会话（Hub模式）
  const handleRenameSession = useCallback(async (service: ServiceWithSessions, session: Session, newName: string) => {
    if (!selectedServer) return
    try {
      const serviceUrl = buildServiceUrl(selectedServer.url, service.port)
      const updated = await updateSession(serviceUrl, session.id, { name: newName })
      setServices(prev => prev.map(s => 
        s.id === service.id 
          ? { ...s, sessions: s.sessions.map(sess => sess.id === session.id ? { ...sess, name: updated.name } : sess) }
          : s
      ))
    } catch (err) {
      throw err
    }
  }, [selectedServer])

  // 创建会话（直连模式）
  const handleCreateDirectSession = useCallback(async () => {
    if (!selectedServer) return
    try {
      const newSession = await createSession(selectedServer.url)
      setDirectSessions(prev => sortSessionsStable([...(prev || []), newSession]))
      
      const virtualService: Service = {
        id: 'direct',
        name: selectedServer.name,
        port: 0,
        workingDir: '',
        status: 'running',
        autoStart: false,
        createdAt: '',
      }
      onSessionSelect?.(selectedServer, virtualService, newSession, selectedServer.url)
    } catch (err) {
      throw err
    }
  }, [selectedServer, onSessionSelect])

  // 删除会话（直连模式）
  const handleDeleteDirectSession = useCallback(async (session: Session, e: React.MouseEvent) => {
    e.stopPropagation()
    if (!selectedServer) return
    try {
      await deleteSession(selectedServer.url, session.id)
      setDirectSessions(prev => prev?.filter(s => s.id !== session.id))
    } catch (err) {
      throw err
    }
  }, [selectedServer])

  // 重命名会话（直连模式）
  const handleRenameDirectSession = useCallback(async (session: Session, newName: string) => {
    if (!selectedServer) return
    try {
      const updated = await updateSession(selectedServer.url, session.id, { name: newName })
      setDirectSessions(prev => prev?.map(s => s.id === session.id ? { ...s, name: updated.name } : s))
    } catch (err) {
      throw err
    }
  }, [selectedServer])

  return {
    services,
    directSessions,
    loadingDirectSessions,
    showSessionMenuId,
    setShowSessionMenuId,
    loadDirectSessions,
    handleCreateSession,
    handleDeleteSession,
    handleRenameSession,
    handleCreateDirectSession,
    handleDeleteDirectSession,
    handleRenameDirectSession,
  }
}
