// ============ 服务器状态管理 Hook ============

import { useState, useEffect, useCallback } from 'react'
import type { Server, ConnectionType } from '../../types'
import { 
  getServers, 
  addServer as addServerApi, 
  refreshServerStatuses 
} from '../../api/servers'

interface UseServersOptions {
  initialServerId?: string
  onServerSelect?: (server: Server) => void
}

interface UseServersReturn {
  servers: Server[]
  selectedServer: Server | null
  loadingServers: boolean
  showServerDropdown: boolean
  setShowServerDropdown: (show: boolean) => void
  loadServers: () => Promise<void>
  selectServer: (server: Server) => void
  addServer: (name: string, url: string, connectionType: ConnectionType) => Promise<void>
}

export function useServers(options: UseServersOptions = {}): UseServersReturn {
  const { initialServerId, onServerSelect } = options
  
  const [servers, setServers] = useState<Server[]>([])
  const [selectedServer, setSelectedServer] = useState<Server | null>(null)
  const [loadingServers, setLoadingServers] = useState(true)
  const [showServerDropdown, setShowServerDropdown] = useState(false)
  const [urlInitialized, setUrlInitialized] = useState(false)

  // 加载服务器列表
  const loadServers = useCallback(async () => {
    setLoadingServers(true)
    try {
      const updated = await refreshServerStatuses()
      setServers(updated)
      
      // 如果有 URL 参数，优先使用 URL 中的服务器
      if (initialServerId && !urlInitialized) {
        const fromUrl = updated.find(s => s.id === initialServerId)
        if (fromUrl) {
          setSelectedServer(fromUrl)
          setUrlInitialized(true)
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
  }, [initialServerId, urlInitialized, selectedServer])

  // 初始化加载
  useEffect(() => {
    loadServers()
  }, [])

  // 选择服务器
  const selectServer = useCallback((server: Server) => {
    setSelectedServer(server)
    setShowServerDropdown(false)
    onServerSelect?.(server)
  }, [onServerSelect])

  // 添加服务器
  const addServer = useCallback(async (name: string, url: string, connectionType: ConnectionType) => {
    const server = addServerApi(name, url, connectionType)
    setServers(prev => [...prev, server])
    await loadServers()
  }, [loadServers])

  return {
    servers,
    selectedServer,
    loadingServers,
    showServerDropdown,
    setShowServerDropdown,
    loadServers,
    selectServer,
    addServer,
  }
}
