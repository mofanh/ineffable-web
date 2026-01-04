import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Bot, Plus, Play, Square, RotateCw, Trash2, MessageSquare, RefreshCw, FolderOpen } from 'lucide-react'
import type { Server, Service } from '../types'
import { listServices, startService, stopService, deleteService, createService } from '../api/services'

interface Props {
  server: Server
}

export default function ServiceList({ server }: Props) {
  const navigate = useNavigate()
  const [services, setServices] = useState<Service[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showCreateDialog, setShowCreateDialog] = useState(false)
  const [actionLoading, setActionLoading] = useState<string | null>(null)

  // 创建表单状态
  const [newName, setNewName] = useState('')
  const [newPort, setNewPort] = useState('8080')
  const [newWorkingDir, setNewWorkingDir] = useState('/tmp')
  const [newAutoStart, setNewAutoStart] = useState(false)

  useEffect(() => {
    loadServices()
  }, [server.id])

  async function loadServices() {
    if (server.status !== 'online') {
      setServices([])
      setLoading(false)
      setError('服务器离线')
      return
    }

    setLoading(true)
    setError(null)
    
    try {
      const list = await listServices(server.url)
      setServices(list.map(s => ({ ...s, serverId: server.id, serverUrl: server.url })))
    } catch (err) {
      console.error('Failed to load services:', err)
      setError((err as Error).message)
      setServices([])
    } finally {
      setLoading(false)
    }
  }

  async function handleStart(serviceId: string) {
    setActionLoading(serviceId)
    try {
      await startService(server.url, serviceId)
      await loadServices()
    } catch (err) {
      alert(`启动失败: ${(err as Error).message}`)
    } finally {
      setActionLoading(null)
    }
  }

  async function handleStop(serviceId: string) {
    setActionLoading(serviceId)
    try {
      await stopService(server.url, serviceId)
      await loadServices()
    } catch (err) {
      alert(`停止失败: ${(err as Error).message}`)
    } finally {
      setActionLoading(null)
    }
  }

  async function handleDelete(serviceId: string) {
    if (!confirm('确定要删除这个服务吗？')) return

    setActionLoading(serviceId)
    try {
      await deleteService(server.url, serviceId)
      setServices(services.filter(s => s.id !== serviceId))
    } catch (err) {
      alert(`删除失败: ${(err as Error).message}`)
    } finally {
      setActionLoading(null)
    }
  }

  async function handleCreate() {
    if (!newName.trim() || !newPort || !newWorkingDir.trim()) return

    try {
      const service = await createService(server.url, {
        name: newName.trim(),
        port: parseInt(newPort),
        working_dir: newWorkingDir.trim(),
        auto_start: newAutoStart,
      })
      
      setServices([...services, { ...service, serverId: server.id, serverUrl: server.url }])
      setShowCreateDialog(false)
      resetForm()
      
      // 如果 auto_start，刷新列表获取最新状态
      if (newAutoStart) {
        setTimeout(loadServices, 1000)
      }
    } catch (err) {
      alert(`创建失败: ${(err as Error).message}`)
    }
  }

  function resetForm() {
    setNewName('')
    setNewPort('8080')
    setNewWorkingDir('/tmp')
    setNewAutoStart(false)
  }

  function handleChat(service: Service) {
    // 跳转到聊天页面
    navigate(`/chat/${server.id}/${service.id}`)
  }

  function getStatusColor(status: string) {
    switch (status) {
      case 'running': return 'bg-success'
      case 'stopped': return 'bg-muted-foreground'
      case 'starting': return 'bg-warning animate-pulse'
      case 'failed': return 'bg-destructive'
      default: return 'bg-muted'
    }
  }

  function getStatusText(status: string) {
    switch (status) {
      case 'running': return '运行中'
      case 'stopped': return '已停止'
      case 'starting': return '启动中'
      case 'failed': return '失败'
      default: return status
    }
  }

  return (
    <div className="h-full flex flex-col">
      {/* 头部 */}
      <div className="flex items-center justify-between p-4 border-b border-border">
        <div className="flex items-center gap-2">
          <Bot className="size-5 text-primary" />
          <h2 className="font-semibold">{server.name} - 服务列表</h2>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={loadServices}
            disabled={loading || server.status !== 'online'}
            className="p-2 rounded-md hover:bg-muted transition-colors disabled:opacity-50"
            title="刷新"
          >
            <RefreshCw className={`size-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
          <button
            onClick={() => setShowCreateDialog(true)}
            disabled={server.status !== 'online'}
            className="flex items-center gap-1 px-3 py-1.5 rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50 text-sm"
          >
            <Plus className="size-4" />
            新建服务
          </button>
        </div>
      </div>

      {/* 服务列表 */}
      <div className="flex-1 overflow-y-auto p-4">
        {loading ? (
          <div className="flex items-center justify-center h-32">
            <RefreshCw className="size-6 animate-spin text-muted-foreground" />
          </div>
        ) : error ? (
          <div className="text-center text-destructive py-8">
            <p>{error}</p>
            {server.status === 'online' && (
              <button onClick={loadServices} className="mt-2 text-sm text-primary hover:underline">
                重试
              </button>
            )}
          </div>
        ) : services.length === 0 ? (
          <div className="text-center text-muted-foreground py-8">
            <Bot className="size-12 mx-auto mb-4 opacity-50" />
            <p>暂无服务</p>
            <button
              onClick={() => setShowCreateDialog(true)}
              className="mt-2 text-primary hover:underline"
            >
              创建第一个服务
            </button>
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {services.map(service => (
              <div
                key={service.id}
                className="p-4 rounded-lg border border-border bg-card hover:shadow-md transition-shadow"
              >
                {/* 服务头部 */}
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <div className={`size-2.5 rounded-full ${getStatusColor(service.status)}`} />
                    <h3 className="font-medium">{service.name}</h3>
                  </div>
                  <span className="text-xs px-2 py-0.5 rounded-full bg-muted">
                    :{service.port}
                  </span>
                </div>

                {/* 服务信息 */}
                <div className="space-y-1 text-sm text-muted-foreground mb-4">
                  <div className="flex items-center gap-1">
                    <FolderOpen className="size-3.5" />
                    <span className="truncate" title={service.workingDir}>{service.workingDir}</span>
                  </div>
                  <div>
                    状态: {getStatusText(service.status)}
                    {service.pid && <span className="ml-1 text-xs">(PID: {service.pid})</span>}
                  </div>
                </div>

                {/* 操作按钮 */}
                <div className="flex items-center gap-2">
                  {service.status === 'running' ? (
                    <>
                      <button
                        onClick={() => handleChat(service)}
                        className="flex-1 flex items-center justify-center gap-1 px-3 py-1.5 rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors text-sm"
                      >
                        <MessageSquare className="size-3.5" />
                        对话
                      </button>
                      <button
                        onClick={() => handleStop(service.id)}
                        disabled={actionLoading === service.id}
                        className="p-1.5 rounded-md hover:bg-muted transition-colors disabled:opacity-50"
                        title="停止"
                      >
                        <Square className="size-4 text-destructive" />
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        onClick={() => handleStart(service.id)}
                        disabled={actionLoading === service.id}
                        className="flex-1 flex items-center justify-center gap-1 px-3 py-1.5 rounded-md bg-success/10 text-success hover:bg-success/20 transition-colors text-sm disabled:opacity-50"
                      >
                        <Play className="size-3.5" />
                        启动
                      </button>
                      <button
                        onClick={() => handleDelete(service.id)}
                        disabled={actionLoading === service.id}
                        className="p-1.5 rounded-md hover:bg-destructive/10 transition-colors disabled:opacity-50"
                        title="删除"
                      >
                        <Trash2 className="size-4 text-destructive" />
                      </button>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 创建服务对话框 */}
      {showCreateDialog && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-card rounded-lg shadow-xl w-full max-w-md p-6 m-4">
            <h3 className="text-lg font-semibold mb-4">创建服务</h3>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">服务名称</label>
                <input
                  type="text"
                  value={newName}
                  onChange={e => setNewName(e.target.value)}
                  placeholder="例如：my-agent"
                  className="w-full px-3 py-2 rounded-md border border-border bg-background focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium mb-1">端口</label>
                <input
                  type="number"
                  value={newPort}
                  onChange={e => setNewPort(e.target.value)}
                  placeholder="8080"
                  min="1024"
                  max="65535"
                  className="w-full px-3 py-2 rounded-md border border-border bg-background focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium mb-1">工作目录</label>
                <input
                  type="text"
                  value={newWorkingDir}
                  onChange={e => setNewWorkingDir(e.target.value)}
                  placeholder="/path/to/project"
                  className="w-full px-3 py-2 rounded-md border border-border bg-background focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="autoStart"
                  checked={newAutoStart}
                  onChange={e => setNewAutoStart(e.target.checked)}
                  className="rounded"
                />
                <label htmlFor="autoStart" className="text-sm">创建后自动启动</label>
              </div>
            </div>

            <div className="flex justify-end gap-2 mt-6">
              <button
                onClick={() => {
                  setShowCreateDialog(false)
                  resetForm()
                }}
                className="px-4 py-2 rounded-md border border-border hover:bg-muted transition-colors"
              >
                取消
              </button>
              <button
                onClick={handleCreate}
                disabled={!newName.trim() || !newPort || !newWorkingDir.trim()}
                className="px-4 py-2 rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
              >
                创建
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
