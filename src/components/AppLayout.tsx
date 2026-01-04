import React, { useEffect, useState } from 'react'
import { Outlet, useNavigate, useLocation, Link } from 'react-router-dom'
import { Home, Settings, User, PanelLeft, Bot, Sun, Moon, LogOut, Server } from 'lucide-react'
import { cn } from '../utils/cn'
import { useTheme } from '../hooks/useTheme'

export default function AppLayout() {
  const location = useLocation()
  const { theme, toggleTheme } = useTheme()
  const [isCollapsed, setIsCollapsed] = useState(false)
  const [isMobile, setIsMobile] = useState(false)

  // 响应式处理
  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth < 768)
      if (window.innerWidth < 768) setIsCollapsed(true)
      else setIsCollapsed(false)
    }
    handleResize()
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  return (
    <div className="flex h-screen bg-background text-foreground overflow-hidden font-sans">
      {/* Sidebar */}
      <aside 
        className={cn(
          "flex-none bg-muted/20 border-r border-border/40 flex flex-col transition-all duration-300 ease-in-out",
          isCollapsed ? "w-0 opacity-0 overflow-hidden" : "w-[260px] opacity-100"
        )}
      >
        {/* Sidebar Header - Logo */}
        <div className="p-4 pb-2 space-y-4">
          {/* Logo Area */}
          <div className="flex items-center justify-between px-2">
            <Link to="/" className="flex items-center gap-2.5">
              <div className="size-8 rounded-xl bg-primary/10 flex items-center justify-center text-primary shadow-sm">
                <Bot className="size-5" />
              </div>
              <span className="font-semibold text-lg tracking-tight text-foreground/90">Ineffable</span>
            </Link>
            <button 
              onClick={() => setIsCollapsed(true)}
              className="p-1.5 text-muted-foreground/70 hover:text-foreground hover:bg-muted rounded-lg transition-colors"
              title="收起侧边栏"
            >
              <PanelLeft className="size-4" />
            </button>
          </div>
        </div>

        {/* Navigation */}
        <div className="flex-1 overflow-y-auto px-3 py-2 space-y-6 scrollbar-thin scrollbar-thumb-border/50 scrollbar-track-transparent">
          {/* Main Menu */}
          <div className="space-y-0.5">
            <Link 
              to="/" 
              className={cn(
                "flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-all duration-200",
                location.pathname === '/' 
                  ? "bg-muted text-foreground shadow-sm" 
                  : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"
              )}
            >
              <Home className="size-4" />
              首页
            </Link>
            <Link 
              to="/" 
              className={cn(
                "flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-all duration-200",
                location.pathname.startsWith('/chat') 
                  ? "bg-muted text-foreground shadow-sm" 
                  : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"
              )}
            >
              <Server className="size-4" />
              服务管理
            </Link>
          </div>

          {/* Info */}
          <div className="px-3 text-xs text-muted-foreground/50">
            <p>连接到远程 Service Manager 来管理 AI Agent 服务。</p>
          </div>
        </div>

        {/* User Profile */}
        <div className="p-3 border-t border-border/40 bg-muted/10 relative group">
          {/* Hover Menu */}
          <div className="absolute bottom-full left-3 right-3 mb-2 p-1.5 bg-popover/95 backdrop-blur-sm border border-border/50 rounded-xl shadow-xl opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 transform translate-y-2 group-hover:translate-y-0 z-50">
            <button 
              onClick={toggleTheme}
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

          <button className="w-full flex items-center gap-3 px-2 py-2 rounded-xl hover:bg-background hover:shadow-sm transition-all text-left border border-transparent hover:border-border/40">
            <div className="size-9 rounded-full bg-gradient-to-br from-primary/20 to-primary/10 flex items-center justify-center text-primary ring-2 ring-background">
              <User className="size-4" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium truncate text-foreground">User</div>
              <div className="text-xs text-muted-foreground truncate">Pro Plan</div>
            </div>
            <Settings className="size-4 text-muted-foreground/70" />
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-w-0 bg-background relative">
        {/* Mobile Header / Toggle */}
        {isCollapsed && (
          <div className="absolute top-4 left-4 z-50">
            <button 
              onClick={() => setIsCollapsed(false)}
              className="p-2 bg-card border border-border rounded-lg shadow-sm hover:bg-muted transition-colors"
              title="展开侧边栏"
            >
              <PanelLeft className="size-4 text-muted-foreground" />
            </button>
          </div>
        )}
        
        {!isCollapsed && isMobile && (
           <div className="absolute top-4 right-4 z-50">
            <button 
              onClick={() => setIsCollapsed(true)}
              className="p-2 bg-card border border-border rounded-lg shadow-sm hover:bg-muted transition-colors"
            >
              <PanelLeft className="size-4 text-muted-foreground" />
            </button>
          </div>
        )}

        <Outlet />
      </div>
    </div>
  )
}
