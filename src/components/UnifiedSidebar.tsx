import React, { useState, useEffect, useCallback, forwardRef, useImperativeHandle } from 'react'
import { 
  Bot, Server as ServerIcon, Plus, RefreshCw, ChevronDown, ChevronRight, 
  MessageSquare, Settings, Wifi, WifiOff, Play, Square, Trash2, PanelLeft, FolderOpen,
  User, Sun, Moon, LogOut, X, Link2
} from 'lucide-react'
import { cn } from '../utils/cn'
import { useTheme } from '../hooks/useTheme'
import type { Server, Service, Session, ConnectionType } from '../types'
import { getServers, addServer, removeServer, refreshServerStatuses } from '../api/servers'
import { listServices, startService, stopService, createService, listSessions, createSession, deleteSession, buildServiceUrl } from '../api/services'

interface Props {
  isCollapsed: boolean
  onCollapse: (collapsed: boolean) => void
  onSessionSelect: (server: Server, service: Service, session: Session, serviceUrl: string) => void
  selectedSessionId?: string
  // URL 参数，用于初始化选择
  initialServerId?: string
  initialServiceId?: string
  initialSessionId?: string
}

export interface UnifiedSidebarHandle {
  refreshSessionTitle: (
    serviceUrl: string,
    sessionId: string
  ) => Promise<Pick<Session, 'id' | 'name' | 'createdAt'> | null>
}

interface ServiceWithSessions extends Service {
  sessions: Session[]
  expanded: boolean
  loadingSessions: boolean
}

function parseCreatedAtMs(session: Session): number | null {
  if (!session.createdAt) return null
  const t = Date.parse(session.createdAt)
  return Number.isFinite(t) ? t : null
}

function sortSessionsStable(sessions: Session[]): Session[] {
  return [...sessions].sort((a, b) => {
    const ta = parseCreatedAtMs(a)
    const tb = parseCreatedAtMs(b)
    if (ta != null && tb != null) return tb - ta
    if (ta != null) return -1
    if (tb != null) return 1
    return a.id.localeCompare(b.id)
  })
}

const UnifiedSidebar = forwardRef<UnifiedSidebarHandle, Props>(function UnifiedSidebar({ 
  isCollapsed, 
  onCollapse, 
  onSessionSelect, 
  selectedSessionId,
  initialServerId,
  initialServiceId,
  initialSessionId
}: Props, ref) {
  const { theme, toggleTheme } = useTheme()
  
  // 服务器状态
  const [servers, setServers] = useState<Server[]>([])
  const [selectedServer, setSelectedServer] = useState<Server | null>(null)
  const [loadingServers, setLoadingServers] = useState(true)
  const [showServerDropdown, setShowServerDropdown] = useState(false)
  const [showAddServer, setShowAddServer] = useState(false)
  const [newServerName, setNewServerName] = useState('')
  const [newServerUrl, setNewServerUrl] = useState('')

  // 服务状态
  const [services, setServices] = useState<ServiceWithSessions[]>([])
  const [loadingServices, setLoadingServices] = useState(false)
  
  // 创建服务对话框
  const [showCreateService, setShowCreateService] = useState(false)
  const [newServiceName, setNewServiceName] = useState('')
  const [newServicePort, setNewServicePort] = useState('8080')
  const [newServiceDir, setNewServiceDir] = useState('/tmp')
  
  // 添加服务器对话框的连接类型
  const [newServerConnectionType, setNewServerConnectionType] = useState<ConnectionType>('hub')
  
  // 直连模式的会话列表
  const [directSessions, setDirectSessions] = useState<Session[]>()
  const [loadingDirectSessions, setLoadingDirectSessions] = useState(false)
  
  // 标记是否已处理过 URL 初始化
  const [urlInitialized, setUrlInitialized] = useState(false)

  // 加载服务器列表
  useEffect(() => {
    loadServers()
  }, [])

  // 当选择服务器后加载服务或会话
  useEffect(() => {
    if (selectedServer?.status === 'online') {
      if (selectedServer.connectionType === 'direct') {
        // 直连模式：加载会话
        loadDirectSessions()
      } else {
        // Hub 模式：加载服务
        loadServices()
        setDirectSessions(undefined)
      }
    } else {
      setServices([])
      setDirectSessions(undefined)
    }
  }, [selectedServer?.id, selectedServer?.status, selectedServer?.connectionType])

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
  }, [selectedServer])

  useImperativeHandle(ref, () => ({
    refreshSessionTitle,
  }), [refreshSessionTitle])

  async function loadServers() {
    setLoadingServers(true)
    try {
      const updated = await refreshServerStatuses()
      setServers(updated)
      
      // 如果有 URL 参数，优先使用 URL 中的服务器
      if (initialServerId && !urlInitialized) {
        const fromUrl = updated.find(s => s.id === initialServerId)
        if (fromUrl) {
          setSelectedServer(fromUrl)
          return
        }
      }
      
      // 自动选择第一个在线的服务器
      const online = updated.find(s => s.status === 'online')
      if (online && !selectedServer) {
        setSelectedServer(online)
      } else if (selectedServer) {
        // 更新当前选中服务器的状态
        const current = updated.find(s => s.id === selectedServer.id)
        if (current) setSelectedServer(current)
      }
    } catch (err) {
      console.error('Failed to load servers:', err)
      setServers(getServers())
    } finally {
      setLoadingServers(false)
    }
  }

  // 当服务列表加载完成后，处理 URL 初始化
  useEffect(() => {
    if (!initialServiceId || !initialServerId || urlInitialized || services.length === 0 || !selectedServer) return
    
    const targetService = services.find(s => s.id === initialServiceId)
    if (!targetService || targetService.status !== 'running') return
    
    // 自动加载目标服务的会话
    loadSessionsForService(targetService.id)
  }, [services, initialServiceId, urlInitialized, selectedServer])
  
  // 当会话加载完成后，处理 URL 初始化选择
  useEffect(() => {
    if (!initialServiceId || !initialServerId || urlInitialized || !selectedServer) return
    
    const targetService = services.find(s => s.id === initialServiceId)
    if (!targetService || !targetService.sessions || targetService.sessions.length === 0) return
    
    // 查找目标会话
    let targetSession: Session | undefined
    if (initialSessionId) {
      targetSession = targetService.sessions.find(s => s.id === initialSessionId)
    }
    // 如果没找到指定的会话，使用第一个会话
    if (!targetSession) {
      targetSession = targetService.sessions[0]
    }
    
    if (targetSession) {
      const serviceUrl = buildServiceUrl(selectedServer.url, targetService.port)
      onSessionSelect(selectedServer, targetService, targetSession, serviceUrl)
      setUrlInitialized(true)
    }
  }, [services, initialServiceId, initialSessionId, urlInitialized, selectedServer, onSessionSelect])

  // 直连模式：当直连会话加载完成后，处理 URL 初始化选择
  useEffect(() => {
    if (!initialServerId || !initialServiceId || urlInitialized || !selectedServer) return
    if (selectedServer.id !== initialServerId) return
    if (selectedServer.connectionType !== 'direct') return
    if (initialServiceId !== 'direct') return
    if (!directSessions || directSessions.length === 0) return

    let targetSession: Session | undefined
    if (initialSessionId) {
      targetSession = directSessions.find(s => s.id === initialSessionId)
    }
    if (!targetSession) {
      targetSession = directSessions[0]
    }

    if (targetSession) {
      // 复用直连点击逻辑（会构造 virtualService 并回调 onSessionSelect）
      handleDirectSessionClick(targetSession)
      setUrlInitialized(true)
    }
  }, [directSessions, initialServerId, initialServiceId, initialSessionId, urlInitialized, selectedServer])

  async function loadServices() {
    if (!selectedServer) return
    setLoadingServices(true)
    try {
      const list = await listServices(selectedServer.url)
      setServices(list.map(s => ({ 
        ...s, 
        serverId: selectedServer.id, 
        serverUrl: selectedServer.url,
        sessions: [],
        expanded: false,
        loadingSessions: false,
      })))
    } catch (err) {
      console.error('Failed to load services:', err)
      setServices([])
    } finally {
      setLoadingServices(false)
    }
  }

  // 加载直连模式的会话
  async function loadDirectSessions() {
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
  }

  async function loadSessionsForService(serviceId: string) {
    if (!selectedServer) return
    const service = services.find(s => s.id === serviceId)
    if (!service || service.status !== 'running') return

    // 标记为加载中
    setServices(prev => prev.map(s => 
      s.id === serviceId ? { ...s, loadingSessions: true } : s
    ))

    try {
      const serviceUrl = buildServiceUrl(selectedServer.url, service.port)
      const { sessions: sessionList } = await listSessions(serviceUrl)
      setServices(prev => prev.map(s => 
        s.id === serviceId ? { ...s, sessions: sortSessionsStable(sessionList), loadingSessions: false, expanded: true } : s
      ))
    } catch (err) {
      console.error('Failed to load sessions:', err)
      setServices(prev => prev.map(s => 
        s.id === serviceId ? { ...s, loadingSessions: false } : s
      ))
    }
  }

  function toggleServiceExpand(serviceId: string) {
    const service = services.find(s => s.id === serviceId)
    if (!service) return

    if (service.expanded) {
      // 折叠
      setServices(prev => prev.map(s => 
        s.id === serviceId ? { ...s, expanded: false } : s
      ))
    } else {
      // 展开并加载会话
      loadSessionsForService(serviceId)
    }
  }

  async function handleStartService(serviceId: string, e: React.MouseEvent) {
    e.stopPropagation()
    if (!selectedServer) return
    try {
      await startService(selectedServer.url, serviceId)
      await loadServices()
    } catch (err) {
      alert(`启动失败: ${(err as Error).message}`)
    }
  }

  async function handleStopService(serviceId: string, e: React.MouseEvent) {
    e.stopPropagation()
    if (!selectedServer) return
    try {
      await stopService(selectedServer.url, serviceId)
      await loadServices()
    } catch (err) {
      alert(`停止失败: ${(err as Error).message}`)
    }
  }

  async function handleCreateSession(service: ServiceWithSessions, e: React.MouseEvent) {
    e.stopPropagation()
    if (!selectedServer) return
    try {
      const serviceUrl = buildServiceUrl(selectedServer.url, service.port)
      const newSession = await createSession(serviceUrl)
      // 更新会话列表
      setServices(prev => prev.map(s => 
        s.id === service.id ? { ...s, sessions: sortSessionsStable([...(s.sessions || []), newSession]) } : s
      ))
      // 选中新会话
      onSessionSelect(selectedServer, service, newSession, serviceUrl)
    } catch (err) {
      alert(`创建会话失败: ${(err as Error).message}`)
    }
  }

  async function handleDeleteSession(service: ServiceWithSessions, session: Session, e: React.MouseEvent) {
    e.stopPropagation()
    if (!selectedServer) return
    
    // 不允许删除当前活跃会话
    if (session.isActive) {
      alert('无法删除当前活跃会话')
      return
    }
    
    if (!confirm(`确定要删除会话 "${session.name || session.id.slice(0, 8)}" 吗？`)) return
    
    try {
      const serviceUrl = buildServiceUrl(selectedServer.url, service.port)
      await deleteSession(serviceUrl, session.id)
      // 从列表中移除
      setServices(prev => prev.map(s => 
        s.id === service.id ? { ...s, sessions: s.sessions.filter(sess => sess.id !== session.id) } : s
      ))
    } catch (err) {
      alert(`删除会话失败: ${(err as Error).message}`)
    }
  }

  function handleSessionClick(service: ServiceWithSessions, session: Session) {
    if (!selectedServer) return
    const serviceUrl = buildServiceUrl(selectedServer.url, service.port)
    onSessionSelect(selectedServer, service, session, serviceUrl)
  }

  // 直连模式下的会话点击
  function handleDirectSessionClick(session: Session) {
    if (!selectedServer) return
    // 创建一个虚拟的 Service 对象用于直连模式
    const virtualService: Service = {
      id: 'direct',
      name: selectedServer.name,
      port: 0, // 直连模式不需要端口，URL 已经完整
      workingDir: '',
      status: 'running',
      autoStart: false,
      createdAt: '',
    }
    onSessionSelect(selectedServer, virtualService, session, selectedServer.url)
  }

  // 直连模式下创建会话
  async function handleCreateDirectSession() {
    if (!selectedServer) return
    try {
      const newSession = await createSession(selectedServer.url)
      setDirectSessions(prev => sortSessionsStable([...(prev || []), newSession]))
      handleDirectSessionClick(newSession)
    } catch (err) {
      alert(`创建会话失败: ${(err as Error).message}`)
    }
  }

  // 直连模式下删除会话
  async function handleDeleteDirectSession(session: Session, e: React.MouseEvent) {
    e.stopPropagation()
    if (!selectedServer) return
    
    if (session.isActive) {
      alert('无法删除当前活跃会话')
      return
    }
    
    if (!confirm(`确定要删除会话 "${session.name || session.id.slice(0, 8)}" 吗？`)) return
    
    try {
      await deleteSession(selectedServer.url, session.id)
      setDirectSessions(prev => prev?.filter(s => s.id !== session.id))
    } catch (err) {
      alert(`删除会话失败: ${(err as Error).message}`)
    }
  }

  async function handleAddServer() {
    if (!newServerName.trim() || !newServerUrl.trim()) return
    const server = addServer(newServerName.trim(), newServerUrl.trim(), newServerConnectionType)
    setServers([...servers, server])
    setNewServerName('')
    setNewServerUrl('')
    setNewServerConnectionType('hub')
    setShowAddServer(false)
    loadServers()
  }

  async function handleCreateService() {
    if (!selectedServer) {
      alert('请先选择一个服务器')
      return
    }
    if (!newServiceName.trim()) {
      alert('请输入服务名称')
      return
    }
    try {
      const service = await createService(selectedServer.url, {
        name: newServiceName.trim(),
        port: parseInt(newServicePort),
        working_dir: newServiceDir.trim(),
        auto_start: true,
      })
      setShowCreateService(false)
      setNewServiceName('')
      setNewServicePort('8080')
      setNewServiceDir('/tmp')
      await loadServices()
    } catch (err) {
      alert(`创建失败: ${(err as Error).message}`)
    }
  }

  // 刷新指定服务的会话列表（用于外部调用）
  const refreshServiceSessions = useCallback(async (serviceId: string) => {
    await loadSessionsForService(serviceId)
  }, [selectedServer, services])

  if (isCollapsed) {
    return null
  }

  return (
    <aside className="w-70 flex flex-col border-r border-border bg-muted/20">
      {/* Header */}
      <div className="p-3 border-b border-border/50">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="size-8 rounded-xl bg-primary/10 flex items-center justify-center text-primary">
              <Bot className="size-5" />
            </div>
            <span className="font-semibold text-lg">Ineffable</span>
          </div>
          <button
            onClick={() => onCollapse(true)}
            className="p-1.5 rounded-lg hover:bg-muted transition-colors text-muted-foreground"
          >
            <PanelLeft className="size-4" />
          </button>
        </div>
      </div>

      {/* Server Selector */}
      <div className="p-3 border-b border-border/50">
        <div className="relative">
          <button
            onClick={() => setShowServerDropdown(!showServerDropdown)}
            className="w-full flex items-center justify-between px-3 py-2 rounded-lg bg-muted/50 hover:bg-muted transition-colors"
          >
            <div className="flex items-center gap-2">
              <ServerIcon className="size-4 text-muted-foreground" />
              {selectedServer ? (
                <>
                  <span className="text-sm font-medium truncate max-w-35">{selectedServer.name}</span>
                  {selectedServer.status === 'online' ? (
                    <Wifi className="size-3 text-success" />
                  ) : (
                    <WifiOff className="size-3 text-destructive" />
                  )}
                </>
              ) : (
                <span className="text-sm text-muted-foreground">选择服务器</span>
              )}
            </div>
            <ChevronDown className={cn("size-4 transition-transform", showServerDropdown && "rotate-180")} />
          </button>

          {/* Server Dropdown */}
          {showServerDropdown && (
            <div className="absolute top-full left-0 right-0 mt-1 bg-popover border border-border rounded-lg shadow-lg z-50 max-h-64 overflow-y-auto">
              {servers.map(server => (
                <button
                  key={server.id}
                  onClick={() => { setSelectedServer(server); setShowServerDropdown(false) }}
                  className={cn(
                    "w-full flex items-center justify-between px-3 py-2 hover:bg-muted transition-colors text-left",
                    selectedServer?.id === server.id && "bg-muted"
                  )}
                >
                  <div className="flex items-center gap-2 flex-1 min-w-0">
                    {server.connectionType === 'direct' ? (
                      <Link2 className="size-3 text-primary shrink-0" />
                    ) : (
                      <ServerIcon className="size-3 text-muted-foreground shrink-0" />
                    )}
                    <span className="text-sm truncate">{server.name}</span>
                  </div>
                  {server.status === 'online' ? (
                    <Wifi className="size-3 text-success shrink-0" />
                  ) : (
                    <WifiOff className="size-3 text-muted-foreground shrink-0" />
                  )}
                </button>
              ))}
              <div className="border-t border-border">
                <button
                  onClick={() => { setShowAddServer(true); setShowServerDropdown(false) }}
                  className="w-full flex items-center gap-2 px-3 py-2 text-primary hover:bg-muted transition-colors text-sm"
                >
                  <Plus className="size-4" />
                  添加服务器
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Services & Sessions */}
      <div className="flex-1 overflow-y-auto">
        {/* 直连模式: 显示会话列表 */}
        {selectedServer?.connectionType === 'direct' ? (
          <>
            {/* Direct Mode Header */}
            <div className="flex items-center justify-between px-3 py-2">
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">会话</span>
              <div className="flex items-center gap-1">
                <button
                  onClick={loadDirectSessions}
                  className="p-1 rounded hover:bg-muted transition-colors"
                  disabled={loadingDirectSessions}
                >
                  <RefreshCw className={cn("size-3.5", loadingDirectSessions && "animate-spin")} />
                </button>
                <button
                  onClick={handleCreateDirectSession}
                  className="p-1 rounded hover:bg-muted transition-colors text-primary"
                >
                  <Plus className="size-3.5" />
                </button>
              </div>
            </div>

            {/* Direct Sessions List */}
            {selectedServer.status !== 'online' ? (
              <div className="px-3 py-4 text-center text-muted-foreground text-sm">
                服务离线
              </div>
            ) : loadingDirectSessions ? (
              <div className="px-3 py-4 text-center text-muted-foreground text-sm">
                加载中...
              </div>
            ) : !directSessions || directSessions.length === 0 ? (
              <div className="px-3 py-4 text-center text-muted-foreground text-sm">
                <p>暂无会话</p>
                <button
                  onClick={handleCreateDirectSession}
                  className="mt-1 text-primary text-xs hover:underline"
                >
                  + 新建会话
                </button>
              </div>
            ) : (
              <div className="space-y-0.5 px-2">
                {directSessions.map(session => (
                  <div
                    key={session.id}
                    className={cn(
                      "w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-left transition-colors group/session",
                      selectedSessionId === session.id 
                        ? "bg-primary/10 text-primary" 
                        : "hover:bg-muted text-muted-foreground hover:text-foreground"
                    )}
                  >
                    <button
                      onClick={() => handleDirectSessionClick(session)}
                      className="flex items-center gap-2 flex-1 min-w-0"
                    >
                      <MessageSquare className="size-3.5 shrink-0" />
                      <span className="text-sm truncate flex-1">
                        {session.name || `会话 ${session.id.slice(0, 8)}`}
                      </span>
                    </button>
                    {session.isActive ? (
                      <span className="text-[10px] text-primary shrink-0">当前</span>
                    ) : (
                      <button
                        onClick={(e) => handleDeleteDirectSession(session, e)}
                        className="p-0.5 rounded opacity-0 group-hover/session:opacity-100 hover:bg-destructive/20 hover:text-destructive transition-all"
                        title="删除会话"
                      >
                        <X className="size-3" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </>
        ) : (
          <>
            {/* Hub Mode: Service Header */}
            <div className="flex items-center justify-between px-3 py-2">
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">服务</span>
              <div className="flex items-center gap-1">
                <button
                  onClick={loadServices}
                  className="p-1 rounded hover:bg-muted transition-colors"
                  disabled={loadingServices}
                >
                  <RefreshCw className={cn("size-3.5", loadingServices && "animate-spin")} />
                </button>
                <button
                  onClick={() => setShowCreateService(true)}
                  className="p-1 rounded hover:bg-muted transition-colors text-primary"
                >
                  <Plus className="size-3.5" />
                </button>
              </div>
            </div>

            {/* Services List */}
            {!selectedServer ? (
              <div className="px-3 py-4 text-center text-muted-foreground text-sm">
                <p>请先选择服务器</p>
                <button
                  onClick={() => setShowAddServer(true)}
                  className="mt-1 text-primary text-xs hover:underline"
                >
                  + 添加服务器
                </button>
              </div>
            ) : selectedServer.status !== 'online' ? (
              <div className="px-3 py-4 text-center text-muted-foreground text-sm">
                服务器离线
              </div>
            ) : loadingServices ? (
              <div className="px-3 py-4 text-center text-muted-foreground text-sm">
                加载中...
              </div>
            ) : services.length === 0 ? (
              <div className="px-3 py-4 text-center text-muted-foreground text-sm">
                <p>暂无服务</p>
                <button
                  onClick={() => setShowCreateService(true)}
                  className="mt-1 text-primary text-xs hover:underline"
                >
                  + 创建服务
                </button>
              </div>
            ) : (
              <div className="space-y-0.5 px-2">
                {services.map(service => (
                  <div key={service.id}>
                    {/* Service Item */}
                    <div
                      onClick={() => service.status === 'running' && toggleServiceExpand(service.id)}
                  className={cn(
                    "flex items-center gap-2 px-2 py-1.5 rounded-lg transition-colors group",
                    service.status === 'running' ? "cursor-pointer hover:bg-muted" : "opacity-60"
                  )}
                >
                  {/* Expand Icon */}
                  <div className="size-4 flex items-center justify-center">
                    {service.status === 'running' && (
                      service.loadingSessions ? (
                        <RefreshCw className="size-3 animate-spin text-muted-foreground" />
                      ) : service.expanded ? (
                        <ChevronDown className="size-3 text-muted-foreground" />
                      ) : (
                        <ChevronRight className="size-3 text-muted-foreground" />
                      )
                    )}
                  </div>

                  {/* Status Dot */}
                  <div className={cn(
                    "size-2 rounded-full shrink-0",
                    service.status === 'running' ? "bg-success" : "bg-muted-foreground"
                  )} />

                  {/* Name */}
                  <span className="text-sm flex-1 truncate">{service.name}</span>

                  {/* Actions */}
                  <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                    {service.status === 'running' ? (
                      <>
                        <button
                          onClick={(e) => handleCreateSession(service, e)}
                          className="p-1 rounded hover:bg-muted-foreground/20"
                          title="新建会话"
                        >
                          <Plus className="size-3" />
                        </button>
                        <button
                          onClick={(e) => handleStopService(service.id, e)}
                          className="p-1 rounded hover:bg-muted-foreground/20"
                          title="停止服务"
                        >
                          <Square className="size-3" />
                        </button>
                      </>
                    ) : (
                      <button
                        onClick={(e) => handleStartService(service.id, e)}
                        className="p-1 rounded hover:bg-muted-foreground/20"
                        title="启动服务"
                      >
                        <Play className="size-3" />
                      </button>
                    )}
                  </div>
                </div>

                {/* Sessions */}
                {service.expanded && service.status === 'running' && (
                  <div className="ml-6 mt-0.5 space-y-0.5">
                    {service.sessions.length === 0 ? (
                      <div className="px-2 py-1.5 text-xs text-muted-foreground">
                        暂无会话
                      </div>
                    ) : (
                      service.sessions.map(session => (
                        <div
                          key={session.id}
                          className={cn(
                            "w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-left transition-colors group/session",
                            selectedSessionId === session.id 
                              ? "bg-primary/10 text-primary" 
                              : "hover:bg-muted text-muted-foreground hover:text-foreground"
                          )}
                        >
                          <button
                            onClick={() => handleSessionClick(service, session)}
                            className="flex items-center gap-2 flex-1 min-w-0"
                          >
                            <MessageSquare className="size-3 shrink-0" />
                            <span className="text-xs truncate flex-1">
                              {session.name || `会话 ${session.id.slice(0, 8)}`}
                            </span>
                          </button>
                          {session.isActive ? (
                            <span className="text-[10px] text-primary shrink-0">当前</span>
                          ) : (
                            <button
                              onClick={(e) => handleDeleteSession(service, session, e)}
                              className="p-0.5 rounded opacity-0 group-hover/session:opacity-100 hover:bg-destructive/20 hover:text-destructive transition-all"
                              title="删除会话"
                            >
                              <X className="size-3" />
                            </button>
                          )}
                        </div>
                      ))
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
          </>
        )}
      </div>

      {/* User Profile */}
      <div className="p-3 border-t border-border/40 bg-muted/10 relative group">
        {/* Hover Menu */}
        <div className="absolute bottom-full left-3 right-3 mb-2 p-1.5 bg-popover/95 backdrop-blur-sm border border-border/50 rounded-xl shadow-xl opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 transform translate-y-2 group-hover:translate-y-0 z-50">
          <button 
            onClick={toggleTheme}
            className="w-full flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-muted/80 transition-colors text-sm text-foreground/80 hover:text-foreground"
          >
            {theme === 'dark' ? <Sun className="size-4" /> : <Moon className="size-4" />}
            <span>{theme === 'dark' ? '浅色模式' : '深色模式'}</span>
          </button>
          <button className="w-full flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-muted/80 transition-colors text-sm text-foreground/80 hover:text-foreground">
            <Settings className="size-4" />
            <span>设置</span>
          </button>
          <div className="h-px bg-border/50 my-1" />
          <button className="w-full flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-destructive/10 hover:text-destructive transition-colors text-sm text-foreground/80">
            <LogOut className="size-4" />
            <span>退出登录</span>
          </button>
        </div>

        <button className="w-full flex items-center gap-3 px-2 py-2 rounded-xl hover:bg-background hover:shadow-sm transition-all text-left border border-transparent hover:border-border/40">
          <div className="size-9 rounded-full bg-linear-to-br from-primary/20 to-primary/10 flex items-center justify-center text-primary ring-2 ring-background">
            <User className="size-4" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-medium truncate text-foreground">User</div>
            <div className="text-xs text-muted-foreground truncate">Pro Plan</div>
          </div>
          <Settings className="size-4 text-muted-foreground/70" />
        </button>
      </div>

      {/* Add Server Dialog */}
      {showAddServer && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setShowAddServer(false)}>
          <div className="bg-popover border border-border rounded-xl p-4 w-80 shadow-xl" onClick={e => e.stopPropagation()}>
            <h3 className="font-semibold mb-3">添加服务器</h3>
            <div className="space-y-3">
              <div>
                <label className="text-xs text-muted-foreground">连接类型</label>
                <div className="flex gap-2 mt-1">
                  <button
                    onClick={() => setNewServerConnectionType('hub')}
                    className={cn(
                      "flex-1 px-3 py-2 rounded-lg text-sm transition-colors",
                      newServerConnectionType === 'hub' 
                        ? "bg-primary text-primary-foreground" 
                        : "bg-muted hover:bg-muted/80"
                    )}
                  >
                    <div className="flex items-center justify-center gap-1.5">
                      <ServerIcon className="size-3.5" />
                      <span>Hub</span>
                    </div>
                    <div className="text-[10px] opacity-70 mt-0.5">通过 Service Manager</div>
                  </button>
                  <button
                    onClick={() => setNewServerConnectionType('direct')}
                    className={cn(
                      "flex-1 px-3 py-2 rounded-lg text-sm transition-colors",
                      newServerConnectionType === 'direct' 
                        ? "bg-primary text-primary-foreground" 
                        : "bg-muted hover:bg-muted/80"
                    )}
                  >
                    <div className="flex items-center justify-center gap-1.5">
                      <Link2 className="size-3.5" />
                      <span>直连</span>
                    </div>
                    <div className="text-[10px] opacity-70 mt-0.5">直接连接 CLI</div>
                  </button>
                </div>
              </div>
              <div>
                <label className="text-xs text-muted-foreground">名称</label>
                <input
                  type="text"
                  value={newServerName}
                  onChange={e => setNewServerName(e.target.value)}
                  placeholder={newServerConnectionType === 'direct' ? "My CLI" : "My Server"}
                  className="w-full mt-1 px-3 py-2 bg-muted rounded-lg text-sm border-none focus:ring-1 focus:ring-primary"
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">URL</label>
                <input
                  type="text"
                  value={newServerUrl}
                  onChange={e => setNewServerUrl(e.target.value)}
                  placeholder={newServerConnectionType === 'direct' ? "http://localhost:8000" : "http://localhost:7001"}
                  className="w-full mt-1 px-3 py-2 bg-muted rounded-lg text-sm border-none focus:ring-1 focus:ring-primary"
                />
                <p className="text-[10px] text-muted-foreground mt-1">
                  {newServerConnectionType === 'direct' 
                    ? "CLI serve 模式的地址" 
                    : "Service Manager 的地址"}
                </p>
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button onClick={() => { setShowAddServer(false); setNewServerConnectionType('hub') }} className="px-3 py-1.5 text-sm rounded-lg hover:bg-muted">
                  取消
                </button>
                <button onClick={handleAddServer} className="px-3 py-1.5 text-sm rounded-lg bg-primary text-primary-foreground hover:bg-primary/90">
                  添加
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Create Service Dialog */}
      {showCreateService && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setShowCreateService(false)}>
          <div className="bg-popover border border-border rounded-xl p-4 w-80 shadow-xl" onClick={e => e.stopPropagation()}>
            <h3 className="font-semibold mb-3">创建服务</h3>
            <div className="space-y-3">
              <div>
                <label className="text-xs text-muted-foreground">名称</label>
                <input
                  type="text"
                  value={newServiceName}
                  onChange={e => setNewServiceName(e.target.value)}
                  placeholder="my-agent"
                  className="w-full mt-1 px-3 py-2 bg-muted rounded-lg text-sm border-none focus:ring-1 focus:ring-primary"
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">端口</label>
                <input
                  type="number"
                  value={newServicePort}
                  onChange={e => setNewServicePort(e.target.value)}
                  className="w-full mt-1 px-3 py-2 bg-muted rounded-lg text-sm border-none focus:ring-1 focus:ring-primary"
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">工作目录</label>
                <input
                  type="text"
                  value={newServiceDir}
                  onChange={e => setNewServiceDir(e.target.value)}
                  className="w-full mt-1 px-3 py-2 bg-muted rounded-lg text-sm border-none focus:ring-1 focus:ring-primary"
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button onClick={() => setShowCreateService(false)} className="px-3 py-1.5 text-sm rounded-lg hover:bg-muted">
                  取消
                </button>
                <button onClick={handleCreateService} className="px-3 py-1.5 text-sm rounded-lg bg-primary text-primary-foreground hover:bg-primary/90">
                  创建并启动
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </aside>
  )
})

export default UnifiedSidebar
