import React, { useEffect, useState } from 'react'
import { Outlet, useNavigate, useLocation, Link } from 'react-router-dom'
import { Plus, MessageSquare, Home, Settings, User, PanelLeft, Bot, MoreHorizontal, History, Sun, Moon, LogOut } from 'lucide-react'
import { cn } from '../utils/cn'
import { getAgents, RegisteredAgent, getStatus } from '../api'
import CreateAgentDialog from './CreateAgentDialog'
import { useTheme } from '../hooks/useTheme'

// 简单的 Agent 类型定义，用于侧边栏列表
interface SidebarAgent {
  id: string
  name: string
  description: string
  lastActivity: number
}

export default function AppLayout() {
  const navigate = useNavigate()
  const location = useLocation()
  const { theme, toggleTheme } = useTheme()
  const [agents, setAgents] = useState<SidebarAgent[]>([])
  const [showCreateDialog, setShowCreateDialog] = useState(false)
  const [isCollapsed, setIsCollapsed] = useState(false)
  const [isMobile, setIsMobile] = useState(false)

  // 加载智能体列表
  async function loadAgents() {
    try {
      const list = await getAgents()
      if (list && list.length > 0) {
        setAgents(list.map(a => ({
          id: a.id,
          name: a.name,
          description: a.description,
          lastActivity: a.last_activity
        })).sort((a, b) => b.lastActivity - a.lastActivity))
      } else {
        // 如果没有 Hub 智能体，检查本地状态
        try {
          const status = await getStatus()
          if (status.data?.session_id) {
            setAgents([{
              id: 'local',
              name: '本地智能体',
              description: 'Local Agent',
              lastActivity: Date.now() / 1000
            }])
          }
        } catch (_) {}
      }
    } catch (e) {
      console.error('Failed to load agents', e)
    }
  }

  useEffect(() => {
    loadAgents()
    const interval = setInterval(loadAgents, 10000)
    return () => clearInterval(interval)
  }, [])

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
        {/* Sidebar Header - Logo & New Chat */}
        <div className="p-4 pb-2 space-y-4">
          {/* Logo Area */}
          <div className="flex items-center justify-between px-2">
            <div className="flex items-center gap-2.5">
              <div className="size-8 rounded-xl bg-primary/10 flex items-center justify-center text-primary shadow-sm">
                <Bot className="size-5" />
              </div>
              <span className="font-semibold text-lg tracking-tight text-foreground/90">Ineffable</span>
            </div>
            <button 
              onClick={() => setIsCollapsed(true)}
              className="p-1.5 text-muted-foreground/70 hover:text-foreground hover:bg-muted rounded-lg transition-colors"
              title="收起侧边栏"
            >
              <PanelLeft className="size-4" />
            </button>
          </div>

          {/* New Agent Button */}
          <button 
            onClick={() => setShowCreateDialog(true)}
            className="w-full flex items-center gap-2 px-4 py-2.5 bg-primary text-primary-foreground rounded-xl hover:bg-primary/90 transition-all shadow-sm hover:shadow-md group"
          >
            <Plus className="size-4 transition-transform group-hover:rotate-90" />
            <span className="text-sm font-medium">新建智能体</span>
          </button>
        </div>

        {/* Navigation & Lists */}
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
            <button className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium text-muted-foreground hover:bg-muted/50 hover:text-foreground transition-all duration-200 text-left">
              <Bot className="size-4" />
              应用生成
            </button>
          </div>

          {/* Agents List (History) */}
          <div>
            <div className="px-3 mb-2 text-xs font-medium text-muted-foreground/60 uppercase tracking-wider flex items-center justify-between">
              <span>智能体列表</span>
              <span className="text-[10px] bg-muted px-1.5 py-0.5 rounded-full">{agents.length}</span>
            </div>
            <div className="space-y-0.5">
              {agents.map(agent => (
                <Link
                  key={agent.id}
                  to={`/agent/${agent.id}`}
                  className={cn(
                    "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-all duration-200 group relative overflow-hidden",
                    location.pathname === `/agent/${agent.id}`
                      ? "bg-muted text-foreground shadow-sm font-medium"
                      : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"
                  )}
                >
                  <div className={cn(
                    "size-1.5 rounded-full transition-colors",
                    location.pathname === `/agent/${agent.id}` ? "bg-primary" : "bg-transparent group-hover:bg-muted-foreground/30"
                  )} />
                  <MessageSquare className={cn(
                    "size-4 flex-none transition-colors",
                    location.pathname === `/agent/${agent.id}` ? "text-primary" : "text-muted-foreground/70"
                  )} />
                  <span className="truncate flex-1">{agent.name}</span>
                  
                  {/* Hover Actions (Optional) */}
                  <MoreHorizontal className="size-3.5 opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground" />
                </Link>
              ))}
              {agents.length === 0 && (
                <div className="px-3 py-4 text-xs text-muted-foreground/50 text-center border border-dashed border-border/50 rounded-lg mx-2">
                  暂无智能体
                </div>
              )}
            </div>
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

        <Outlet context={{ refreshAgents: loadAgents }} />
      </div>

      <CreateAgentDialog 
        open={showCreateDialog} 
        onClose={() => setShowCreateDialog(false)}
        onCreated={() => {
          loadAgents()
          setShowCreateDialog(false)
        }}
      />
    </div>
  )
}
