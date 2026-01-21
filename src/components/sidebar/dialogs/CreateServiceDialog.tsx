// ============ 创建服务对话框组件 ============

import React, { useState } from 'react'
import { X } from 'lucide-react'
import type { CreateServiceFormData, CreateServiceDialogProps } from './types'

export function CreateServiceDialog({ isOpen, onClose, onSubmit }: CreateServiceDialogProps) {
  const [name, setName] = useState('')
  const [port, setPort] = useState('8080')
  const [workingDir, setWorkingDir] = useState('/tmp')
  const [isSubmitting, setIsSubmitting] = useState(false)

  if (!isOpen) return null

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) return
    
    setIsSubmitting(true)
    try {
      await onSubmit({ name, port, workingDir })
      setName('')
      setPort('8080')
      setWorkingDir('/tmp')
      onClose()
    } catch (err) {
      console.error('Failed to create service:', err)
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
          <h3 className="font-semibold">创建服务</h3>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-muted">
            <X className="size-4" />
          </button>
        </div>
        
        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label className="text-xs text-muted-foreground">名称</label>
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="my-agent"
              className="w-full mt-1 px-3 py-2 bg-muted rounded-lg text-sm border-none focus:ring-1 focus:ring-primary"
            />
          </div>
          
          <div>
            <label className="text-xs text-muted-foreground">端口</label>
            <input
              type="number"
              value={port}
              onChange={e => setPort(e.target.value)}
              className="w-full mt-1 px-3 py-2 bg-muted rounded-lg text-sm border-none focus:ring-1 focus:ring-primary"
            />
          </div>
          
          <div>
            <label className="text-xs text-muted-foreground">工作目录</label>
            <input
              type="text"
              value={workingDir}
              onChange={e => setWorkingDir(e.target.value)}
              className="w-full mt-1 px-3 py-2 bg-muted rounded-lg text-sm border-none focus:ring-1 focus:ring-primary"
            />
          </div>
          
          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1.5 text-sm rounded-lg hover:bg-muted"
            >
              取消
            </button>
            <button
              type="submit"
              disabled={isSubmitting || !name.trim()}
              className="px-3 py-1.5 text-sm rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            >
              创建并启动
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
