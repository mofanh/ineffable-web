// ============ Sidebar 头部组件 ============

import React from 'react'
import { Bot, PanelLeft, Sun, Moon } from 'lucide-react'
import { useTheme } from '../../hooks/useTheme'
import { cn } from '../../../utils/cn'
import type { SidebarHeaderProps } from './types'

export function SidebarHeader({ onCollapse }: SidebarHeaderProps) {
  const { theme, toggleTheme } = useTheme()

  return (
    <div className="p-3 border-b border-border/50">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="size-8 rounded-xl bg-primary/10 flex items-center justify-center text-primary">
            <Bot className="size-5" />
          </div>
          <span className="font-semibold text-lg">Ineffable</span>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={toggleTheme}
            className="p-1.5 rounded-lg hover:bg-muted transition-colors text-muted-foreground"
            title={theme === 'dark' ? '浅色模式' : '深色模式'}
          >
            {theme === 'dark' ? <Sun className="size-4" /> : <Moon className="size-4" />}
          </button>
          <button
            onClick={onCollapse}
            className="p-1.5 rounded-lg hover:bg-muted transition-colors text-muted-foreground"
            title="收起侧边栏"
          >
            <PanelLeft className="size-4" />
          </button>
        </div>
      </div>
    </div>
  )
}
