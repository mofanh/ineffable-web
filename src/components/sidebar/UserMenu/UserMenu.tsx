// ============ 用户菜单组件 ============

import React, { useEffect, useState } from 'react'
import { User, Settings, LogOut, Sun, Moon } from 'lucide-react'
import { cn } from '../../../utils/cn'
import { useTheme } from '../../hooks/useTheme'
import type { UserMenuProps } from './types'

export function UserMenu({ 
  theme, 
  onToggleTheme,
  userName = 'User',
  userPlan = 'Pro Plan'
}: UserMenuProps) {
  const [showMenu, setShowMenu] = useState(false)

  // 点击外部关闭菜单
  useEffect(() => {
    if (!showMenu) return
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement
      if (!target.closest('.user-menu-container')) {
        setShowMenu(false)
      }
    }
    document.addEventListener('click', handleClickOutside)
    return () => document.removeEventListener('click', handleClickOutside)
  }, [showMenu])

  return (
    <div className="p-3 border-t border-border/40 bg-muted/10 relative group user-menu-container">
      {/* 下拉菜单 */}
      <div className={cn(
        "absolute bottom-full left-3 right-3 mb-2 p-1.5 bg-popover/95 backdrop-blur-sm border border-border/50 rounded-xl shadow-xl transition-all duration-200 transform z-50",
        showMenu ? "opacity-100 visible translate-y-0" : "opacity-0 invisible translate-y-2"
      )}>
        <button 
          onClick={onToggleTheme}
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

      <button 
        onClick={() => setShowMenu(!showMenu)}
        className="w-full flex items-center gap-3 px-2 py-2 rounded-xl hover:bg-background hover:shadow-sm transition-all text-left border border-transparent hover:border-border/40"
      >
        <div className="size-9 rounded-full bg-linear-to-br from-primary/20 to-primary/10 flex items-center justify-center text-primary ring-2 ring-background">
          <User className="size-4" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium truncate text-foreground">{userName}</div>
          <div className="text-xs text-muted-foreground truncate">{userPlan}</div>
        </div>
        <Settings className="size-4 text-muted-foreground/70" />
      </button>
    </div>
  )
}
