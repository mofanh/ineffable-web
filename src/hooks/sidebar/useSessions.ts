// ============ 会话列表管理 Hook ============

import { useState, useCallback, useEffect } from 'react'
import type { Server, Service, Session } from '../../types'
import { 
  listSessions, 
  createSession, 
  permanentDeleteSession, 
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
      // 兼容新旧 API：优先使用 created_at (UNIX timestamp)，回退到 createdAt (ISO string)
      if (s.created_at) {
        return s.created_at * 1000
      }
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
  const [directSessionsVirtual, setDirectSessionsVirtual] = useState(false)
  const [showSessionMenuId, setShowSessionMenuId] = useState<string | null>(null)
  const [urlInitialized, setUrlInitialized] = useState(false)

  // 加载直连模式会话
  const loadDirectSessions = useCallback(async () => {
    if (!selectedServer || selectedServer.connectionType !== 'direct') return
    setLoadingDirectSessions(true)
    try {
      const { items: sessionList } = await listSessions(selectedServer.url)
      setDirectSessionsVirtual(false)
      setDirectSessions(sortSessionsStable(sessionList))
    } catch (err) {
      const message = (err as Error).message || ''
      if (message.includes('404')) {
        setDirectSessionsVirtual(true)
        setDirectSessions([
          {
            id: 'default',
            name: '默认会话',
            messageCount: 0,
            isActive: true,
          },
        ])
      } else {
        console.error('Failed to load direct sessions:', err)
        setDirectSessions([])
      }
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
      
      // 只选择 URL 中指定的会话，不自动选择第一个
      const targetSession = directSessions.find(s => s.id === initialSessionId)
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
      await permanentDeleteSession(serviceUrl, session.id)
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
      const updated = await updateSession(serviceUrl, session.id, { title: newName })
      setServices(prev => prev.map(s => 
        s.id === service.id 
          ? { ...s, sessions: s.sessions.map(sess => sess.id === session.id ? { ...sess, title: updated.title } : sess) }
          : s
      ))
    } catch (err) {
      throw err
    }
  }, [selectedServer])

  // 创建会话（直连模式）
  const handleCreateDirectSession = useCallback(async () => {
    if (!selectedServer) return
    if (directSessionsVirtual) {
      const virtual = {
        id: 'default',
        title: '默认会话',
        created_at: 0,
        updated_at: 0,
        archived: 0,
        archived_at: null,
        messageCount: 0,
        isActive: true,
      }
      setDirectSessions(prev => prev?.length ? prev : [virtual])
      const virtualService: Service = {
        id: 'direct',
        name: selectedServer.name,
        port: 0,
        workingDir: '',
        status: 'running',
        autoStart: false,
        createdAt: '',
      }
      onSessionSelect?.(selectedServer, virtualService, virtual, selectedServer.url)
      return
    }
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
    if (directSessionsVirtual) return
    try {
      await permanentDeleteSession(selectedServer.url, session.id)
      setDirectSessions(prev => prev?.filter(s => s.id !== session.id))
    } catch (err) {
      throw err
    }
  }, [selectedServer, directSessionsVirtual])

  // 重命名会话（直连模式）
  const handleRenameDirectSession = useCallback(async (session: Session, newName: string) => {
    if (!selectedServer) return
    if (directSessionsVirtual) {
      setDirectSessions(prev => prev?.map(s => s.id === session.id ? { ...s, title: newName } : s))
      return
    }
    try {
      const updated = await updateSession(selectedServer.url, session.id, { title: newName })
      setDirectSessions(prev => prev?.map(s => s.id === session.id ? { ...s, title: updated.title } : s))
    } catch (err) {
      throw err
    }
  }, [selectedServer, directSessionsVirtual])

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
