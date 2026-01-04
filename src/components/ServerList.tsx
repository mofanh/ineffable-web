import React, { useState, useEffect } from 'react'
import { Server as ServerIcon, Plus, RefreshCw, Trash2, ExternalLink, Wifi, WifiOff } from 'lucide-react'
import type { Server } from '../types'
import { getServers, addServer, removeServer, refreshServerStatuses } from '../api/servers'

interface Props {
  onServerSelect?: (server: Server) => void
  selectedServerId?: string
}

export default function ServerList({ onServerSelect, selectedServerId }: Props) {
  const [servers, setServers] = useState<Server[]>([])
  const [loading, setLoading] = useState(true)
  const [showAddDialog, setShowAddDialog] = useState(false)
  const [newServerName, setNewServerName] = useState('')
  const [newServerUrl, setNewServerUrl] = useState('')

  useEffect(() => {
    loadServers()
  }, [])

  async function loadServers() {
    setLoading(true)
    try {
      const updated = await refreshServerStatuses()
      setServers(updated)
    } catch (err) {
      console.error('Failed to load servers:', err)
      setServers(getServers())
    } finally {
      setLoading(false)
    }
  }

  async function handleRefresh() {
    await loadServers()
  }

  function handleAdd() {
    if (!newServerName.trim() || !newServerUrl.trim()) return

    const server = addServer(newServerName.trim(), newServerUrl.trim())
    setServers([...servers, server])
    setNewServerName('')
    setNewServerUrl('')
    setShowAddDialog(false)
    
    // 异步刷新状态
    loadServers()
  }

  function handleRemove(id: string, e: React.MouseEvent) {
    e.stopPropagation()
    if (!confirm('确定要删除这个服务器吗？')) return
    
    removeServer(id)
    setServers(servers.filter(s => s.id !== id))
  }

  return (
    <div className="flex flex-col h-full">
      {/* 头部 */}
      <div className="flex items-center justify-between p-4 border-b border-border">
        <div className="flex items-center gap-2">
          <ServerIcon className="size-5 text-primary" />
          <h2 className="font-semibold">服务器</h2>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={handleRefresh}
            className="p-2 rounded-md hover:bg-muted transition-colors"
            title="刷新状态"
            disabled={loading}
          >
            <RefreshCw className={`size-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
          <button
            onClick={() => setShowAddDialog(true)}
            className="p-2 rounded-md hover:bg-muted transition-colors text-primary"
            title="添加服务器"
          >
            <Plus className="size-4" />
          </button>
        </div>
      </div>

      {/* 服务器列表 */}
      <div className="flex-1 overflow-y-auto">
        {servers.length === 0 ? (
          <div className="p-4 text-center text-muted-foreground">
            <p className="text-sm">暂无服务器</p>
            <button
              onClick={() => setShowAddDialog(true)}
              className="mt-2 text-primary text-sm hover:underline"
            >
              + 添加服务器
            </button>
          </div>
        ) : (
          <ul className="divide-y divide-border">
            {servers.map(server => (
              <li
                key={server.id}
                onClick={() => onServerSelect?.(server)}
                className={`
                  flex items-center gap-3 p-3 cursor-pointer transition-colors
                  hover:bg-muted/50
                  ${selectedServerId === server.id ? 'bg-primary/10 border-l-2 border-primary' : ''}
                `}
              >
                {/* 状态指示器 */}
                <div className="flex-shrink-0">
                  {server.status === 'online' ? (
                    <Wifi className="size-4 text-success" />
                  ) : server.status === 'offline' ? (
                    <WifiOff className="size-4 text-destructive" />
                  ) : (
                    <div className="size-4 rounded-full bg-muted animate-pulse" />
                  )}
                </div>

                {/* 服务器信息 */}
                <div className="flex-1 min-w-0">
                  <div className="font-medium truncate">{server.name}</div>
                  <div className="text-xs text-muted-foreground truncate">{server.url}</div>
                  {server.serviceCount !== undefined && (
                    <div className="text-xs text-muted-foreground">
                      {server.serviceCount} 个服务
                    </div>
                  )}
                </div>

                {/* 操作按钮 */}
                <div className="flex items-center gap-1">
                  <a
                    href={server.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={e => e.stopPropagation()}
                    className="p-1.5 rounded hover:bg-muted transition-colors"
                    title="在新窗口打开"
                  >
                    <ExternalLink className="size-3.5 text-muted-foreground" />
                  </a>
                  <button
                    onClick={(e) => handleRemove(server.id, e)}
                    className="p-1.5 rounded hover:bg-destructive/10 transition-colors"
                    title="删除"
                  >
                    <Trash2 className="size-3.5 text-destructive" />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* 添加服务器对话框 */}
      {showAddDialog && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-card rounded-lg shadow-xl w-full max-w-md p-6 m-4">
            <h3 className="text-lg font-semibold mb-4">添加服务器</h3>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">名称</label>
                <input
                  type="text"
                  value={newServerName}
                  onChange={e => setNewServerName(e.target.value)}
                  placeholder="例如：本地开发"
                  className="w-full px-3 py-2 rounded-md border border-border bg-background focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium mb-1">地址</label>
                <input
                  type="text"
                  value={newServerUrl}
                  onChange={e => setNewServerUrl(e.target.value)}
                  placeholder="例如：http://localhost:7000"
                  className="w-full px-3 py-2 rounded-md border border-border bg-background focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 mt-6">
              <button
                onClick={() => setShowAddDialog(false)}
                className="px-4 py-2 rounded-md border border-border hover:bg-muted transition-colors"
              >
                取消
              </button>
              <button
                onClick={handleAdd}
                disabled={!newServerName.trim() || !newServerUrl.trim()}
                className="px-4 py-2 rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
              >
                添加
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
