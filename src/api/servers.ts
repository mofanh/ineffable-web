/**
 * Server API - 管理 Service Manager 连接
 * Server 信息存储在 localStorage 中
 */

import type { Server } from '../types'

const SERVERS_KEY = 'ineffable_servers'

/**
 * 获取所有 Server
 */
export function getServers(): Server[] {
  try {
    const data = localStorage.getItem(SERVERS_KEY)
    return data ? JSON.parse(data) : []
  } catch {
    return []
  }
}

/**
 * 保存 Server 列表
 */
function saveServers(servers: Server[]): void {
  localStorage.setItem(SERVERS_KEY, JSON.stringify(servers))
}

/**
 * 添加 Server
 */
export function addServer(name: string, url: string): Server {
  const servers = getServers()
  
  // 移除末尾斜杠
  const normalizedUrl = url.replace(/\/+$/, '')
  
  const newServer: Server = {
    id: crypto.randomUUID(),
    name,
    url: normalizedUrl,
    status: 'unknown',
  }
  
  servers.push(newServer)
  saveServers(servers)
  
  return newServer
}

/**
 * 更新 Server
 */
export function updateServer(id: string, updates: Partial<Pick<Server, 'name' | 'url'>>): Server | null {
  const servers = getServers()
  const index = servers.findIndex(s => s.id === id)
  
  if (index === -1) return null
  
  if (updates.url) {
    updates.url = updates.url.replace(/\/+$/, '')
  }
  
  servers[index] = { ...servers[index], ...updates }
  saveServers(servers)
  
  return servers[index]
}

/**
 * 删除 Server
 */
export function removeServer(id: string): boolean {
  const servers = getServers()
  const filtered = servers.filter(s => s.id !== id)
  
  if (filtered.length === servers.length) return false
  
  saveServers(filtered)
  return true
}

/**
 * 获取单个 Server
 */
export function getServer(id: string): Server | undefined {
  return getServers().find(s => s.id === id)
}

/**
 * 检查 Server 健康状态
 */
export async function checkServerHealth(serverUrl: string): Promise<{ online: boolean; serviceCount?: number }> {
  try {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 5000)
    
    const res = await fetch(`${serverUrl}/api/health`, {
      method: 'GET',
      signal: controller.signal,
    })
    
    clearTimeout(timeoutId)
    
    if (!res.ok) {
      return { online: false }
    }
    
    const data = await res.json()
    return {
      online: true,
      serviceCount: data.service_count,
    }
  } catch {
    return { online: false }
  }
}

/**
 * 刷新所有 Server 状态
 */
export async function refreshServerStatuses(): Promise<Server[]> {
  const servers = getServers()
  
  const updated = await Promise.all(
    servers.map(async (server) => {
      const health = await checkServerHealth(server.url)
      return {
        ...server,
        status: health.online ? 'online' : 'offline',
        serviceCount: health.serviceCount,
      } as Server
    })
  )
  
  saveServers(updated)
  return updated
}

/**
 * 检查单个 Server 状态并更新
 */
export async function refreshServerStatus(id: string): Promise<Server | null> {
  const servers = getServers()
  const index = servers.findIndex(s => s.id === id)
  
  if (index === -1) return null
  
  const health = await checkServerHealth(servers[index].url)
  servers[index] = {
    ...servers[index],
    status: health.online ? 'online' : 'offline',
    serviceCount: health.serviceCount,
  }
  
  saveServers(servers)
  return servers[index]
}
