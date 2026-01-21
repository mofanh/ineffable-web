// ============ 会话列表项组件 ============

import React, { useEffect, useRef } from 'react'
import { MessageSquare, MoreHorizontal, Pencil, Trash } from 'lucide-react'
import { cn } from '../../../utils/cn'
import type { SessionListItemProps } from './types'

export function SessionListItem({
  session,
  mode,
  isSelected,
  isRunning,
  isMenuOpen,
  onClick,
  onMenuClick,
  onRename,
  onDelete,
}: SessionListItemProps) {
  const menuRef = useRef<HTMLDivElement>(null)

  // 点击外部关闭菜单
  useEffect(() => {
    if (!isMenuOpen) return

    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onMenuClick(e as unknown as React.MouseEvent)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [isMenuOpen, onMenuClick])

  return (
    <div
      className={cn(
        "w-full flex items-center gap-1 px-2 py-1.5 rounded-lg text-left transition-colors group/session relative",
        isSelected
          ? "bg-primary/10 text-primary"
          : "hover:bg-muted text-muted-foreground hover:text-foreground"
      )}
      ref={menuRef}
    >
      <button
        onClick={onClick}
        className="flex items-center gap-2 flex-1 min-w-0"
      >
        <MessageSquare className={cn("shrink-0", mode === 'direct' ? "size-3.5" : "size-3")} />
        <span className={cn(
          "truncate flex-1",
          mode === 'direct' ? "text-sm" : "text-xs",
          isRunning && "text-primary animate-pulse"
        )}>
          {session.name || `会话 ${session.id.slice(0, 8)}`}
        </span>
      </button>
      
      {/* 三个点菜单按钮 - 移动端始终可见 */}
      <button
        onClick={onMenuClick}
        disabled={isRunning}
        className={cn(
          "p-0.5 rounded transition-all session-menu-button",
          isRunning
            ? "opacity-40 cursor-not-allowed"
            : "opacity-100 md:opacity-0 md:group-hover/session:opacity-100 hover:bg-muted"
        )}
        title="更多操作"
      >
        <MoreHorizontal className={cn("size-3.5", mode === 'direct' && "size-4")} />
      </button>
      
      {/* 下拉菜单 */}
      {isMenuOpen && (
        <div className="absolute right-0 top-full mt-1 bg-popover border border-border rounded-lg shadow-lg z-50 py-1 min-w-24 session-menu-container">
          <button
            onClick={(e) => {
              onMenuClick(e as unknown as React.MouseEvent)
              onRename(e as unknown as React.MouseEvent)
            }}
            className="w-full flex items-center gap-2 px-3 py-1.5 text-xs hover:bg-muted transition-colors"
          >
            <Pencil className="size-3" />
            重命名
          </button>
          <button
            onClick={(e) => {
              onMenuClick(e as unknown as React.MouseEvent)
              if (isRunning) return
              onDelete(e as unknown as React.MouseEvent)
            }}
            disabled={isRunning}
            className={cn(
              "w-full flex items-center gap-2 px-3 py-1.5 text-xs transition-colors",
              isRunning
                ? "opacity-50 cursor-not-allowed"
                : "hover:bg-destructive/10 hover:text-destructive"
            )}
          >
            <Trash className="size-3" />
            删除
          </button>
        </div>
      )}
    </div>
  )
}
