/**
 * 响应式设计使用示例
 */

import { useBreakpoint } from '../hooks/useResponsive'

// 示例 1: 在组件中使用断点
export function ResponsiveComponent() {
  const { isMobile, isTablet, isDesktop, breakpoint, width, height, orientation } = useBreakpoint()

  return (
    <div className="container">
      {/* 基于断点调整布局 */}
      <div className={isMobile ? 'flex-col' : isTablet ? 'flex-row-tablet' : 'flex-row-desktop'}>
        
        {/* 基于断点调整内容 */}
        <h1>
          {isMobile ? '移动端标题' : isTablet ? '平板标题' : '桌面标题'}
        </h1>
        
        <p>当前断点: {breakpoint}</p>
        <p>屏幕宽度: {width}px</p>
        <p>屏幕高度: {height}px</p>
        <p>方向: {orientation}</p>
      </div>
    </div>
  )
}

// 示例 2: 在 ChatMessageBubble 中使用
import { useBreakpoint } from '../hooks/useResponsive'
import { cn } from '../utils/cn'

export function ResponsiveChatMessage({ msg }) {
  const { isMobile, isTablet, isDesktop, breakpoint } = useBreakpoint()

  // 基于屏幕尺寸调整消息气泡样式
  const bubbleClass = cn(
    'px-4 py-3 rounded-2xl',
    {
      'max-w-[95%]': isMobile,           // 移动端更宽
      'max-w-[85%]': isTablet,           // 平板适中
      'max-w-[75%]': isDesktop,          // 桌面更窄
    }
  )

  // 基于屏幕尺寸调整字体大小
  const textClass = cn(
    'leading-relaxed',
    {
      'text-sm': isMobile,               // 移动端稍小
      'text-base': !isMobile,            // 其他保持基准
    }
  )

  return (
    <div className={bubbleClass}>
      <p className={textClass}>{msg.content}</p>
    </div>
  )
}

// 示例 3: 侧边栏响应式
export function ResponsiveSidebar({ isOpen, onToggle }) {
  const { isMobile, isTablet, isDesktop } = useBreakpoint()

  // 基于屏幕尺寸决定侧边栏行为
  const sidebarClass = cn(
    'sidebar',
    {
      'fixed inset-y-0 left-0 z-50': isMobile,        // 移动端全屏覆盖
      'w-64': isTablet,                               // 平板固定宽度
      'w-72': isDesktop,                              // 桌面更宽
      'translate-x-0': isOpen,                        // 打开状态
      '-translate-x-full': isMobile && !isOpen,       // 移动端关闭隐藏
    }
  )

  return <aside className={sidebarClass}>{/* 侧边栏内容 */}</aside>
}

// 示例 4: Markdown 内容响应式
import MarkdownRenderer from '../components/MarkdownRenderer'

export function ResponsiveMarkdown({ content }) {
  const { isMobile, isTablet } = useBreakpoint()

  // 基于屏幕尺寸调整 Markdown 容器
  const containerClass = cn(
    'prose',
    'max-w-none',
    {
      'prose-sm': isMobile,                           // 移动端更紧凑
      'prose-base': !isMobile,                        // 其他保持基准
      'px-2': isMobile,                               // 移动端减少内边距
    }
  )

  return (
    <div className={containerClass}>
      <MarkdownRenderer 
        content={content}
        className={isTablet ? 'compact-code' : ''}
      />
    </div>
  )
}

// 示例 5: 工具栏响应式
export function ResponsiveToolbar({ actions }) {
  const { isMobile, isTablet, isDesktop, width } = useBreakpoint()

  // 基于屏幕宽度决定显示的操作数量
  const visibleActions = isMobile 
    ? actions.slice(0, 3)      // 移动端只显示 3 个
    : isTablet 
      ? actions.slice(0, 5)    // 平板显示 5 个
      : actions                 // 桌面显示全部

  // 基于屏幕尺寸调整工具栏布局
  const toolbarClass = cn(
    'toolbar flex gap-2',
    {
      'justify-between': isMobile,                    // 移动端两端对齐
      'justify-center': !isMobile,                    // 其他居中
    }
  )

  return (
    <div className={toolbarClass}>
      {visibleActions.map(action => (
        <button key={action.id}>{action.label}</button>
      ))}
      
      {/* 移动端显示更多按钮 */}
      {isMobile && actions.length > 3 && (
        <button className="more-btn">•••</button>
      )}
    </div>
  )
}
