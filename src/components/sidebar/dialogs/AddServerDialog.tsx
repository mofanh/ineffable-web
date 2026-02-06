// ============ 添加服务器对话框组件 ============

import React, { useState } from 'react'
import { Server as ServerIcon, Link2, X } from 'lucide-react'
import { cn } from '../../../utils/cn'
import type { AddServerDialogProps, AddServerFormData } from './types'
import type { ConnectionType } from '../../../types'

export function AddServerDialog({ 
  isOpen, 
  onClose, 
  onAddServer,
  initialConnectionType = 'hub'
}: AddServerDialogProps) {
  const [connectionType, setConnectionType] = useState<ConnectionType>(initialConnectionType)
  const [name, setName] = useState('')
  const [url, setUrl] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (!isOpen) return null

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim() || !url.trim()) return
    setError(null)
    setIsSubmitting(true)
    try {
      await onAddServer({ name, url, connectionType })
      setName('')
      setUrl('')
      setConnectionType('hub')
      onClose()
    } catch (err) {
      console.error('Failed to add server:', err)
      setError((err as Error).message || '无法添加服务器，请检查地址是否正确')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div 
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
      onClick={onClose}
    >
      <div 
        className="bg-popover border border-border rounded-xl p-4 w-80 shadow-xl"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold">添加服务器</h3>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-muted">
            <X className="size-4" />
          </button>
        </div>
        
        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label className="text-xs text-muted-foreground">连接类型</label>
            <div className="flex gap-2 mt-1">
              <button
                type="button"
                onClick={() => setConnectionType('hub')}
                className={cn(
                  "flex-1 px-3 py-2 rounded-lg text-sm transition-colors",
                  connectionType === 'hub' 
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
                type="button"
                onClick={() => setConnectionType('direct')}
                className={cn(
                  "flex-1 px-3 py-2 rounded-lg text-sm transition-colors",
                  connectionType === 'direct' 
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
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder={connectionType === 'direct' ? "My CLI" : "My Server"}
              className="w-full mt-1 px-3 py-2 bg-muted rounded-lg text-sm border-none focus:ring-1 focus:ring-primary"
            />
          </div>
          
          <div>
            <label className="text-xs text-muted-foreground">URL</label>
            <input
              type="text"
              value={url}
              onChange={e => setUrl(e.target.value)}
              placeholder={connectionType === 'direct' ? "http://localhost:8000" : "http://localhost:7001"}
              className="w-full mt-1 px-3 py-2 bg-muted rounded-lg text-sm border-none focus:ring-1 focus:ring-primary"
            />
            <p className="text-[10px] text-muted-foreground mt-1">
              {connectionType === 'direct' 
                ? "CLI serve 模式的地址" 
                : "Service Manager 的地址"}
            </p>
            {error && (
              <p className="text-[11px] text-destructive mt-1">{error}</p>
            )}
          </div>
          
          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => { onClose(); setConnectionType('hub') }}
              className="px-3 py-1.5 text-sm rounded-lg hover:bg-muted"
            >
              取消
            </button>
            <button
              type="submit"
              disabled={isSubmitting || !name.trim() || !url.trim()}
              className="px-3 py-1.5 text-sm rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            >
              添加
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
