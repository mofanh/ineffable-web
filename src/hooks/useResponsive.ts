import { useState, useEffect, useCallback, useRef } from 'react'

/**
 * 响应式断点定义
 * 参考 OpenCode 的响应式设计，支持以下屏幕尺寸：
 * - mobile: < 640px (手机)
 * - tablet: 640px - 1024px (平板)
 * - desktop: >= 1024px (桌面)
 * - wide: >= 1280px (宽屏)
 * - ultra: >= 1536px (超宽)
 */
export type Breakpoint = 'mobile' | 'tablet' | 'desktop' | 'wide' | 'ultra'

export interface ResponsiveState {
  breakpoint: Breakpoint
  width: number
  height: number
  isMobile: boolean
  isTablet: boolean
  isDesktop: boolean
  isWide: boolean
  isUltra: boolean
  orientation: 'portrait' | 'landscape'
  pixelRatio: number
  isTouch: boolean
}

/**
 * 断点配置
 */
const BREAKPOINTS: Record<Breakpoint, number> = {
  mobile: 640,
  tablet: 768,
  desktop: 1024,
  wide: 1280,
  ultra: 1536,
}

/**
 * 获取当前断点
 */
function getBreakpoint(width: number): Breakpoint {
  if (width >= BREAKPOINTS.ultra) return 'ultra'
  if (width >= BREAKPOINTS.wide) return 'wide'
  if (width >= BREAKPOINTS.desktop) return 'desktop'
  if (width >= BREAKPOINTS.tablet) return 'tablet'
  return 'mobile'
}

/**
 * 检测是否为触摸设备
 */
function detectTouch(): boolean {
  if (typeof window === 'undefined') return false
  // 方法1: 检查 ontouchstart 是否存在
  if ('ontouchstart' in window) return true
  // 方法2: 检查 touch points 数量
  if (navigator.maxTouchPoints > 0) return true
  // 方法3: 检查媒体查询（更准确）
  if (window.matchMedia('(pointer: coarse)').matches) return true
  return false
}

/**
 * 响应式设计 Hook
 * 
 * @example
 * const { breakpoint, width, height, isMobile, isTouch } = useResponsive()
 * 
 * // 基于断点调整布局
 * const containerClass = isMobile ? 'flex-col' : 'flex-row'
 */
export function useResponsive(): ResponsiveState {
  const [state, setState] = useState<ResponsiveState>(() => {
    if (typeof window === 'undefined') {
      return {
        breakpoint: 'desktop',
        width: 1024,
        height: 768,
        isMobile: false,
        isTablet: false,
        isDesktop: true,
        isWide: false,
        isUltra: false,
        orientation: 'landscape',
        pixelRatio: 1,
        isTouch: false,
      }
    }

    const width = window.innerWidth
    const height = window.innerHeight
    const breakpoint = getBreakpoint(width)
    const orientation = width > height ? 'landscape' : 'portrait'
    const isTouch = detectTouch()

    return {
      breakpoint,
      width,
      height,
      isMobile: breakpoint === 'mobile',
      isTablet: breakpoint === 'tablet',
      isDesktop: breakpoint === 'desktop',
      isWide: breakpoint === 'wide',
      isUltra: breakpoint === 'ultra',
      orientation,
      pixelRatio: window.devicePixelRatio || 1,
      isTouch,
    }
  })

  useEffect(() => {
    let timeoutId: ReturnType<typeof setTimeout> | null = null

    const handleResize = () => {
      if (timeoutId) {
        clearTimeout(timeoutId)
      }

      timeoutId = setTimeout(() => {
        const width = window.innerWidth
        const height = window.innerHeight
        const breakpoint = getBreakpoint(width)
        const orientation = width > height ? 'landscape' : 'portrait'

        setState(prev => ({
          ...prev,
          breakpoint,
          width,
          height,
          isMobile: breakpoint === 'mobile',
          isTablet: breakpoint === 'tablet',
          isDesktop: breakpoint === 'desktop',
          isWide: breakpoint === 'wide',
          isUltra: breakpoint === 'ultra',
          orientation,
        }))
      }, 100)
    }

    // 初始检查
    handleResize()

    window.addEventListener('resize', handleResize)
    window.addEventListener('orientationchange', handleResize)

    return () => {
      window.removeEventListener('resize', handleResize)
      window.removeEventListener('orientationchange', handleResize)
      if (timeoutId) {
        clearTimeout(timeoutId)
      }
    }
  }, [])

  return state
}

/**
 * 媒体查询 Hook - 自定义媒体查询支持
 * 
 * @param query - CSS 媒体查询字符串
 * @returns 是否匹配媒体查询
 * 
 * @example
 * const isDarkMode = useMediaQuery('(prefers-color-scheme: dark)')
 */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() => {
    if (typeof window === 'undefined') return false
    return window.matchMedia(query).matches
  })

  useEffect(() => {
    if (typeof window === 'undefined') return

    const mediaQuery = window.matchMedia(query)
    mediaQuery.addEventListener('change', (event) => {
      setMatches(event.matches)
    })

    return () => {
      mediaQuery.removeEventListener('change', () => {})
    }
  }, [query])

  return matches
}

/**
 * 常用的断点 Hook
 */
export function useBreakpoint() {
  const state = useResponsive()
  
  return {
    ...state,
    // 便捷方法
    isNarrow: state.isMobile,
    isNarrowOrTablet: state.isMobile || state.isTablet,
    isWideOrUltra: state.isWide || state.isUltra,
    
    // OpenCode 风格的分段
    isSmall: state.width < BREAKPOINTS.tablet,
    isMedium: state.width >= BREAKPOINTS.tablet && state.width < BREAKPOINTS.desktop,
    isLarge: state.width >= BREAKPOINTS.desktop,
  }
}

/**
 * 移动端侧边栏状态管理 Hook
 * 
 * @param defaultOpen - 默认是否打开
 * @returns 侧边栏状态和控制函数
 * 
 * @example
 * const { isOpen, isMobile, toggle, open, close } = useMobileSidebar(true)
 */
export function useMobileSidebar(defaultOpen: boolean = false) {
  const responsive = useResponsive()
  const [isOpen, setIsOpen] = useState(defaultOpen)
  const prevBreakpoint = useRef(responsive.breakpoint)

  // 断点变化时自动调整状态
  useEffect(() => {
    const current = responsive.breakpoint
    const prev = prevBreakpoint.current

    // 从移动端切换到非移动端时，关闭侧边栏
    if (prev === 'mobile' && current !== 'mobile') {
      setIsOpen(false)
    }
    // 从非移动端切换到移动端时，打开侧边栏
    else if (prev !== 'mobile' && current === 'mobile') {
      setIsOpen(true)
    }

    prevBreakpoint.current = current
  }, [responsive.breakpoint])

  // 打开侧边栏
  const open = useCallback(() => {
    setIsOpen(true)
  }, [])

  // 关闭侧边栏
  const close = useCallback(() => {
    setIsOpen(false)
  }, [])

  // 切换侧边栏状态
  const toggle = useCallback(() => {
    setIsOpen(prev => !prev)
  }, [])

  return {
    isOpen: responsive.isMobile ? isOpen : true,  // 非移动端始终打开
    isMobile: responsive.isMobile,
    breakpoint: responsive.breakpoint,
    open,
    close,
    toggle,
    setIsOpen,
  }
}

/**
 * 获取容器宽度范围
 */
export function useContainerWidth(containerRef: React.RefObject<HTMLElement>) {
  const [width, setWidth] = useState(0)

  useEffect(() => {
    if (!containerRef.current) return

    const element = containerRef.current
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setWidth(entry.contentRect.width)
      }
    })
    observer.observe(element)

    return () => observer.disconnect()
  }, [containerRef])

  return width
}

export default useResponsive
