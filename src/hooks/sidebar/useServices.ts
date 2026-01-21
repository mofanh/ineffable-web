// ============ 服务列表管理 Hook ============

import { useState, useCallback, useEffect } from 'react'
import type { Server, Service } from '../../types'
import { listServices, startService, stopService, createService } from '../../api/services'

interface ServiceWithSessions extends Service {
  expanded: boolean
  loadingSessions: boolean
  sessions: import('@/types').Session[]
}

interface UseServicesOptions {
  selectedServer: Server | null
}

interface UseServicesReturn {
  services: ServiceWithSessions[]
  loadingServices: boolean
  showCreateService: boolean
  setShowCreateService: (show: boolean) => void
  loadServices: () => Promise<void>
  toggleServiceExpand: (serviceId: string) => void
  loadSessionsForService: (serviceId: string) => Promise<void>
  handleStartService: (serviceId: string, e: React.MouseEvent) => Promise<void>
  handleStopService: (serviceId: string, e: React.MouseEvent) => Promise<void>
  handleCreateService: (data: CreateServiceFormData) => Promise<void>
}

interface CreateServiceFormData {
  name: string
  port: string
  workingDir: string
}

function sortSessionsStable(sessions: import('@/types').Session[]): import('@/types').Session[] {
  return [...sessions].sort((a, b) => {
    const parseCreatedAtMs = (s: import('@/types').Session): number | null => {
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

export function useServices(options: UseServicesOptions): UseServicesReturn {
  const { selectedServer } = options
  
  const [services, setServices] = useState<ServiceWithSessions[]>([])
  const [loadingServices, setLoadingServices] = useState(false)
  const [showCreateService, setShowCreateService] = useState(false)

  // 加载服务列表
  const loadServices = useCallback(async () => {
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
  }, [selectedServer])

  // 当选择服务器后加载服务
  useEffect(() => {
    if (selectedServer?.status === 'online' && selectedServer?.connectionType !== 'direct') {
      loadServices()
    } else {
      setServices([])
    }
  }, [selectedServer?.id, selectedServer?.status, selectedServer?.connectionType, loadServices])

  // 加载指定服务的会话
  const loadSessionsForService = useCallback(async (serviceId: string) => {
    if (!selectedServer) return
    const service = services.find(s => s.id === serviceId)
    if (!service || service.status !== 'running') return

    // 标记为加载中
    setServices(prev => prev.map(s => 
      s.id === serviceId ? { ...s, loadingSessions: true } : s
    ))

    try {
      const { listSessions, buildServiceUrl } = await import('../../api/services')
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
  }, [selectedServer, services])

  // 切换服务展开状态
  const toggleServiceExpand = useCallback((serviceId: string) => {
    const service = services.find(s => s.id === serviceId)
    if (!service) return

    if (service.expanded) {
      setServices(prev => prev.map(s => 
        s.id === serviceId ? { ...s, expanded: false } : s
      ))
    } else {
      loadSessionsForService(serviceId)
    }
  }, [services, loadSessionsForService])

  // 启动服务
  const handleStartService = useCallback(async (serviceId: string, e: React.MouseEvent) => {
    e.stopPropagation()
    if (!selectedServer) return
    try {
      await startService(selectedServer.url, serviceId)
      await loadServices()
    } catch (err) {
      throw err
    }
  }, [selectedServer, loadServices])

  // 停止服务
  const handleStopService = useCallback(async (serviceId: string, e: React.MouseEvent) => {
    e.stopPropagation()
    if (!selectedServer) return
    try {
      await stopService(selectedServer.url, serviceId)
      await loadServices()
    } catch (err) {
      throw err
    }
  }, [selectedServer, loadServices])

  // 创建服务
  const handleCreateService = useCallback(async (data: CreateServiceFormData) => {
    if (!selectedServer) {
      throw new Error('请先选择一个服务器')
    }
    if (!data.name.trim()) {
      throw new Error('请输入服务名称')
    }
    
    const service = await createService(selectedServer.url, {
      name: data.name.trim(),
      port: parseInt(data.port),
      working_dir: data.workingDir.trim(),
      auto_start: true,
    })
    
    setShowCreateService(false)
    await loadServices()
    
    return service
  }, [selectedServer, loadServices])

  return {
    services,
    loadingServices,
    showCreateService,
    setShowCreateService,
    loadServices,
    toggleServiceExpand,
    loadSessionsForService,
    handleStartService,
    handleStopService,
    handleCreateService,
  }
}
